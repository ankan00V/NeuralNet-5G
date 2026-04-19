from __future__ import annotations

from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta
from typing import Any

from data.network_profile import KPI_LIMITS


FEATURE_NAMES = ["rsrp", "sinr", "dl_throughput", "ul_throughput", "ho_failure_rate", "rtt"]


class TelemetryBuffer:
    def __init__(self, window_size: int = 30, stale_after_seconds: int = 180) -> None:
        self.window_size = window_size
        self.stale_after = timedelta(seconds=stale_after_seconds)
        self.windows: dict[str, deque[list[float]]] = defaultdict(lambda: deque(maxlen=window_size))
        self.latest_rows: dict[str, dict[str, Any]] = {}

    @staticmethod
    def _clip(name: str, value: float) -> float:
        bounds = KPI_LIMITS[name]
        return float(max(bounds["min"], min(bounds["max"], value)))

    def ingest(self, payload: dict[str, Any]) -> None:
        tower_id = str(payload["tower_id"])
        kpis: dict[str, float] = payload["kpis"]
        timestamp = payload.get("timestamp")

        if isinstance(timestamp, str):
            parsed_ts = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        elif isinstance(timestamp, datetime):
            parsed_ts = timestamp
        else:
            parsed_ts = datetime.now(UTC)

        normalized_row = {
            "tower_id": tower_id,
            "timestamp": parsed_ts,
            "rsrp": self._clip("rsrp", float(kpis["rsrp"])),
            "sinr": self._clip("sinr", float(kpis["sinr"])),
            "dl_throughput": self._clip("dl_throughput", float(kpis["dl_throughput"])),
            "ul_throughput": self._clip("ul_throughput", float(kpis["ul_throughput"])),
            "ho_failure_rate": self._clip("ho_failure_rate", float(kpis["ho_failure_rate"])),
            "rtt": self._clip("rtt", float(kpis["rtt"])),
            "operator": payload.get("operator"),
            "city": payload.get("city"),
            "lat": payload.get("lat"),
            "lon": payload.get("lon"),
            "profile": payload.get("profile"),
            "source": payload.get("source", "ingestion"),
            "fault_type": "normal",
            "state_phase": "external",
        }

        self.latest_rows[tower_id] = normalized_row
        self.windows[tower_id].append([normalized_row[name] for name in FEATURE_NAMES])

    def has_recent_window(self, tower_id: str, now: datetime | None = None) -> bool:
        latest = self.latest_rows.get(tower_id)
        if latest is None:
            return False
        if len(self.windows[tower_id]) < self.window_size:
            return False
        now_ts = now or datetime.now(UTC)
        latest_ts: datetime = latest["timestamp"]
        if latest_ts.tzinfo is None:
            latest_ts = latest_ts.replace(tzinfo=UTC)
        return (now_ts - latest_ts) <= self.stale_after

    def get_window(self, tower_id: str) -> list[list[float]] | None:
        if not self.has_recent_window(tower_id):
            return None
        return [list(row) for row in self.windows[tower_id]]

    def get_latest_row(self, tower_id: str) -> dict[str, Any] | None:
        return self.latest_rows.get(tower_id)

    def list_tower_ids(self) -> list[str]:
        return sorted(self.latest_rows.keys())
