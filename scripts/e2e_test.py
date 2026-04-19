from __future__ import annotations

import os
import subprocess
import sys
import time

import httpx
import pytest
import websockets


API_BASE = os.getenv("API_BASE_URL", "")
WS_BASE = API_BASE.replace("http://", "ws://").replace("https://", "wss://")
AUTH_EMAIL = os.getenv("API_AUTH_EMAIL", "")
AUTH_PASSWORD = os.getenv("API_AUTH_PASSWORD", "")


async def get_access_token(client: httpx.AsyncClient) -> str:
    response = await client.post("/api/v1/auth/login", json={"email": AUTH_EMAIL, "password": AUTH_PASSWORD})
    response.raise_for_status()
    return response.json()["access_token"]


def require_env() -> None:
    if not API_BASE:
        raise RuntimeError("Set API_BASE_URL before running e2e tests.")
    if not AUTH_EMAIL or not AUTH_PASSWORD:
        raise RuntimeError("Set API_AUTH_EMAIL and API_AUTH_PASSWORD before running e2e tests.")


@pytest.mark.asyncio
async def test_health() -> None:
    require_env()
    async with httpx.AsyncClient(base_url=API_BASE, timeout=10.0) as client:
        response = await client.get("/api/health/live")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_predict() -> None:
    require_env()
    payload = {
        "tower_id": "TOWER_001",
        "kpi_window": [[-85.0, 14.0, 280.0, 60.0, 1.2, 18.0] for _ in range(30)],
    }
    async with httpx.AsyncClient(base_url=API_BASE, timeout=10.0) as client:
        token = await get_access_token(client)
        response = await client.post("/api/predict", json=payload, headers={"Authorization": f"Bearer {token}"})
        data = response.json()
        assert response.status_code == 200
        assert set(data.keys()) >= {"tower_id", "fault_probability", "fault_type", "lead_time_minutes", "confidence", "timestamp"}


@pytest.mark.asyncio
async def test_recommend() -> None:
    require_env()
    payload = {
        "tower_id": "TOWER_042",
        "fault_type": "coverage_degradation",
        "fault_probability": 0.81,
    }
    async with httpx.AsyncClient(base_url=API_BASE, timeout=10.0) as client:
        token = await get_access_token(client)
        response = await client.post("/api/recommend", json=payload, headers={"Authorization": f"Bearer {token}"})
        data = response.json()
        assert response.status_code == 200
        assert len(data["actions"]) == 3
        assert data["actions"][0]["rank"] == 1


@pytest.mark.asyncio
async def test_websocket_receives_50_towers() -> None:
    require_env()
    async with httpx.AsyncClient(base_url=API_BASE, timeout=10.0) as client:
        token = await get_access_token(client)
    async with websockets.connect(f"{WS_BASE}/api/ws/live?token={token}") as websocket:
        message = await websocket.recv()
        assert '"event": "tower_update"' in message or '"event":"tower_update"' in message
        assert message.count("TOWER_") >= 50


@pytest.mark.skipif(os.getenv("RUN_SLOW_E2E") != "1", reason="set RUN_SLOW_E2E=1 to run the live injection flow")
def test_fault_injection_turns_tower_red() -> None:
    require_env()
    subprocess.run(
        [
            sys.executable,
            "scripts/inject_fault.py",
            "--tower",
            "TOWER_042",
            "--fault",
            "coverage_degradation",
            "--duration",
            "60",
        ],
        check=True,
    )
    time.sleep(10)

    token = httpx.post(
        f"{API_BASE}/api/v1/auth/login",
        json={"email": AUTH_EMAIL, "password": AUTH_PASSWORD},
        timeout=10.0,
    ).json()["access_token"]
    response = httpx.get(f"{API_BASE}/api/towers", headers={"Authorization": f"Bearer {token}"}, timeout=10.0)
    response.raise_for_status()
    towers = response.json()["towers"]
    target = next(tower for tower in towers if tower["tower_id"] == "TOWER_042")
    assert target["status"] in {"amber", "red"}
