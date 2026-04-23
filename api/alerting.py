from __future__ import annotations

import logging
from typing import Any

import httpx


class AlertDispatcher:
    def __init__(self, webhook_url: str = "", timeout_seconds: float = 2.0) -> None:
        self.webhook_url = webhook_url.strip()
        self.timeout_seconds = max(0.5, float(timeout_seconds))
        self._client: httpx.AsyncClient | None = None
        self._logger = logging.getLogger("neuralnet5g.alerting")

        if self.webhook_url:
            self._client = httpx.AsyncClient(timeout=self.timeout_seconds)

    @property
    def enabled(self) -> bool:
        return self._client is not None

    async def dispatch(self, alert: dict[str, Any]) -> bool:
        if self._client is None:
            return False

        try:
            response = await self._client.post(
                self.webhook_url,
                json={
                    "source": "neuralnet5g",
                    "alert": alert,
                },
            )
            response.raise_for_status()
            return True
        except Exception as exc:  # pragma: no cover - network dependent
            self._logger.warning("Alert webhook delivery failed: %s", exc)
            return False

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None
