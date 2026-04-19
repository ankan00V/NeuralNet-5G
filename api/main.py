from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import numpy as np

from api.audit import AuditLogger
from api.config import AppSettings, ConfigError, load_settings
from api.middleware import BodySizeLimitMiddleware, RateLimitMiddleware, RequestContextMiddleware, StructuredAccessLogMiddleware
from api.mongo import MongoStorage
from api.recommender import SelfHealingRecommender
from api.routers import auth, incidents, ingestion, predict, recommend, towers
from api.schemas import KpiSnapshotResponse, TowerStatus
from api.security import AuthService, UserPrincipal, get_optional_user
from api.telemetry import TelemetryBuffer
from api.websocket_manager import ConnectionManager
from api.workflow import IncidentWorkflow
from data.simulator import NetworkSimulator
from model.inference import FaultPredictor
from model.feature_engineering import RAW_FEATURES


load_dotenv()
logger = logging.getLogger("neuralnet5g.api")
logging.basicConfig(level=logging.INFO)


FAULT_TRACE_THRESHOLD = 0.5


def tower_status_from_probability(probability: float) -> str:
    if probability > 0.7:
        return "red"
    if probability > 0.3:
        return "amber"
    return "green"


async def _collect_tower_windows(app: FastAPI) -> dict[str, dict]:
    settings: AppSettings = app.state.settings
    data: dict[str, dict] = {}

    simulator: NetworkSimulator | None = app.state.simulator
    telemetry_buffer: TelemetryBuffer = app.state.telemetry_buffer

    use_simulator = simulator is not None and settings.ingestion_mode in {"simulator", "hybrid"}
    use_telemetry = settings.ingestion_mode in {"external", "hybrid"} or settings.is_production_mode

    if use_simulator and simulator is not None:
        for row in simulator.get_latest_tower_rows():
            tower_id = row["tower_id"]
            data[tower_id] = {
                "tower_id": tower_id,
                "row": row,
                "window": simulator.get_latest_window(tower_id),
                "source": "simulator",
            }

    if use_telemetry:
        now = datetime.now(UTC)
        for tower_id in telemetry_buffer.list_tower_ids():
            if not telemetry_buffer.has_recent_window(tower_id, now=now):
                continue
            row = telemetry_buffer.get_latest_row(tower_id)
            window = telemetry_buffer.get_window(tower_id)
            if row is None or window is None:
                continue
            data[tower_id] = {
                "tower_id": tower_id,
                "row": row,
                "window": window,
                "source": "telemetry",
            }

    return data


