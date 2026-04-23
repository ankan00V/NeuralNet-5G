from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from api.schemas import IncidentActionRequest, IncidentListResponse, IncidentRecord
from api.security import UserPrincipal, ensure_tenant_access, require_permissions


router = APIRouter()


@router.get("/v1/incidents", response_model=IncidentListResponse)
async def list_incidents(
    request: Request,
    include_closed: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
    user: UserPrincipal = Depends(require_permissions("incident:view")),
) -> IncidentListResponse:
    incidents = await request.app.state.incident_workflow.list_incidents(limit=limit, include_closed=include_closed)
    filtered = [
        incident
        for incident in incidents
        if user.role == "admin" or user.tenant == "*" or incident.get("operator") == user.tenant
    ]
    records = [IncidentRecord.model_validate(item) for item in filtered]
    return IncidentListResponse(incidents=records, count=len(records))


@router.get("/v1/incidents/{incident_id}", response_model=IncidentRecord)
async def get_incident(
    request: Request,
    incident_id: str,
    user: UserPrincipal = Depends(require_permissions("incident:view")),
) -> IncidentRecord:
    incident = await request.app.state.incident_workflow.get_incident(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="incident not found")
    ensure_tenant_access(user, incident.get("operator"))
    return IncidentRecord.model_validate(incident)


async def _transition(
    request: Request,
    incident_id: str,
    status_name: str,
    payload: IncidentActionRequest,
    user: UserPrincipal,
) -> dict:
    incident = await request.app.state.incident_workflow.get_incident(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="incident not found")
    ensure_tenant_access(user, incident.get("operator"))

    updated = await request.app.state.incident_workflow.transition(
        incident_id,
        status_name,
        user,
        payload.details,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="incident not found")

    await request.app.state.audit_logger.write(
        event=f"incident.{status_name}",
        actor=user,
        resource=incident_id,
        action=status_name,
        outcome="success",
        details=payload.details,
        request_id=getattr(request.state, "request_id", None),
    )

    return {
        "status": "ok",
        "incident_id": incident_id,
        "incident_status": status_name,
        "updated_at": updated["updated_at"],
    }


@router.post("/v1/incidents/{incident_id}/acknowledge")
async def acknowledge_incident(
    request: Request,
    incident_id: str,
    payload: IncidentActionRequest,
    user: UserPrincipal = Depends(require_permissions("incident:act")),
) -> dict:
    return await _transition(request, incident_id, "acknowledged", payload, user)


@router.post("/v1/incidents/{incident_id}/dispatch")
async def dispatch_incident(
    request: Request,
    incident_id: str,
    payload: IncidentActionRequest,
    user: UserPrincipal = Depends(require_permissions("incident:act")),
) -> dict:
    return await _transition(request, incident_id, "dispatched", payload, user)


@router.post("/v1/incidents/{incident_id}/remediate")
async def remediate_incident(
    request: Request,
    incident_id: str,
    payload: IncidentActionRequest,
    user: UserPrincipal = Depends(require_permissions("incident:act")),
) -> dict:
    return await _transition(request, incident_id, "remediated", payload, user)


@router.post("/v1/incidents/{incident_id}/fail")
async def fail_incident(
    request: Request,
    incident_id: str,
    payload: IncidentActionRequest,
    user: UserPrincipal = Depends(require_permissions("incident:act")),
) -> dict:
    return await _transition(request, incident_id, "failed", payload, user)


@router.post("/v1/incidents/{incident_id}/rollback")
async def rollback_incident(
    request: Request,
    incident_id: str,
    payload: IncidentActionRequest,
    user: UserPrincipal = Depends(require_permissions("incident:act")),
) -> dict:
    return await _transition(request, incident_id, "rolled_back", payload, user)


@router.post("/v1/incidents/{incident_id}/close")
async def close_incident(
    request: Request,
    incident_id: str,
    payload: IncidentActionRequest,
    user: UserPrincipal = Depends(require_permissions("incident:act")),
) -> dict:
    return await _transition(request, incident_id, "closed", payload, user)


@router.post("/v1/incidents/{incident_id}/note")
async def note_incident(
    request: Request,
    incident_id: str,
    payload: IncidentActionRequest,
    user: UserPrincipal = Depends(require_permissions("incident:act")),
) -> dict:
    incident = await request.app.state.incident_workflow.get_incident(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="incident not found")
    ensure_tenant_access(user, incident.get("operator"))

    updated = await request.app.state.incident_workflow.append_event(
        incident_id,
        "operator_note",
        user,
        payload.details,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="incident not found")

    await request.app.state.audit_logger.write(
        event="incident.note",
        actor=user,
        resource=incident_id,
        action="note",
        outcome="success",
        details=payload.details,
        request_id=getattr(request.state, "request_id", None),
    )

    return {
        "status": "ok",
        "incident_id": incident_id,
        "incident_status": updated["status"],
        "updated_at": updated["updated_at"],
    }


@router.post("/v1/incidents/{incident_id}/verify")
async def verify_incident(
    request: Request,
    incident_id: str,
    payload: IncidentActionRequest,
    user: UserPrincipal = Depends(require_permissions("incident:act")),
) -> dict:
    incident = await request.app.state.incident_workflow.get_incident(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="incident not found")
    ensure_tenant_access(user, incident.get("operator"))

    updated = await request.app.state.incident_workflow.append_event(
        incident_id,
        "resolution_verified",
        user,
        payload.details,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="incident not found")

    await request.app.state.audit_logger.write(
        event="incident.verify",
        actor=user,
        resource=incident_id,
        action="verify",
        outcome="success",
        details=payload.details,
        request_id=getattr(request.state, "request_id", None),
    )

    return {
        "status": "ok",
        "incident_id": incident_id,
        "incident_status": updated["status"],
        "updated_at": updated["updated_at"],
    }
