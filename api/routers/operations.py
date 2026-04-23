from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Request

from api.schemas import ServiceMetricsResponse
from api.security import UserPrincipal, require_permissions


router = APIRouter()


DEFAULT_MTTR_MINUTES = 75
COST_PER_MINUTE = 650
SUBSCRIBERS_BY_PROFILE: dict[str, int] = {
    "urban_core": 3400,
    "dense_urban": 4200,
    "enterprise": 2600,
    "transit_hub": 3100,
    "suburban": 1850,
    "coastal_core": 2400,
    "tech_corridor": 2900,
    "growth_corridor": 2200,
    "suburban_mix": 2100,
}


def _estimate_users(profile: str | None) -> int:
    return SUBSCRIBERS_BY_PROFILE.get((profile or "").strip(), 2200)


def _tenant_visible(user: UserPrincipal, operator: str | None) -> bool:
    return user.role == "admin" or user.tenant == "*" or operator == user.tenant


@router.get("/v1/service-metrics", response_model=ServiceMetricsResponse)
async def service_metrics(
    request: Request,
    user: UserPrincipal = Depends(require_permissions("observability:view")),
) -> ServiceMetricsResponse:
    incidents = await request.app.state.incident_workflow.list_incidents(limit=500, include_closed=True)
    visible_incidents = [item for item in incidents if _tenant_visible(user, item.get("operator"))]

    open_incidents = [item for item in visible_incidents if item.get("status") in {"open", "acknowledged", "dispatched"}]
    active_dispatches = [item for item in visible_incidents if item.get("status") == "dispatched"]
    auto_resolved = [item for item in visible_incidents if item.get("status") == "remediated"]

    towers = request.app.state.current_towers
    users_protected = 0
    for incident in auto_resolved:
        tower_id = str(incident.get("tower_id") or "")
        tower = towers.get(tower_id)
        profile = tower.profile if tower is not None else None
        users_protected += _estimate_users(profile)

    auto_resolved_count = len(auto_resolved)
    downtime_avoided_minutes = auto_resolved_count * DEFAULT_MTTR_MINUTES
    cost_saved = downtime_avoided_minutes * COST_PER_MINUTE

    return ServiceMetricsResponse(
        auto_resolved_count=auto_resolved_count,
        downtime_avoided_minutes=downtime_avoided_minutes,
        users_protected=users_protected,
        cost_saved=cost_saved,
        active_dispatches=len(active_dispatches),
        open_incidents=len(open_incidents),
        updated_at=datetime.now(UTC),
    )
