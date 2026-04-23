from __future__ import annotations

import json

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: dict[WebSocket, str] = {}

    async def connect(self, websocket: WebSocket, tenant: str = "*") -> None:
        await websocket.accept()
        self.active_connections[websocket] = tenant

    def disconnect(self, websocket: WebSocket) -> None:
        self.active_connections.pop(websocket, None)

    def connections(self) -> list[tuple[WebSocket, str]]:
        return list(self.active_connections.items())

    async def send_json(self, websocket: WebSocket, payload: dict) -> None:
        await websocket.send_json(payload)

    async def broadcast(self, message: str) -> None:
        stale_connections = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                stale_connections.append(connection)
        for connection in stale_connections:
            self.disconnect(connection)

    async def broadcast_json(self, payload: dict) -> None:
        await self.broadcast(json.dumps(payload, default=str))
