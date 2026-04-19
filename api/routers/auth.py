from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from api.schemas import AuthUser, LoginRequest, LoginResponse
from api.security import AuthService, UserPrincipal, get_current_user


router = APIRouter()


@router.post("/v1/auth/login", response_model=LoginResponse)
async def login(request: Request, payload: LoginRequest, response: Response) -> LoginResponse:
    auth_service: AuthService = request.app.state.auth_service
    user = auth_service.authenticate(payload.email, payload.password)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    token = auth_service.issue_token(user)
    settings = request.app.state.settings
    response.set_cookie(
        key=settings.auth_cookie_name,
        value=token,
        httponly=True,
        secure=settings.auth_cookie_secure or settings.is_production_mode,
        samesite="strict" if settings.is_production_mode else "lax",
        max_age=settings.auth_jwt_exp_minutes * 60,
    )

    await request.app.state.audit_logger.write(
        event="auth.login",
        actor=user,
        resource="session",
        action="login",
        outcome="success",
        details={"email": user.email},
        request_id=getattr(request.state, "request_id", None),
    )

    return LoginResponse(
        access_token=token,
        expires_in_seconds=settings.auth_jwt_exp_minutes * 60,
        user=AuthUser(email=user.email, name=user.name, role=user.role, tenant=user.tenant),
    )


@router.post("/v1/auth/logout")
async def logout(request: Request, response: Response, user: UserPrincipal = Depends(get_current_user)) -> dict:
    settings = request.app.state.settings
    response.delete_cookie(settings.auth_cookie_name)
    await request.app.state.audit_logger.write(
        event="auth.logout",
        actor=user,
        resource="session",
        action="logout",
        outcome="success",
        details={"email": user.email},
        request_id=getattr(request.state, "request_id", None),
    )
    return {"status": "ok"}


@router.get("/v1/auth/me", response_model=AuthUser)
async def me(user: UserPrincipal = Depends(get_current_user)) -> AuthUser:
    return AuthUser(email=user.email, name=user.name, role=user.role, tenant=user.tenant)
