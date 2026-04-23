from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status

from api.observability import raise_alert
from api.schemas import TelemetryBatchRequest, TelemetryIngestRequest
from api.security import UserPrincipal, require_ingestion_access


router = APIRouter()


@router.post("/v1/ingest/telemetry")
async def ingest_single_telemetry(
    request: Request,
    payload: TelemetryIngestRequest,
    identity: UserPrincipal | None = Depends(require_ingestion_access),
) -> dict:
    settings = request.app.state.settings
    if settings.is_production_mode and settings.ingestion_mode == "simulator":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="External telemetry ingestion is disabled by INGESTION_MODE=simulator",
        )

    request.app.state.telemetry_buffer.ingest(payload.model_dump())
    request.app.state.observability["telemetry_last_ingested_at"] = datetime.now(UTC).isoformat()
    await request.app.state.audit_logger.write(
        event="ingestion.telemetry",
        actor=identity,
        resource="telemetry",
        action="ingest-single",
        outcome="accepted",
        details={"tower_id": payload.tower_id, "source": payload.source},
        request_id=getattr(request.state, "request_id", None),
    )
    return {"status": "accepted", "tower_id": payload.tower_id, "ingested_at": datetime.now(UTC).isoformat()}


@router.post("/v1/ingest/telemetry/batch")
async def ingest_batch_telemetry(
    request: Request,
    payload: TelemetryBatchRequest,
    identity: UserPrincipal | None = Depends(require_ingestion_access),
) -> dict:
    settings = request.app.state.settings
    if settings.is_production_mode and settings.ingestion_mode == "simulator":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="External telemetry ingestion is disabled by INGESTION_MODE=simulator",
        )

    for event in payload.events:
        request.app.state.telemetry_buffer.ingest(event.model_dump())
    request.app.state.observability["telemetry_last_ingested_at"] = datetime.now(UTC).isoformat()

    if len(payload.events) >= 200:
        raise_alert(
            request.app.state.observability,
            level="info",
            code="ingestion_high_volume_batch",
            message="High-volume telemetry batch ingested.",
            context={"count": len(payload.events)},
            dispatcher=getattr(request.app.state, "alert_dispatcher", None),
        )

    await request.app.state.audit_logger.write(
        event="ingestion.telemetry",
        actor=identity,
        resource="telemetry",
        action="ingest-batch",
        outcome="accepted",
        details={
            "count": len(payload.events),
            "tower_ids": sorted({event.tower_id for event in payload.events})[:20],
        },
        request_id=getattr(request.state, "request_id", None),
    )

    return {
        "status": "accepted",
        "count": len(payload.events),
        "ingested_at": datetime.now(UTC).isoformat(),
    }
