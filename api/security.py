from __future__ import annotations

import base64
import hashlib
import hmac
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from fastapi import Depends, Header, HTTPException, Request, WebSocket, WebSocketException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from api.config import AppSettings


bearer_scheme = HTTPBearer(auto_error=False)


ROLE_PERMISSIONS: dict[str, set[str]] = {
    "admin": {"*"},
    "operator": {
        "tower:view",
        "tower:acknowledge",
        "incident:view",
        "incident:act",
        "recommend:view",
        "predict:run",
        "observability:view",
        "audit:view",
    },
    "viewer": {"tower:view", "incident:view", "recommend:view", "observability:view"},
    "service": {"ingest:write", "tower:view"},
}


@dataclass(slots=True)
class UserPrincipal:
    subject: str
    email: str
    name: str
    role: str
    tenant: str


class AuthService:
    def __init__(self, settings: AppSettings) -> None:
        self.settings = settings
        self.users_by_email: dict[str, dict[str, Any]] = {}
        for user in settings.auth_users:
            email = str(user.get("email", "")).strip().lower()
            if not email:
                continue
            self.users_by_email[email] = {
                "email": email,
                "name": str(user.get("name") or email),
                "role": str(user.get("role") or "operator"),
                "tenant": str(user.get("tenant") or "shared"),
                "password_hash": str(user.get("password_hash") or ""),
            }

    def authenticate(self, email: str, password: str) -> UserPrincipal | None:
        record = self.users_by_email.get(email.strip().lower())
        if not record:
            return None
        if not verify_password(password, record["password_hash"]):
            return None
        return UserPrincipal(
            subject=record["email"],
            email=record["email"],
            name=record["name"],
            role=record["role"],
            tenant=record["tenant"],
        )

    def issue_token(self, user: UserPrincipal) -> str:
        now = datetime.now(UTC)
        payload = {
            "sub": user.subject,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "tenant": user.tenant,
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=self.settings.auth_jwt_exp_minutes)).timestamp()),
        }
        return jwt.encode(payload, self.settings.auth_jwt_secret, algorithm="HS256")

    def decode_token(self, token: str) -> UserPrincipal:
        try:
            payload = jwt.decode(token, self.settings.auth_jwt_secret, algorithms=["HS256"])
        except jwt.PyJWTError as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid access token") from exc

        return UserPrincipal(
            subject=str(payload.get("sub", "")),
            email=str(payload.get("email", "")),
            name=str(payload.get("name", "")),
            role=str(payload.get("role", "operator")),
            tenant=str(payload.get("tenant", "shared")),
        )



def hash_password(password: str, iterations: int = 200_000) -> str:
    salt = hashlib.sha256(f"{password}:{iterations}".encode("utf-8")).digest()[:16]
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    salt_encoded = base64.urlsafe_b64encode(salt).decode("utf-8")
    digest_encoded = base64.urlsafe_b64encode(digest).decode("utf-8")
    return f"pbkdf2_sha256${iterations}${salt_encoded}${digest_encoded}"



def verify_password(password: str, stored_hash: str) -> bool:
    if stored_hash.startswith("plain:"):
        return hmac.compare_digest(password, stored_hash.removeprefix("plain:"))

    if not stored_hash.startswith("pbkdf2_sha256$"):
        return False

    try:
        _, rounds, salt_encoded, digest_encoded = stored_hash.split("$", 3)
        iterations = int(rounds)
        salt = base64.urlsafe_b64decode(salt_encoded.encode("utf-8"))
        expected = base64.urlsafe_b64decode(digest_encoded.encode("utf-8"))
    except Exception:
        return False

    candidate = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(candidate, expected)



def _extract_token(request: Request, credentials: HTTPAuthorizationCredentials | None) -> str | None:
    if credentials and credentials.scheme.lower() == "bearer":
        return credentials.credentials
    settings: AppSettings = request.app.state.settings
    return request.cookies.get(settings.auth_cookie_name)


async def get_optional_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> UserPrincipal | None:
    settings: AppSettings = request.app.state.settings
    if not settings.auth_enabled:
        return UserPrincipal(
            subject="system",
            email="system@internal",
            name="System",
            role="admin",
            tenant="*",
        )

    token = _extract_token(request, credentials)
    if not token:
        return None

    auth_service: AuthService = request.app.state.auth_service
    return auth_service.decode_token(token)


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> UserPrincipal:
    user = await get_optional_user(request, credentials)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    return user



def require_roles(*roles: str):
    allowed = set(roles)

    async def dependency(user: UserPrincipal = Depends(get_current_user)) -> UserPrincipal:
        if user.role not in allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
        return user

    return dependency



def has_permission(user: UserPrincipal, permission: str) -> bool:
    role_permissions = ROLE_PERMISSIONS.get(user.role, set())
    return "*" in role_permissions or permission in role_permissions



def require_permissions(*permissions: str):
    required = set(permissions)

    async def dependency(user: UserPrincipal = Depends(get_current_user)) -> UserPrincipal:
        missing = [permission for permission in required if not has_permission(user, permission)]
        if missing:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Missing permissions: {', '.join(missing)}")
        return user

    return dependency



def ensure_tenant_access(user: UserPrincipal, tower_operator: str | None) -> None:
    if user.role == "admin" or user.tenant == "*":
        return
    if tower_operator is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant ownership missing")
    if user.tenant != tower_operator:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant access denied")


async def require_ingestion_access(
    request: Request,
    x_ingestion_key: str | None = Header(default=None),
    user: UserPrincipal | None = Depends(get_optional_user),
) -> UserPrincipal | None:
    settings: AppSettings = request.app.state.settings

    if settings.ingestion_api_keys:
        if x_ingestion_key and x_ingestion_key in settings.ingestion_api_keys:
            return None
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid ingestion key")

    if user is not None and (user.role in {"admin", "service"} or has_permission(user, "ingest:write")):
        return user

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Ingestion access denied")


def _extract_websocket_token(websocket: WebSocket, settings: AppSettings) -> str | None:
    auth_header = websocket.headers.get("authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        return auth_header.split(" ", 1)[1].strip()

    query_token = websocket.query_params.get("token")
    if query_token:
        return query_token

    return websocket.cookies.get(settings.auth_cookie_name)


async def authenticate_websocket(websocket: WebSocket, settings: AppSettings, auth_service: AuthService) -> UserPrincipal:
    if not settings.auth_enabled:
        return UserPrincipal(
            subject="system",
            email="system@internal",
            name="System",
            role="admin",
            tenant="*",
        )

    token = _extract_websocket_token(websocket, settings)
    if not token:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION, reason="Authentication required")

    try:
        return auth_service.decode_token(token)
    except HTTPException as exc:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION, reason=exc.detail) from exc
