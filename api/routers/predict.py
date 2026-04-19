from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status

from api.schemas import ExplainAttribution, ExplainResponse, ForecastPoint, ForecastResponse, KpiWindow, PredictionResponse
from api.security import UserPrincipal, require_permissions


router = APIRouter()


@router.post("/predict", response_model=PredictionResponse)
async def predict(
    request: Request,
    payload: KpiWindow,
    user: UserPrincipal = Depends(require_permissions("predict:run")),
) -> PredictionResponse:
    predictor = request.app.state.predictor
    prediction = predictor.predict(payload.kpi_window)

    request.app.state.observability["last_model_version"] = prediction.get("model_version")
    request.app.state.observability["last_inference_latency_ms"] = prediction.get("latency_ms", 0.0)
    request.app.state.observability["inference_count"] += 1

    await request.app.state.audit_logger.write(
        event="prediction.run",
        actor=user,
        resource=payload.tower_id,
        action="predict",
        outcome="success",
        details={
            "fault_type": prediction["fault_type"],
            "fault_probability": round(float(prediction["fault_probability"]), 4),
            "model_version": prediction.get("model_version"),
            "latency_ms": prediction.get("latency_ms", 0.0),
        },
        request_id=getattr(request.state, "request_id", None),
    )

    return PredictionResponse(
        tower_id=payload.tower_id,
        timestamp=datetime.now(UTC),
        fault_probability=prediction["fault_probability"],
        fault_type=prediction["fault_type"],
        lead_time_minutes=prediction["lead_time_minutes"],
        confidence=prediction["confidence"],
    )


@router.get("/v1/explain/{tower_id}", response_model=ExplainResponse)
async def explain_prediction(
    request: Request,
    tower_id: str,
    user: UserPrincipal = Depends(require_permissions("predict:run")),
) -> ExplainResponse:
    status_row = request.app.state.current_towers.get(tower_id)
    if not status_row:
        raise HTTPException(status_code=404, detail="Tower not found in live state")

    simulator = request.app.state.simulator
    telemetry_buffer = request.app.state.telemetry_buffer
    window = None

    if telemetry_buffer is not None:
        window = telemetry_buffer.get_window(tower_id)
    if window is None and simulator is not None:
        window = simulator.get_latest_window(tower_id)
    if window is None:
        window = [[status_row.kpis.rsrp, status_row.kpis.sinr, status_row.kpis.dl_throughput, status_row.kpis.ul_throughput, status_row.kpis.ho_failure_rate, status_row.kpis.rtt] for _ in range(30)]

    predictor = request.app.state.predictor
    details = predictor.explain(window)

    await request.app.state.audit_logger.write(
        event="prediction.explain",
        actor=user,
        resource=tower_id,
        action="explain",
        outcome="success",
        details={"model_version": details.get("model"), "method": details.get("method")},
        request_id=getattr(request.state, "request_id", None),
    )

    sorted_attributions = sorted(details["attributions"].items(), key=lambda item: item[1], reverse=True)
    return ExplainResponse(
        tower_id=tower_id,
        timestamp=datetime.now(UTC),
        model=str(details["model"]),
        method=str(details["method"]),
        base_value=float(details["base_value"]),
        output_value=float(details["output_value"]),
        attributions=[ExplainAttribution(feature=name, impact=float(value)) for name, value in sorted_attributions],
        note=str(details["note"]),
    )


@router.get("/v1/forecast/{tower_id}", response_model=ForecastResponse)
async def forecast_prediction(
    request: Request,
    tower_id: str,
    user: UserPrincipal = Depends(require_permissions("predict:run")),
) -> ForecastResponse:
    settings = request.app.state.settings
    if not settings.enable_forecast_endpoint:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Forecast endpoint is disabled until production-grade forecasting is enabled.",
        )

    status_row = request.app.state.current_towers.get(tower_id)
    if not status_row:
        raise HTTPException(status_code=404, detail="Tower not found in live state")

    history = list(status_row.kpi_history)[-8:]
    if len(history) < 2:
        history = [status_row.kpis, status_row.kpis]

    rtt_delta = history[-1].rtt - history[0].rtt
    ho_delta = history[-1].ho_failure_rate - history[0].ho_failure_rate
    dl_delta = history[-1].dl_throughput - history[0].dl_throughput
    sinr_delta = history[-1].sinr - history[0].sinr

    trend_signal = (rtt_delta / 160.0) + (ho_delta / 8.0) - (dl_delta / 500.0) - (sinr_delta / 30.0)
    step_delta = max(-0.04, min(0.06, trend_signal * 0.015))

    base = float(status_row.fault_probability)
    now = datetime.now(UTC)
    points: list[ForecastPoint] = []
    for step in range(1, 11):
        projected = max(0.01, min(0.99, base + (step * step_delta)))
        spread = min(0.35, 0.03 + step * 0.01)
        points.append(
            ForecastPoint(
                step_minutes_ahead=step * 5,
                timestamp=now + timedelta(minutes=step * 5),
                predicted_probability=round(projected, 4),
                confidence_lower=round(max(0.0, projected - spread), 4),
                confidence_upper=round(min(1.0, projected + spread), 4),
            )
        )

    await request.app.state.audit_logger.write(
        event="prediction.forecast",
        actor=user,
        resource=tower_id,
        action="forecast",
        outcome="success",
        details={"method": "kpi-trend-extrapolation", "steps": 10},
        request_id=getattr(request.state, "request_id", None),
    )

    return ForecastResponse(
        tower_id=tower_id,
        forecast_horizon_minutes=50,
        forecast=points,
        method="kpi-trend-extrapolation",
    )
