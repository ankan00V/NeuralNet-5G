from __future__ import annotations

from api.config import AppSettings, ConfigError, validate_settings


def build_settings(**overrides) -> AppSettings:
    base = AppSettings(
        app_mode="demo",
        cors_origins=["*"],
        ws_broadcast_interval=5,
        auth_enabled=True,
        auth_jwt_secret="dev-secret",
        auth_jwt_exp_minutes=60,
        auth_cookie_name="nn5g_access",
        auth_cookie_secure=False,
        auth_users=[],
        enable_dev_endpoints=True,
        ingestion_mode="simulator",
        ingestion_api_keys=set(),
        model_gate_enforced=False,
        model_min_macro_f1=0.6,
        model_min_class_f1=0.5,
        request_max_bytes=256_000,
        rate_limit_per_minute=240,
        rate_limit_burst=60,
        audit_signing_key="audit-secret",
        enable_forecast_endpoint=False,
        fault_open_probability_threshold=0.5,
    )
    for key, value in overrides.items():
        setattr(base, key, value)
    return base


def test_prod_rejects_dev_endpoints():
    settings = build_settings(app_mode="prod", enable_dev_endpoints=True, cors_origins=["https://example.com"])
    try:
        validate_settings(settings)
    except ConfigError as exc:
        assert "ENABLE_DEV_ENDPOINTS" in str(exc)
    else:
        raise AssertionError("expected ConfigError")


def test_prod_requires_strong_auth_secret():
    settings = build_settings(
        app_mode="prod",
        auth_jwt_secret="change-me-in-production",
        enable_dev_endpoints=False,
        cors_origins=["https://example.com"],
    )
    try:
        validate_settings(settings)
    except ConfigError as exc:
        assert "AUTH_JWT_SECRET" in str(exc)
    else:
        raise AssertionError("expected ConfigError")


def test_prod_requires_non_wildcard_cors():
    settings = build_settings(app_mode="prod", enable_dev_endpoints=False)
    try:
        validate_settings(settings)
    except ConfigError as exc:
        assert "CORS_ORIGINS" in str(exc)
    else:
        raise AssertionError("expected ConfigError")
