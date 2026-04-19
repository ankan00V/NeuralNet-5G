from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status

from api.mongo import MongoStorage
from api.schemas import AcknowledgeRequest, FaultInjectionRequest, ResetTowerRequest, TowerListResponse
from api.security import UserPrincipal, ensure_tenant_access, require_permissions, require_roles


router = APIRouter()


@router.get("/towers", response_model=TowerListResponse)
async def list_towers(request: Request, user: UserPrincipal = Depends(require_permissions("tower:view"))) -> TowerListResponse:
    storage: MongoStorage | None = request.app.state.mongo_storage
    towers = []
    if storage is not None:
        towers = await storage.list_towers()
        if towers:
            filtered = [
                tower for tower in towers if user.role == "admin" or user.tenant == "*" or tower.operator == user.tenant
            ]
            return TowerListResponse(towers=filtered, timestamp=request.app.state.last_broadcast_at)

    live_towers = list(request.app.state.current_towers.values())
    filtered = [
        tower for tower in live_towers if user.role == "admin" or user.tenant == "*" or tower.operator == user.tenant
    ]
    return TowerListResponse(towers=filtered, timestamp=request.app.state.last_broadcast_at)


@router.post("/acknowledge")
async def acknowledge_alert(
    request: Request,
    payload: AcknowledgeRequest,
    user: UserPrincipal = Depends(require_permissions("tower:acknowledge", "incident:act")),
) -> dict:
    tower = request.app.state.current_towers.get(payload.tower_id)
    if tower is None:
        raise HTTPException(status_code=404, detail="tower not found")
    ensure_tenant_access(user, tower.operator)

    request.app.state.acknowledged_alerts[payload.alert_id] = payload.tower_id
    tower.acknowledged = True
    storage: MongoStorage | None = request.app.state.mongo_storage
    if storage is not None:
        await storage.acknowledge_alert(payload.tower_id, payload.alert_id)

    incident = await request.app.state.incident_workflow.get_open_incident_for_tower(payload.tower_id)
    if incident is not None:
        updated = await request.app.state.incident_workflow.transition(
            incident["incident_id"],
            "acknowledged",
            user,
            details={"alert_id": payload.alert_id},
        )
        if updated is not None:
            tower.incident_id = updated["incident_id"]

    await request.app.state.audit_logger.write(
        event="tower.acknowledge",
        actor=user,
        resource=payload.tower_id,
        action="acknowledge-alert",
        outcome="success",
        details={"alert_id": payload.alert_id},
        request_id=getattr(request.state, "request_id", None),
    )
    return {"status": "acknowledged", "tower_id": payload.tower_id, "alert_id": payload.alert_id}


@router.post("/dev/inject-fault")
async def inject_fault(
    request: Request,
    payload: FaultInjectionRequest,
    user: UserPrincipal = Depends(require_roles("admin")),
) -> dict:
    settings = request.app.state.settings
    if not (settings.is_demo_mode and settings.enable_dev_endpoints):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="dev endpoint disabled")

    tower = request.app.state.current_towers.get(payload.tower_id)
    if tower is None:
        raise HTTPException(status_code=404, detail="tower not found")
    ensure_tenant_access(user, tower.operator)

    simulator = request.app.state.simulator
    if simulator is None:
        raise HTTPException(status_code=503, detail="simulator unavailable in production mode")

    simulator.inject_fault(
        payload.tower_id,
        payload.fault_type,
        payload.severity,
        payload.duration_steps,
        payload.precursor_steps,
    )
    await request.app.state.audit_logger.write(
        event="tower.dev-inject",
        actor=user,
        resource=payload.tower_id,
        action="inject-fault",
        outcome="queued",
        details={"fault_type": payload.fault_type, "severity": payload.severity},
        request_id=getattr(request.state, "request_id", None),
    )
    return {"status": "queued", "tower_id": payload.tower_id, "fault_type": payload.fault_type}


@router.post("/dev/reset-tower")
async def reset_tower(
    request: Request,
    payload: ResetTowerRequest,
    user: UserPrincipal = Depends(require_roles("admin")),
) -> dict:
    settings = request.app.state.settings
    if not (settings.is_demo_mode and settings.enable_dev_endpoints):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="dev endpoint disabled")

    tower = request.app.state.current_towers.get(payload.tower_id)
    if tower is None:
        raise HTTPException(status_code=404, detail="tower not found")
    ensure_tenant_access(user, tower.operator)

    simulator = request.app.state.simulator
    if simulator is None:
        raise HTTPException(status_code=503, detail="simulator unavailable in production mode")
    simulator.reset_tower(payload.tower_id)

    open_incident = await request.app.state.incident_workflow.get_open_incident_for_tower(payload.tower_id)
    if open_incident is not None:
        await request.app.state.incident_workflow.transition(open_incident["incident_id"], "remediated", user)

    await request.app.state.audit_logger.write(
        event="tower.dev-reset",
        actor=user,
        resource=payload.tower_id,
        action="reset-fault",
        outcome="success",
        request_id=getattr(request.state, "request_id", None),
    )
    return {"status": "reset", "tower_id": payload.tower_id}