async def build_tower_payload(app: FastAPI) -> dict:
    predictor: FaultPredictor = app.state.predictor
    recommender: SelfHealingRecommender = app.state.recommender
    current_towers: dict[str, TowerStatus] = {}
    broadcast_time = datetime.now(UTC)

    windows_by_tower = await _collect_tower_windows(app)
    latency_samples: list[float] = []

    for tower_id, tower_input in windows_by_tower.items():
        row = tower_input["row"]
        window = tower_input["window"]
        prediction = predictor.predict(window)

        if app.state.settings.is_demo_mode and row.get("fault_type") and row["fault_type"] != "normal":
            prediction["fault_type"] = row["fault_type"]
            prediction["fault_probability"] = max(prediction["fault_probability"], 0.78)
            prediction["confidence"] = max(prediction["confidence"], prediction["fault_probability"])
            prediction["lead_time_minutes"] = min(prediction["lead_time_minutes"], 12)

        latency_samples.append(float(prediction.get("latency_ms", 0.0)))

        recommendations = recommender.recommend(
            prediction["fault_type"],
            prediction["fault_probability"],
            tower_id,
        )

        if tower_input["source"] == "simulator" and app.state.simulator is not None:
            history = [
                KpiSnapshotResponse(**history_row)
                for history_row in list(app.state.simulator.towers[tower_id].history)[-30:]
            ]
        else:
            history_rows = list(app.state.telemetry_buffer.windows.get(tower_id, []))[-30:]
            history = [
                KpiSnapshotResponse(
                    tower_id=tower_id,
                    timestamp=row["timestamp"],
                    rsrp=float(values[0]),
                    sinr=float(values[1]),
                    dl_throughput=float(values[2]),
                    ul_throughput=float(values[3]),
                    ho_failure_rate=float(values[4]),
                    rtt=float(values[5]),
                    lat=row.get("lat"),
                    lon=row.get("lon"),
                    city=row.get("city"),
                )
                for values in history_rows
            ]
            if not history:
                history = [KpiSnapshotResponse(**row)] * 30

        status_record = TowerStatus(
            tower_id=tower_id,
            status=tower_status_from_probability(prediction["fault_probability"]),
            last_updated=broadcast_time,
            kpis=KpiSnapshotResponse(**row),
            kpi_history=history,
            fault_probability=prediction["fault_probability"],
            fault_type=prediction["fault_type"],
            lead_time_minutes=prediction["lead_time_minutes"],
            confidence=prediction["confidence"],
            top_action=recommendations[0]["action_name"] if recommendations else "none",
            recommendations=recommendations,
            acknowledged=tower_id in app.state.acknowledged_alerts.values(),
            lat=row.get("lat"),
            lon=row.get("lon"),
            city=row.get("city"),
            operator=row.get("operator"),
            profile=row.get("profile"),
            state_phase=row.get("state_phase"),
        )

        incident = await app.state.incident_workflow.upsert_from_prediction(status_record.model_dump(mode="json"))
        if incident is not None:
            status_record.incident_id = incident.get("incident_id")

        current_towers[tower_id] = status_record

    app.state.current_towers = current_towers
    app.state.last_broadcast_at = broadcast_time

    if latency_samples:
        app.state.observability["last_inference_latency_ms"] = round(sum(latency_samples) / len(latency_samples), 3)

    app.state.observability["last_model_version"] = predictor.model_version
    app.state.observability["tower_count"] = len(current_towers)
    if current_towers and app.state.drift_baseline:
        observed = {
            "rsrp": float(np.mean([tower.kpis.rsrp for tower in current_towers.values()])),
            "sinr": float(np.mean([tower.kpis.sinr for tower in current_towers.values()])),
            "dl_throughput": float(np.mean([tower.kpis.dl_throughput for tower in current_towers.values()])),
            "ul_throughput": float(np.mean([tower.kpis.ul_throughput for tower in current_towers.values()])),
            "ho_failure_rate": float(np.mean([tower.kpis.ho_failure_rate for tower in current_towers.values()])),
            "rtt": float(np.mean([tower.kpis.rtt for tower in current_towers.values()])),
        }
        z_scores = []
        for feature in RAW_FEATURES:
            baseline = app.state.drift_baseline.get(feature)
            if not baseline:
                continue
            std = max(1e-6, float(baseline.get("std", 1.0)))
            mean = float(baseline.get("mean", 0.0))
            z_scores.append(abs((observed[feature] - mean) / std))
        drift_score = float(sum(z_scores) / len(z_scores)) if z_scores else 0.0
        app.state.observability["drift_score"] = round(drift_score, 4)
        app.state.observability["drift_alert"] = drift_score >= 3.0

    storage: MongoStorage | None = app.state.mongo_storage
    if storage is not None:
        try:
            await storage.upsert_towers(current_towers.values(), app.state.last_broadcast_at)
            for tower in current_towers.values():
                if tower.fault_type != "normal" and tower.fault_probability > FAULT_TRACE_THRESHOLD:
                    trace = {
                        "trace_id": str(uuid.uuid4()),
                        "tower_id": tower.tower_id,
                        "timestamp": broadcast_time.isoformat(),
                        "model": predictor.model_version,
                        "fault_type": tower.fault_type,
                        "fault_probability": round(tower.fault_probability, 4),
                        "lead_time_minutes": tower.lead_time_minutes,
                        "confidence": round(tower.confidence, 4),
                        "top_action": tower.top_action,
                        "status": tower.status,
                        "city": tower.city,
                    }
                    await storage.write_trace_log(trace)
        except Exception as exc:  # pragma: no cover - depends on external service
            logger.warning("MongoDB persistence failed during tower sync: %s", exc)
    else:
        in_mem: list = app.state.in_mem_trace
        for tower in current_towers.values():
            if tower.fault_type != "normal" and tower.fault_probability > FAULT_TRACE_THRESHOLD:
                in_mem.insert(
                    0,
                    {
                        "trace_id": str(uuid.uuid4()),
                        "tower_id": tower.tower_id,
                        "timestamp": broadcast_time.isoformat(),
                        "model": predictor.model_version,
                        "fault_type": tower.fault_type,
                        "fault_probability": round(tower.fault_probability, 4),
                        "lead_time_minutes": tower.lead_time_minutes,
                        "top_action": tower.top_action,
                        "status": tower.status,
                    },
                )
        del in_mem[200:]

    return {
        "event": "tower_update",
        "timestamp": app.state.last_broadcast_at.isoformat(),
        "towers": [tower.model_dump(mode="json") for tower in current_towers.values()],
    }


