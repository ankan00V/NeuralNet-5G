from __future__ import annotations

import asyncio
import json
import os

import httpx
import websockets


API_BASE = os.getenv("API_BASE_URL", "")
AUTH_EMAIL = os.getenv("API_AUTH_EMAIL", "")
AUTH_PASSWORD = os.getenv("API_AUTH_PASSWORD", "")


def _require_api_base() -> None:
    if not API_BASE:
        raise SystemExit("Set API_BASE_URL before running smoke_pipeline.py")


async def _maybe_token(client: httpx.AsyncClient) -> str:
    if not AUTH_EMAIL or not AUTH_PASSWORD:
        return ""
    response = await client.post("/api/v1/auth/login", json={"email": AUTH_EMAIL, "password": AUTH_PASSWORD})
    response.raise_for_status()
    return response.json().get("access_token", "")


async def run() -> None:
    _require_api_base()
    ws_base = API_BASE.replace("http://", "ws://").replace("https://", "wss://")

    async with httpx.AsyncClient(base_url=API_BASE, timeout=15.0) as client:
        live = await client.get("/api/health/live")
        live.raise_for_status()

        ready = await client.get("/api/health/ready")
        ready.raise_for_status()

        token = await _maybe_token(client)
        headers = {"Authorization": f"Bearer {token}"} if token else {}

        predict_payload = {
            "tower_id": "TOWER_001",
            "kpi_window": [[-85.0, 14.0, 280.0, 60.0, 1.2, 18.0] for _ in range(30)],
        }
        predict = await client.post("/api/predict", json=predict_payload, headers=headers)
        predict.raise_for_status()

        towers = await client.get("/api/towers", headers=headers)
        towers.raise_for_status()

    async with websockets.connect(f"{ws_base}/api/ws/live") as websocket:
        message = await websocket.recv()
        payload = json.loads(message)
        if payload.get("event") != "tower_update":
            raise RuntimeError("websocket did not return tower_update event")
        if not payload.get("towers"):
            raise RuntimeError("websocket tower_update payload did not include towers")

    print("smoke_pipeline: PASS")


if __name__ == "__main__":
    asyncio.run(run())
