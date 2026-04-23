from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from api.schemas import RecommendationRequest, RecommendationResponse
from api.security import UserPrincipal, ensure_tenant_access, require_permissions


router = APIRouter()


@router.post("/recommend", response_model=RecommendationResponse)
async def recommend(
    request: Request,
    payload: RecommendationRequest,
    user: UserPrincipal = Depends(require_permissions("recommend:view")),
) -> RecommendationResponse:
    settings = request.app.state.settings
    tower = request.app.state.current_towers.get(payload.tower_id)
    if tower is not None:
        ensure_tenant_access(user, tower.operator)
    elif settings.is_production_mode and user.role != "admin" and user.tenant != "*":
        raise HTTPException(status_code=404, detail="Tower not found in live state")

    recommender = request.app.state.recommender
    actions = recommender.recommend(payload.fault_type, payload.fault_probability, payload.tower_id)
    await request.app.state.audit_logger.write(
        event="recommendation.generate",
        actor=user,
        resource=payload.tower_id,
        action="recommend",
        outcome="success",
        details={"fault_type": payload.fault_type},
        request_id=getattr(request.state, "request_id", None),
    )
    return RecommendationResponse(
        tower_id=payload.tower_id,
        fault_type=payload.fault_type,
        actions=actions,
    )