async def broadcaster(app: FastAPI) -> None:
    interval = app.state.settings.ws_broadcast_interval
    while True:
        if app.state.simulator is not None and app.state.settings.ingestion_mode in {"simulator", "hybrid"}:
            app.state.simulator.advance_all(steps=max(1, interval))
        payload = await build_tower_payload(app)
        await app.state.connection_manager.broadcast_json(payload)
        await asyncio.sleep(interval)


async def _enforce_model_gate(app: FastAPI) -> None:
    settings = app.state.settings
    if not settings.model_gate_enforced:
        return

    metrics_path = app.state.root / "model" / "metrics.json"
    if not metrics_path.exists():
        raise RuntimeError("Model gate enforced but model/metrics.json is missing")

    metrics = json.loads(metrics_path.read_text())
    macro_f1 = float(metrics.get("macro_f1", 0.0))
    if macro_f1 < settings.model_min_macro_f1:
        raise RuntimeError(
            f"Model gate failed: macro_f1={macro_f1:.4f} < required={settings.model_min_macro_f1:.4f}"
        )

    per_class = metrics.get("per_class", {})
    for class_name in ("congestion", "coverage_degradation", "hardware_anomaly"):
        f1_value = float((per_class.get(class_name) or {}).get("f1-score", 0.0))
        if f1_value < settings.model_min_class_f1:
            raise RuntimeError(
                f"Model gate failed: class={class_name} f1={f1_value:.4f} < required={settings.model_min_class_f1:.4f}"
            )


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.ready = False
    app.state.startup_error = None
    app.state.root = Path(__file__).resolve().parents[1]

    try:
        app.state.settings = load_settings()
    except ConfigError as exc:
        app.state.startup_error = str(exc)
        logger.error("Configuration error: %s", exc)
        raise

    settings: AppSettings = app.state.settings
    app.state.predictor = FaultPredictor().load()
    app.state.recommender = SelfHealingRecommender()
    app.state.connection_manager = ConnectionManager()
    app.state.current_towers = {}
    app.state.acknowledged_alerts = {}
    app.state.last_broadcast_at = datetime.now(UTC)
    app.state.telemetry_buffer = TelemetryBuffer(window_size=30, stale_after_seconds=180)
    app.state.simulator = (
        NetworkSimulator(seed=42)
        if settings.is_demo_mode or settings.ingestion_mode in {"simulator", "hybrid"}
        else None
    )

    app.state.mongo_storage = await MongoStorage.connect_from_env()
    app.state.audit_logger = AuditLogger(app.state.mongo_storage, signing_key=settings.audit_signing_key)
    app.state.auth_service = AuthService(settings)
    app.state.incident_workflow = IncidentWorkflow(
        app.state.mongo_storage,
        open_probability_threshold=settings.fault_open_probability_threshold,
    )
    app.state.in_mem_trace = []
    app.state.drift_baseline = {}
    metadata_path = app.state.root / "model" / "train_metadata.json"
    if metadata_path.exists():
        try:
            metadata = json.loads(metadata_path.read_text())
            app.state.drift_baseline = metadata.get("raw_feature_baseline", {}) or {}
        except Exception as exc:
            logger.warning("Failed to load drift baseline metadata: %s", exc)

    app.state.observability = {
        "request_count": 0,
        "inference_count": 0,
        "tower_count": 0,
        "last_request_at": None,
        "last_request_latency_ms": 0.0,
        "last_inference_latency_ms": 0.0,
        "last_model_version": app.state.predictor.model_version,
        "drift_alert": False,
        "drift_score": 0.0,
    }

    if app.state.mongo_storage is not None:
        try:
            app.state.acknowledged_alerts = await app.state.mongo_storage.load_acknowledged_alerts()
        except Exception as exc:  # pragma: no cover - depends on external service
            logger.warning("MongoDB acknowledgement preload failed: %s", exc)

    await _enforce_model_gate(app)
    await build_tower_payload(app)
    broadcast_task = asyncio.create_task(broadcaster(app))
    app.state.ready = True
    try:
        yield
    finally:
        app.state.ready = False
        broadcast_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await broadcast_task
        if app.state.mongo_storage is not None:
            await app.state.mongo_storage.close()


