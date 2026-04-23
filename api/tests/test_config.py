from __future__ import annotations

from api.config import AppSettings, ConfigError, validate_settings


VALID_AUTH_USERS = [
    {
        "email": "ops@neuralnet5g.ai",
        "name": "NOC Lead",
        "role": "admin",
        "tenant": "*",
        "password_hash": "pbkdf2_sha256$200000$rsU8XGbsPdMOT2N_n1Fhvg==$MVuxnJxqFcTPpDq5vKogTiwi5Lk4dk5k3uomZTFzIdA=",
    }
]


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
        auth_users=VALID_AUTH_USERS,
        auth_users_from_env=True,
        enable_dev_endpoints=True,
        ingestion_mode="simulator",
        ingestion_api_keys=set(),
        require_websocket_auth=True,
        model_gate_enforced=False,
        model_min_macro_f1=0.6,
        model_min_class_f1=0.5,
        request_max_bytes=256_000,
        rate_limit_per_minute=240,
        rate_limit_burst=60,
        audit_signing_key="audit-secret",
        enable_forecast_endpoint=False,
        fault_open_probability_threshold=0.5,
        telemetry_min_active_towers=0,
        alert_webhook_url="",
        alert_webhook_timeout_seconds=2.0,
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


def test_prod_requires_external_ingestion():
    settings = build_settings(
        app_mode="prod",
        enable_dev_endpoints=False,
        cors_origins=["https://example.com"],
        ingestion_mode="hybrid",
    )
    try:
        validate_settings(settings)
    except ConfigError as exc:
        assert "INGESTION_MODE" in str(exc)
    else:
        raise AssertionError("expected ConfigError")


def test_prod_requires_ingestion_keys():
    settings = build_settings(
        app_mode="prod",
        enable_dev_endpoints=False,
        cors_origins=["https://example.com"],
        ingestion_mode="external",
    )
    try:
        validate_settings(settings)
    except ConfigError as exc:
        assert "INGESTION_API_KEYS" in str(exc)
    else:
        raise AssertionError("expected ConfigError")


def test_prod_requires_websocket_auth():
    settings = build_settings(
        app_mode="prod",
        enable_dev_endpoints=False,
        cors_origins=["https://example.com"],
        ingestion_mode="external",
        ingestion_api_keys={"ingest-key"},
        require_websocket_auth=False,
        model_gate_enforced=True,
    )
    try:
        validate_settings(settings)
    except ConfigError as exc:
        assert "REQUIRE_WEBSOCKET_AUTH" in str(exc)
    else:
        raise AssertionError("expected ConfigError")


def test_prod_requires_model_gate():
    settings = build_settings(
        app_mode="prod",
        enable_dev_endpoints=False,
        cors_origins=["https://example.com"],
        ingestion_mode="external",
        ingestion_api_keys={"ingest-key"},
        require_websocket_auth=True,
        model_gate_enforced=False,
    )
    try:
        validate_settings(settings)
    except ConfigError as exc:
        assert "ENFORCE_MODEL_GATE" in str(exc)
    else:
        raise AssertionError("expected ConfigError")


def test_prod_requires_auth_users_from_env():
    settings = build_settings(
        app_mode="prod",
        enable_dev_endpoints=False,
        cors_origins=["https://example.com"],
        ingestion_mode="external",
        ingestion_api_keys={"ingest-key"},
        require_websocket_auth=True,
        model_gate_enforced=True,
        auth_users_from_env=False,
    )
    try:
        validate_settings(settings)
    except ConfigError as exc:
        assert "AUTH_USERS_JSON" in str(exc)
    else:
        raise AssertionError("expected ConfigError")


def test_prod_rejects_plain_password_hash():
    settings = build_settings(
        app_mode="prod",
        enable_dev_endpoints=False,
        cors_origins=["https://example.com"],
        ingestion_mode="external",
        ingestion_api_keys={"ingest-key"},
        require_websocket_auth=True,
        model_gate_enforced=True,
        auth_users=[
            {
                "email": "ops@neuralnet5g.ai",
                "name": "NOC Lead",
                "role": "admin",
                "tenant": "*",
                "password_hash": "plain:demo123",
            }
        ],
    )
    try:
        validate_settings(settings)
    except ConfigError as exc:
        assert "plain password hash" in str(exc)
    else:
        raise AssertionError("expected ConfigError")
