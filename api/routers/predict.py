from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status

from api.observability import raise_alert, record_inference
from api.schemas import ExplainAttribution, ExplainResponse, ForecastPoint, ForecastResponse, KpiWindow, PredictionResponse
from api.security import UserPrincipal, ensure_tenant_access, require_permissions
from model.forecast import forecast_fault_probability


router = APIRouter()


@router.post("/predict", response_model=PredictionResponse)
async def predict(
    request: Request,
    payload: KpiWindow,
    user: UserPrincipal = Depends(require_permissions("predict:run")),
) -> PredictionResponse:
    settings = request.app.state.settings
    tower = request.app.state.current_towers.get(payload.tower_id)
    if tower is not None:
        ensure_tenant_access(user, tower.operator)
    elif settings.is_production_mode and user.role != "admin" and user.tenant != "*":
        raise HTTPException(status_code=404, detail="Tower not found in live state")

    predictor = request.app.state.predictor
    try:
        prediction = predictor.predict(payload.kpi_window)
    except Exception as exc:
        record_inference(
            request.app.state.observability,
            latency_ms=0.0,
            success=False,
            failure_reason=str(exc),
        )
        raise_alert(
            request.app.state.observability,
            level="error",
            code="predict_endpoint_failure",
            message="Prediction endpoint failed to score request payload.",
            context={"tower_id": payload.tower_id},
            dispatcher=getattr(request.app.state, "alert_dispatcher", None),
        )
        raise HTTPException(status_code=503, detail="Prediction inference failed") from exc

    request.app.state.observability["last_model_version"] = prediction.get("model_version")
    record_inference(
        request.app.state.observability,
        latency_ms=float(prediction.get("latency_ms", 0.0)),
        success=True,
    )

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
    ensure_tenant_access(user, status_row.operator)

    simulator = request.app.state.simulator
    telemetry_buffer = request.app.state.telemetry_buffer
    window = None

    if telemetry_buffer is not None:
        window = telemetry_buffer.get_window(tower_id)
    if window is None and simulator is not None:
        window = simulator.get_latest_window(tower_id)
    if window is None:
        raise HTTPException(status_code=503, detail="Telemetry window unavailable for explainability")

    predictor = request.app.state.predictor
    if not predictor.ready:
        raise HTTPException(
            status_code=503,
            detail="Explainability requires trained model artifacts.",
        )

    try:
        details = predictor.explain(window)
    except Exception as exc:
        raise_alert(
            request.app.state.observability,
            level="error",
            code="explain_endpoint_failure",
            message="Explainability endpoint failed to generate attribution payload.",
            context={"tower_id": tower_id},
            dispatcher=getattr(request.app.state, "alert_dispatcher", None),
        )
        raise HTTPException(status_code=503, detail="Explainability inference failed") from exc

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
    ensure_tenant_access(user, status_row.operator)

    predictor = request.app.state.predictor
    if not predictor.ready:
        raise HTTPException(
            status_code=503,
            detail="Forecast endpoint requires trained model artifacts.",
        )

    try:
        points = [
            ForecastPoint(**entry)
            for entry in forecast_fault_probability(
                predictor,
                list(status_row.kpi_history),
                settings=request.app.state.forecast_settings,
            )
        ]
    except Exception as exc:
        raise_alert(
            request.app.state.observability,
            level="error",
            code="forecast_endpoint_failure",
            message="Forecast endpoint failed to generate model-based horizon projections.",
            context={"tower_id": tower_id},
            dispatcher=getattr(request.app.state, "alert_dispatcher", None),
        )
        raise HTTPException(status_code=503, detail="Forecast inference failed") from exc

    await request.app.state.audit_logger.write(
        event="prediction.forecast",
        actor=user,
        resource=tower_id,
        action="forecast",
        outcome="success",
        details={"method": "model-monte-carlo", "steps": len(points)},
        request_id=getattr(request.state, "request_id", None),
    )

    return ForecastResponse(
        tower_id=tower_id,
        forecast_horizon_minutes=len(points) * request.app.state.forecast_settings.step_minutes,
        forecast=points,
        method="model-monte-carlo",
    )