app = FastAPI(title="NeuralNet5G API", lifespan=lifespan)
app.logger = logger

try:
    bootstrap_settings = load_settings()
except Exception:
    bootstrap_settings = None

if bootstrap_settings is not None:
    cors_origins = bootstrap_settings.cors_origins
else:
    cors_origins = ["*"]

app.add_middleware(RequestContextMiddleware)
app.add_middleware(StructuredAccessLogMiddleware)
if bootstrap_settings is not None:
    app.add_middleware(BodySizeLimitMiddleware, max_bytes=bootstrap_settings.request_max_bytes)
    app.add_middleware(
        RateLimitMiddleware,
        per_minute=bootstrap_settings.rate_limit_per_minute,
        burst=bootstrap_settings.rate_limit_burst,
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if cors_origins == ["*"] else cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# API routers are served under /api; unprefixed legacy routes stay available only in demo mode.
app.include_router(predict.router, prefix="/api")
app.include_router(recommend.router, prefix="/api")
app.include_router(towers.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(ingestion.router, prefix="/api")
app.include_router(incidents.router, prefix="/api")

if bootstrap_settings is not None and bootstrap_settings.is_demo_mode:
    app.include_router(predict.router)
    app.include_router(recommend.router)
    app.include_router(towers.router)


@app.get("/health/live")
@app.get("/api/health/live")
async def liveness() -> dict:
    return {"status": "ok", "timestamp": datetime.now(UTC).isoformat()}


@app.get("/health/ready")
@app.get("/api/health/ready")
async def readiness() -> dict:
    ready = bool(getattr(app.state, "ready", False))
    startup_error = getattr(app.state, "startup_error", None)
    status_label = "ready" if ready else "not-ready"
    return {
        "status": status_label,
        "timestamp": datetime.now(UTC).isoformat(),
        "storage": "mongodb" if getattr(app.state, "mongo_storage", None) is not None else "memory",
        "app_mode": getattr(app.state, "settings", None).app_mode if getattr(app.state, "settings", None) else "unknown",
        "error": startup_error,
    }


@app.get("/health")
@app.get("/api/health")
async def health_legacy() -> dict:
    ready_payload = await readiness()
    return {
        "status": "ok" if ready_payload["status"] == "ready" else "degraded",
        "timestamp": ready_payload["timestamp"],
        "storage": ready_payload["storage"],
        "app_mode": ready_payload["app_mode"],
    }


@app.get("/api/v1/audit-log")
async def audit_log(limit: int = 50, user: UserPrincipal | None = Depends(get_optional_user)) -> dict:
    if user is None:
        return {"count": 0, "records": []}
    records = await app.state.audit_logger.list(limit=min(limit, 200))
    return {
        "count": len(records),
        "model": app.state.predictor.model_version,
        "description": "Signed AI action and operator audit records.",
        "records": records,
    }


@app.get("/api/v1/observability")
async def observability_snapshot(user: UserPrincipal | None = Depends(get_optional_user)) -> dict:
    if user is None:
        return {"status": "unauthenticated"}
    obs = dict(app.state.observability)
    obs["mode"] = app.state.settings.app_mode
    obs["storage"] = "mongodb" if app.state.mongo_storage is not None else "memory"
    return obs


@app.websocket("/api/ws/live")
@app.websocket("/ws/live")
async def websocket_live(websocket: WebSocket) -> None:
    manager: ConnectionManager = app.state.connection_manager
    await manager.connect(websocket)
    try:
        initial = {
            "event": "tower_update",
            "timestamp": app.state.last_broadcast_at.isoformat(),
            "towers": [tower.model_dump(mode="json") for tower in app.state.current_towers.values()],
        }
        await websocket.send_json(initial)
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
