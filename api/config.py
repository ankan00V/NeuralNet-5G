from __future__ import annotations

import json
import os
from dataclasses import dataclass


DEFAULT_AUTH_USERS = [
    {
        "email": "ops@neuralnet5g.ai",
        "name": "NOC Lead",
        "role": "admin",
        "tenant": "*",
        # Demo default password: 12345 (override via AUTH_USERS_JSON in production).
        "password_hash": "pbkdf2_sha256$200000$ufCDKAPIAyO-6o5ei9BZuw==$RhdLroZwAvgQQb9YXJg9oTugUqi-GqW3GTMewRgBhLQ=",
    }
]


class ConfigError(RuntimeError):
    pass


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _as_int(value: str | None, default: int) -> int:
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _as_float(value: str | None, default: float) -> float:
    if value is None:
        return default
    try:
        return float(value)
    except ValueError:
        return default


def _as_csv(value: str | None, default: list[str]) -> list[str]:
    if not value:
        return default
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass(slots=True)
class AppSettings:
    app_mode: str
    cors_origins: list[str]
    ws_broadcast_interval: int
    auth_enabled: bool
    auth_jwt_secret: str
    auth_jwt_exp_minutes: int
    auth_cookie_name: str
    auth_cookie_secure: bool
    auth_users: list[dict]
    auth_users_from_env: bool
    enable_dev_endpoints: bool
    ingestion_mode: str
    ingestion_api_keys: set[str]
    require_websocket_auth: bool
    model_gate_enforced: bool
    model_min_macro_f1: float
    model_min_class_f1: float
    request_max_bytes: int
    rate_limit_per_minute: int
    rate_limit_burst: int
    audit_signing_key: str
    enable_forecast_endpoint: bool
    fault_open_probability_threshold: float
    telemetry_min_active_towers: int
    alert_webhook_url: str
    alert_webhook_timeout_seconds: float

    @property
    def is_demo_mode(self) -> bool:
        return self.app_mode == "demo"

    @property
    def is_production_mode(self) -> bool:
        return self.app_mode == "prod"



def _parse_auth_users() -> tuple[list[dict], bool]:
    auth_users_raw = os.getenv("AUTH_USERS_JSON")
    if not auth_users_raw:
        return DEFAULT_AUTH_USERS, False
    try:
        parsed = json.loads(auth_users_raw)
    except json.JSONDecodeError as exc:
        raise ConfigError("AUTH_USERS_JSON must be valid JSON") from exc
    if not isinstance(parsed, list):
        raise ConfigError("AUTH_USERS_JSON must be a JSON array")
    if any(not isinstance(entry, dict) for entry in parsed):
        raise ConfigError("AUTH_USERS_JSON entries must be JSON objects")
    return parsed, True


