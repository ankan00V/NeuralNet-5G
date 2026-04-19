from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("APP_MODE", "demo")
os.environ.setdefault("AUTH_ENABLED", "false")
os.environ.setdefault("ENABLE_DEV_ENDPOINTS", "true")
os.environ.setdefault("INGESTION_MODE", "simulator")
os.environ.setdefault("CORS_ORIGINS", "*")

from api.main import app


@pytest.fixture(scope="session")
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client
