from __future__ import annotations

import asyncio
from collections import deque
from datetime import UTC, datetime
from inspect import isawaitable
from typing import Any


LATENCY_BUCKETS_MS = (5.0, 10.0, 20.0, 50.0, 100.0, 250.0, 500.0, 1000.0, 2000.0)


def init_observability(model_version: str) -> dict[str, Any]:
    return {
        "request_count": 0,
        "inference_count": 0,
        "inference_failure_count": 0,
        "tower_count": 0,
        "last_request_at": None,
        "last_request_latency_ms": 0.0,
        "last_inference_latency_ms": 0.0,
        "last_model_version": model_version,
        "drift_alert": False,
        "drift_score": 0.0,
        "http_request_totals": {},
        "inference_latency_sum_ms": 0.0,
        "inference_latency_histogram": {str(bucket): 0 for bucket in LATENCY_BUCKETS_MS},
        "inference_latency_inf_count": 0,
        "recent_alerts": deque(maxlen=50),
        "telemetry_last_ingested_at": None,
    }


def _increment_http_counter(observability: dict[str, Any], method: str, path: str, status_code: int) -> None:
    key = f"{method.upper()}::{path}::{status_code}"
    totals: dict[str, int] = observability.setdefault("http_request_totals", {})
    totals[key] = totals.get(key, 0) + 1


def record_http_request(
    observability: dict[str, Any],
    *,
    method: str,
    path: str,
    status_code: int,
    latency_ms: float,
) -> None:
    observability["request_count"] = int(observability.get("request_count", 0)) + 1
    observability["last_request_at"] = datetime.now(UTC).isoformat()
    observability["last_request_latency_ms"] = round(float(latency_ms), 3)
    _increment_http_counter(observability, method, path, status_code)


def record_inference(
    observability: dict[str, Any],
    *,
    latency_ms: float,
    success: bool,
    failure_reason: str | None = None,
) -> None:
    observability["inference_count"] = int(observability.get("inference_count", 0)) + 1
    if not success:
        observability["inference_failure_count"] = int(observability.get("inference_failure_count", 0)) + 1
        if failure_reason:
            raise_alert(
                observability,
                level="error",
                code="inference_failure",
                message=f"Inference failed: {failure_reason}",
            )
        return

    latency = max(0.0, float(latency_ms))
    observability["last_inference_latency_ms"] = round(latency, 3)
    observability["inference_latency_sum_ms"] = float(observability.get("inference_latency_sum_ms", 0.0)) + latency
    observability["inference_latency_inf_count"] = int(observability.get("inference_latency_inf_count", 0)) + 1
    histogram: dict[str, int] = observability.setdefault("inference_latency_histogram", {})
    for bucket in LATENCY_BUCKETS_MS:
        if latency <= bucket:
            histogram[str(bucket)] = int(histogram.get(str(bucket), 0)) + 1
            break
    histogram["+Inf"] = int(histogram.get("+Inf", 0)) + 1


def raise_alert(
    observability: dict[str, Any],
    *,
    level: str,
    code: str,
    message: str,
    context: dict[str, Any] | None = None,
    dispatcher: Any = None,
) -> None:
    alerts = observability.setdefault("recent_alerts", deque(maxlen=50))
    alert_record = {
        "timestamp": datetime.now(UTC).isoformat(),
        "level": level,
        "code": code,
        "message": message,
        "context": context or {},
    }
    alerts.appendleft(alert_record)

    if dispatcher is None:
        return

    try:
        dispatch_result = dispatcher.dispatch(alert_record)
        if isawaitable(dispatch_result):
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                return
            loop.create_task(dispatch_result)
    except Exception:  # pragma: no cover - defensive path
        pass


def render_prometheus_metrics(observability: dict[str, Any]) -> str:
    lines: list[str] = []

    lines.append("# HELP nn5g_http_requests_total Total HTTP requests handled by API.")
    lines.append("# TYPE nn5g_http_requests_total counter")
    for key, count in sorted(observability.get("http_request_totals", {}).items()):
        method, path, status_code = key.split("::", 2)
        lines.append(
            f'nn5g_http_requests_total{{method="{method}",path="{path}",status="{status_code}"}} {int(count)}'
        )

    lines.append("# HELP nn5g_inference_total Total model inference attempts.")
    lines.append("# TYPE nn5g_inference_total counter")
    lines.append(f'nn5g_inference_total {int(observability.get("inference_count", 0))}')

    lines.append("# HELP nn5g_inference_failures_total Total model inference failures.")
    lines.append("# TYPE nn5g_inference_failures_total counter")
    lines.append(f'nn5g_inference_failures_total {int(observability.get("inference_failure_count", 0))}')

    lines.append("# HELP nn5g_inference_latency_ms Model inference latency in milliseconds.")
    lines.append("# TYPE nn5g_inference_latency_ms histogram")
    running = 0
    histogram = observability.get("inference_latency_histogram", {})
    for bucket in LATENCY_BUCKETS_MS:
        running += int(histogram.get(str(bucket), 0))
        lines.append(f'nn5g_inference_latency_ms_bucket{{le="{bucket}"}} {running}')
    inf_count = int(observability.get("inference_latency_inf_count", 0))
    lines.append(f'nn5g_inference_latency_ms_bucket{{le="+Inf"}} {inf_count}')
    lines.append(f'nn5g_inference_latency_ms_sum {float(observability.get("inference_latency_sum_ms", 0.0))}')
    lines.append(f'nn5g_inference_latency_ms_count {inf_count}')

    lines.append("# HELP nn5g_drift_score Current model drift score.")
    lines.append("# TYPE nn5g_drift_score gauge")
    lines.append(f'nn5g_drift_score {float(observability.get("drift_score", 0.0))}')

    lines.append("# HELP nn5g_drift_alert Whether drift alert is active (1=true, 0=false).")
    lines.append("# TYPE nn5g_drift_alert gauge")
    lines.append(f'nn5g_drift_alert {1 if observability.get("drift_alert") else 0}')

    lines.append("# HELP nn5g_tower_count Current number of actively scored towers.")
    lines.append("# TYPE nn5g_tower_count gauge")
    lines.append(f'nn5g_tower_count {int(observability.get("tower_count", 0))}')

    lines.append("")
    return "\n".join(lines)
