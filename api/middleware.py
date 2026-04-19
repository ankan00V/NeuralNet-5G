from __future__ import annotations

import json
import time
import uuid
from collections import defaultdict, deque
from datetime import UTC, datetime
from typing import Callable

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, max_bytes: int) -> None:
        super().__init__(app)
        self.max_bytes = max_bytes

    async def dispatch(self, request: Request, call_next: Callable):
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                size = int(content_length)
            except ValueError:
                size = 0
            if size > self.max_bytes:
                return JSONResponse(
                    status_code=413,
                    content={"detail": f"Request too large. Max {self.max_bytes} bytes."},
                )
        return await call_next(request)


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, per_minute: int, burst: int) -> None:
        super().__init__(app)
        self.per_minute = per_minute
        self.burst = burst
        self._windows: dict[str, deque[float]] = defaultdict(deque)

    def _identifier(self, request: Request) -> str:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        if request.client:
            return request.client.host
        return "unknown"

    async def dispatch(self, request: Request, call_next: Callable):
        key = self._identifier(request)
        now = time.monotonic()
        window = self._windows[key]
        while window and now - window[0] > 60:
            window.popleft()

        if len(window) >= self.per_minute + self.burst:
            return JSONResponse(
                status_code=429,
                headers={"Retry-After": "60"},
                content={"detail": "Rate limit exceeded"},
            )

        window.append(now)
        return await call_next(request)


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable):
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        request.state.request_id = request_id
        started = time.perf_counter()
        response = await call_next(request)
        latency_ms = round((time.perf_counter() - started) * 1000, 3)
        observability = getattr(request.app.state, "observability", None)
        if observability is None:
            observability = {
                "request_count": 0,
                "last_request_at": None,
                "last_request_latency_ms": 0.0,
            }
            request.app.state.observability = observability
        observability["request_count"] += 1
        observability["last_request_at"] = datetime.now(UTC).isoformat()
        observability["last_request_latency_ms"] = latency_ms
        response.headers["x-request-id"] = request_id
        return response


class StructuredAccessLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable):
        started = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = round((time.perf_counter() - started) * 1000, 3)
        entry = {
            "ts": datetime.now(UTC).isoformat(),
            "event": "http.access",
            "request_id": getattr(request.state, "request_id", None),
            "method": request.method,
            "path": request.url.path,
            "query": str(request.url.query),
            "status": response.status_code,
            "latency_ms": elapsed_ms,
            "client": request.client.host if request.client else "unknown",
        }
        request.app.logger.info(json.dumps(entry, ensure_ascii=True))
        return response