def load_settings() -> AppSettings:
    app_mode = os.getenv("APP_MODE", "demo").strip().lower()
    auth_jwt_secret = os.getenv("AUTH_JWT_SECRET", "change-me-in-production")
    audit_signing_key = os.getenv("AUDIT_SIGNING_KEY", "").strip()
    enforce_model_gate_value = os.getenv("ENFORCE_MODEL_GATE")
    model_gate_enforced = _as_bool(enforce_model_gate_value, default=(app_mode == "prod"))
    auth_users, auth_users_from_env = _parse_auth_users()

    settings = AppSettings(
        app_mode=app_mode,
        cors_origins=_as_csv(os.getenv("CORS_ORIGINS"), ["*"]),
        ws_broadcast_interval=max(1, _as_int(os.getenv("WS_BROADCAST_INTERVAL"), 5)),
        auth_enabled=_as_bool(os.getenv("AUTH_ENABLED"), True),
        auth_jwt_secret=auth_jwt_secret,
        auth_jwt_exp_minutes=max(5, _as_int(os.getenv("AUTH_JWT_EXP_MINUTES"), 60)),
        auth_cookie_name=os.getenv("AUTH_COOKIE_NAME", "nn5g_access"),
        auth_cookie_secure=_as_bool(os.getenv("AUTH_COOKIE_SECURE"), False),
        auth_users=auth_users,
        auth_users_from_env=auth_users_from_env,
        enable_dev_endpoints=_as_bool(os.getenv("ENABLE_DEV_ENDPOINTS"), False),
        ingestion_mode=os.getenv("INGESTION_MODE", "simulator").strip().lower(),
        ingestion_api_keys=set(_as_csv(os.getenv("INGESTION_API_KEYS"), [])),
        require_websocket_auth=_as_bool(os.getenv("REQUIRE_WEBSOCKET_AUTH"), True),
        model_gate_enforced=model_gate_enforced,
        model_min_macro_f1=_as_float(os.getenv("MODEL_MIN_MACRO_F1"), 0.60),
        model_min_class_f1=_as_float(os.getenv("MODEL_MIN_CLASS_F1"), 0.50),
        request_max_bytes=max(8_192, _as_int(os.getenv("MAX_REQUEST_BYTES"), 256_000)),
        rate_limit_per_minute=max(10, _as_int(os.getenv("RATE_LIMIT_PER_MINUTE"), 240)),
        rate_limit_burst=max(1, _as_int(os.getenv("RATE_LIMIT_BURST"), 60)),
        audit_signing_key=audit_signing_key,
        enable_forecast_endpoint=_as_bool(os.getenv("ENABLE_FORECAST_ENDPOINT"), False),
        fault_open_probability_threshold=max(0.1, min(0.99, _as_float(os.getenv("FAULT_OPEN_PROB_THRESHOLD"), 0.5))),
        telemetry_min_active_towers=max(0, _as_int(os.getenv("TELEMETRY_MIN_ACTIVE_TOWERS"), 0 if app_mode == "demo" else 1)),
        alert_webhook_url=os.getenv("ALERT_WEBHOOK_URL", "").strip(),
        alert_webhook_timeout_seconds=max(0.5, _as_float(os.getenv("ALERT_WEBHOOK_TIMEOUT_SECONDS"), 2.0)),
    )

    validate_settings(settings)
    return settings



def validate_settings(settings: AppSettings) -> None:
    if settings.app_mode not in {"demo", "prod"}:
        raise ConfigError("APP_MODE must be one of: demo, prod")

    if settings.ingestion_mode not in {"simulator", "external", "hybrid"}:
        raise ConfigError("INGESTION_MODE must be one of: simulator, external, hybrid")

    if settings.is_production_mode:
        if settings.enable_dev_endpoints:
            raise ConfigError("ENABLE_DEV_ENDPOINTS cannot be enabled in APP_MODE=prod")
        if not settings.auth_enabled:
            raise ConfigError("AUTH_ENABLED must be true in APP_MODE=prod")
        if not settings.require_websocket_auth:
            raise ConfigError("REQUIRE_WEBSOCKET_AUTH must be true in APP_MODE=prod")
        if settings.auth_jwt_secret == "change-me-in-production":
            raise ConfigError("AUTH_JWT_SECRET must be set in APP_MODE=prod")
        if not settings.auth_users_from_env:
            raise ConfigError("AUTH_USERS_JSON must be configured in APP_MODE=prod")
        if not settings.auth_users:
            raise ConfigError("AUTH_USERS_JSON must include at least one user in APP_MODE=prod")
        for index, user in enumerate(settings.auth_users):
            password_hash = str(user.get("password_hash") or "")
            if password_hash.startswith("plain:"):
                raise ConfigError(
                    f"AUTH_USERS_JSON user[{index}] uses plain password hash; pbkdf2_sha256 is required in APP_MODE=prod"
                )
            if not password_hash.startswith("pbkdf2_sha256$"):
                raise ConfigError(
                    f"AUTH_USERS_JSON user[{index}] must provide password_hash in pbkdf2_sha256 format in APP_MODE=prod"
                )
        if settings.cors_origins == ["*"]:
            raise ConfigError("CORS_ORIGINS cannot be '*' in APP_MODE=prod")
        if not settings.audit_signing_key:
            raise ConfigError("AUDIT_SIGNING_KEY must be set in APP_MODE=prod")
        if settings.ingestion_mode != "external":
            raise ConfigError("INGESTION_MODE must be 'external' in APP_MODE=prod")
        if not settings.ingestion_api_keys:
            raise ConfigError("INGESTION_API_KEYS must be configured in APP_MODE=prod")
        if not settings.model_gate_enforced:
            raise ConfigError("ENFORCE_MODEL_GATE must be enabled in APP_MODE=prod")

    if not settings.audit_signing_key:
        settings.audit_signing_key = settings.auth_jwt_secret
