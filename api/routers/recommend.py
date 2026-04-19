from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from api.schemas import RecommendationRequest, RecommendationResponse
from api.security import UserPrincipal, require_permissions


router = APIRouter()


@router.post("/recommend", response_model=RecommendationResponse)
async def recommend(
    request: Request,
    payload: RecommendationRequest,
    user: UserPrincipal = Depends(require_permissions("recommend:view")),
) -> RecommendationResponse:
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
