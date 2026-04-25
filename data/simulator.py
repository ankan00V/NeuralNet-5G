from __future__ import annotations

import argparse
import csv
import json
import os
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Deque, Iterator

import numpy as np

try:
    from data.network_profile import FEATURE_NAMES, KPI_LIMITS, PROFILE_BASELINES, SHOWCASE_TOWERS, SITE_PROFILES
    from data.schema import KpiSnapshot
except ModuleNotFoundError:
    from network_profile import FEATURE_NAMES, KPI_LIMITS, PROFILE_BASELINES, SHOWCASE_TOWERS, SITE_PROFILES
    from schema import KpiSnapshot

FAULT_LABELS = {
    "normal": 0,
    "congestion": 1,
    "coverage_degradation": 2,
    "hardware_anomaly": 3,
}


def _clip(name: str, value: float) -> float:
    bounds = KPI_LIMITS[name]
    return float(np.clip(value, bounds["min"], bounds["max"]))


@dataclass
class FaultState:
    fault_type: str = "normal"
    severity: float = 0.0
    progress: int = 0
    precursor_steps: int = 0
    duration_steps: int = 0
    active: bool = False

    @property
    def total_steps(self) -> int:
        return self.precursor_steps + self.duration_steps

    @property
    def phase(self) -> str:
        if not self.active or self.fault_type == "normal":
            return "normal"
        if self.progress < self.precursor_steps:
            return "precursor"
        return "fault"


@dataclass
class TowerSimulator:
    tower_id: str
    lat: float
    lon: float
    city: str
    profile: str
    operator: str
    rng: np.random.Generator
    history: Deque[dict] = field(default_factory=lambda: deque(maxlen=30))
    pending_fault: FaultState = field(default_factory=FaultState)
    baseline_state: dict[str, float] = field(default_factory=dict)

    def inject_fault(
        self,
        fault_type: str,
        severity: float = 0.8,
        duration_steps: int | None = None,
        precursor_steps: int | None = None,
    ) -> None:
        durations = {
            "congestion": 20,
            "coverage_degradation": 15,
            "hardware_anomaly": 5,
        }
        precursors = {
            "congestion": 18,
            "coverage_degradation": 24,
            "hardware_anomaly": 18,
        }
        self.pending_fault = FaultState(
            fault_type=fault_type,
            severity=float(np.clip(severity, 0.0, 1.0)),
            progress=0,
            precursor_steps=precursor_steps if precursor_steps is not None else precursors.get(fault_type, 0),
            duration_steps=duration_steps or durations.get(fault_type, 10),
            active=True,
        )

    def reset_fault(self) -> None:
        self.pending_fault = FaultState()

    def _load_multiplier(self, timestamp: datetime) -> float:
        hour = timestamp.hour + (timestamp.minute / 60)
        morning_peak = np.exp(-((hour - 10.0) ** 2) / 12.0)
        evening_peak = np.exp(-((hour - 20.0) ** 2) / 9.0)
        overnight_dip = np.exp(-((hour - 3.0) ** 2) / 10.0)
        profile_bias = {
            "urban_core": 1.08,
            "dense_urban": 1.03,
            "enterprise": 0.95 if 8 <= hour <= 20 else 0.72,
            "transit_hub": 1.1 if 7 <= hour <= 22 else 0.62,
            "suburban": 0.88 if 10 <= hour <= 19 else 0.68,
        }[self.profile]
        return max(0.55, profile_bias + (0.18 * morning_peak) + (0.24 * evening_peak) - (0.12 * overnight_dip))

    def _baseline_sample(self, timestamp: datetime) -> dict:
        values = {}
        load_multiplier = self._load_multiplier(timestamp)

        for name, spec in PROFILE_BASELINES[self.profile].items():
            prev = self.baseline_state.get(name, spec["mean"])
            noise = self.rng.normal(0.0, spec["std"] * 0.35)
            mean = spec["mean"]

            if name == "dl_throughput":
                target = mean * load_multiplier
            elif name == "ul_throughput":
                target = mean * (0.9 + ((load_multiplier - 1.0) * 0.45))
            elif name == "rtt":
                target = mean * (1.0 + max(0.0, load_multiplier - 0.95) * 0.85)
            elif name == "ho_failure_rate":
                target = mean * (1.0 + max(0.0, load_multiplier - 0.9) * 0.7)
            elif name == "sinr":
                target = mean - max(0.0, load_multiplier - 1.0) * 2.8
            elif name == "rsrp":
                target = mean - max(0.0, load_multiplier - 1.0) * 1.5
            else:
                target = mean

            smoothed = (prev * 0.76) + (target * 0.24) + noise
            values[name] = _clip(name, smoothed)
            self.baseline_state[name] = values[name]
        return values

    def maybe_schedule_fault(self, timestamp: datetime) -> None:
        if self.pending_fault.active:
            return

        hour = timestamp.hour
        base_probability = {
            "enterprise": 0.018 if 8 <= hour <= 20 else 0.008,
            "urban_core": 0.022 if 9 <= hour <= 23 else 0.009,
            "dense_urban": 0.026 if 9 <= hour <= 23 else 0.011,
            "transit_hub": 0.028 if 7 <= hour <= 22 else 0.010,
            "suburban": 0.014 if 10 <= hour <= 21 else 0.007,
        }[self.profile]

        operator_factor = {
            "Jio": 1.0,
            "Airtel": 0.94,
            "Vi": 1.08,
            "BSNL": 1.12,
        }[self.operator]

        if self.rng.random() >= (base_probability * operator_factor):
            return

        if self.profile in {"dense_urban", "transit_hub"}:
            fault_type = self.rng.choice(["congestion", "coverage_degradation", "hardware_anomaly"], p=[0.54, 0.22, 0.24])
        elif self.profile == "enterprise":
            fault_type = self.rng.choice(["congestion", "coverage_degradation", "hardware_anomaly"], p=[0.28, 0.24, 0.48])
        elif self.profile == "suburban":
            fault_type = self.rng.choice(["congestion", "coverage_degradation", "hardware_anomaly"], p=[0.22, 0.54, 0.24])
        else:
            fault_type = self.rng.choice(["congestion", "coverage_degradation", "hardware_anomaly"], p=[0.36, 0.28, 0.36])

        self.inject_fault(
            fault_type=fault_type,
            severity=float(self.rng.uniform(0.62, 0.98)),
            precursor_steps={
                "congestion": 18,
                "coverage_degradation": 24,
                "hardware_anomaly": 18,
            }[fault_type],
        )

    def _apply_precursor(self, kpis: dict, state: FaultState) -> dict:
        precursor_ratio = min(1.0, (state.progress + 1) / max(1, state.precursor_steps))
        strength = state.severity * precursor_ratio

        if state.fault_type == "congestion":
            # Early warning for congestion should look like rising delay + mobility strain
            # with throughput starting to soften (not increase).
            kpis["dl_throughput"] = _clip("dl_throughput", kpis["dl_throughput"] * (1.0 - 0.14 * strength))
            kpis["ul_throughput"] = _clip("ul_throughput", kpis["ul_throughput"] * (1.0 - 0.09 * strength))
            kpis["rtt"] = _clip("rtt", kpis["rtt"] + 32.0 * strength)
            kpis["ho_failure_rate"] = _clip("ho_failure_rate", kpis["ho_failure_rate"] + 1.6 * strength)
            kpis["sinr"] = _clip("sinr", kpis["sinr"] - 0.9 * strength)
            kpis["rsrp"] = _clip("rsrp", kpis["rsrp"] - 0.4 * strength)
        elif state.fault_type == "coverage_degradation":
            # Coverage degradation precursor: radio KPIs drift down first, then UE experience follows.
            kpis["rsrp"] = _clip("rsrp", kpis["rsrp"] - 16.0 * strength)
            kpis["sinr"] = _clip("sinr", kpis["sinr"] - 9.0 * strength)
            kpis["dl_throughput"] = _clip("dl_throughput", kpis["dl_throughput"] * (1.0 - 0.10 * strength))
            kpis["ul_throughput"] = _clip("ul_throughput", kpis["ul_throughput"] * (1.0 - 0.07 * strength))
            kpis["rtt"] = _clip("rtt", kpis["rtt"] + 12.0 * strength)
            kpis["ho_failure_rate"] = _clip("ho_failure_rate", kpis["ho_failure_rate"] + 2.0 * strength)
        elif state.fault_type == "hardware_anomaly":
            # Hardware anomaly precursor: growing volatility + occasional latency spikes across KPIs.
            oscillation = np.sin((state.progress + 1) * 1.1)
            burst = 1.0 if ((state.progress + 1) % 5 == 0) else 0.0
            jitter = self.rng.normal(0.0, 1.0, size=len(FEATURE_NAMES))
            kpis["sinr"] = _clip("sinr", kpis["sinr"] + (oscillation * 2.8 * state.severity) + (jitter[1] * 1.2 * strength))
            kpis["rsrp"] = _clip("rsrp", kpis["rsrp"] + (oscillation * 2.2 * state.severity) + (jitter[0] * 1.0 * strength))
            kpis["rtt"] = _clip("rtt", kpis["rtt"] + (abs(jitter[5]) * 18.0 * state.severity) + (burst * 22.0 * state.severity))
            kpis["ho_failure_rate"] = _clip("ho_failure_rate", kpis["ho_failure_rate"] + (abs(jitter[4]) * 2.4 * state.severity) + (burst * 1.1))
            kpis["dl_throughput"] = _clip("dl_throughput", kpis["dl_throughput"] * (1.0 - 0.10 * strength) + (jitter[2] * 8.0 * strength))
            kpis["ul_throughput"] = _clip("ul_throughput", kpis["ul_throughput"] * (1.0 - 0.08 * strength) + (jitter[3] * 3.0 * strength))
        return kpis

    def _apply_fault(self, kpis: dict) -> tuple[dict, str, str]:
        state = self.pending_fault
        if not state.active or state.fault_type == "normal":
            return kpis, "normal", "normal"

        if state.phase == "precursor":
            kpis = self._apply_precursor(kpis, state)
            state.progress += 1
            if state.progress >= state.total_steps:
                state.active = False
            return kpis, "normal", "precursor"

        fault_progress = max(0, state.progress - state.precursor_steps)
        progress_ratio = min(1.0, (fault_progress + 1) / max(1, state.duration_steps))
        strength = state.severity * progress_ratio

        if state.fault_type == "congestion":
            kpis["dl_throughput"] = _clip("dl_throughput", kpis["dl_throughput"] * (1.0 - 0.76 * strength))
            kpis["ul_throughput"] = _clip("ul_throughput", kpis["ul_throughput"] * (1.0 - 0.5 * strength))
            kpis["rtt"] = _clip("rtt", kpis["rtt"] + 115.0 * strength)
            kpis["ho_failure_rate"] = _clip("ho_failure_rate", kpis["ho_failure_rate"] + 7.0 * strength)
            kpis["sinr"] = _clip("sinr", kpis["sinr"] - 1.4 * strength)
            kpis["rsrp"] = _clip("rsrp", kpis["rsrp"] - 0.4 * strength)
        elif state.fault_type == "coverage_degradation":
            kpis["rsrp"] = _clip("rsrp", kpis["rsrp"] - 28.0 * strength)
            kpis["sinr"] = _clip("sinr", kpis["sinr"] - 15.0 * strength)
            kpis["dl_throughput"] = _clip("dl_throughput", kpis["dl_throughput"] * (1.0 - 0.18 * strength))
            kpis["ul_throughput"] = _clip("ul_throughput", kpis["ul_throughput"] * (1.0 - 0.12 * strength))
            kpis["rtt"] = _clip("rtt", kpis["rtt"] + 18.0 * strength)
            kpis["ho_failure_rate"] = _clip("ho_failure_rate", kpis["ho_failure_rate"] + 4.8 * strength)
        elif state.fault_type == "hardware_anomaly":
            noise = self.rng.normal(0.0, 1.0, size=len(FEATURE_NAMES))
            oscillation = np.sin((fault_progress + 1) * 1.6)
            burst = 1.0 if ((fault_progress + 1) % 3 == 0) else 0.0
            kpis["rsrp"] = _clip("rsrp", kpis["rsrp"] + (noise[0] * 18.0 * state.severity) + (oscillation * 6.0 * state.severity))
            kpis["sinr"] = _clip("sinr", kpis["sinr"] + (noise[1] * 16.0 * state.severity) + (oscillation * 7.5 * state.severity))
            kpis["dl_throughput"] = _clip("dl_throughput", kpis["dl_throughput"] * (1.0 - 0.18 * abs(oscillation)) + (noise[2] * 28.0 * state.severity))
            kpis["ul_throughput"] = _clip("ul_throughput", kpis["ul_throughput"] * (1.0 - 0.14 * abs(oscillation)) + (noise[3] * 10.0 * state.severity))
            kpis["ho_failure_rate"] = _clip("ho_failure_rate", kpis["ho_failure_rate"] + (abs(noise[4]) * 5.5 * state.severity) + (burst * 2.2))
            kpis["rtt"] = _clip("rtt", kpis["rtt"] + (abs(noise[5]) * 120.0 * state.severity) + (burst * 45.0))

        state.progress += 1
        if state.progress >= state.total_steps:
            state.active = False

        return kpis, state.fault_type, "fault"

    def step(self, timestamp: datetime | None = None) -> dict:
        current_time = timestamp or datetime.now(UTC)
        self.maybe_schedule_fault(current_time)
        kpis = self._baseline_sample(current_time)
        event_fault_type = self.pending_fault.fault_type if self.pending_fault.active else "normal"
        kpis, fault_type, state_phase = self._apply_fault(kpis)

        snapshot = KpiSnapshot(
            tower_id=self.tower_id,
            timestamp=current_time,
            fault_label=FAULT_LABELS[fault_type],
            fault_type=fault_type,
            **kpis,
        ).model_dump(mode="json")
        snapshot["lat"] = self.lat
        snapshot["lon"] = self.lon
        snapshot["city"] = self.city
        snapshot["profile"] = self.profile
        snapshot["operator"] = self.operator
        snapshot["current_fault_type"] = fault_type
        snapshot["current_fault_label"] = FAULT_LABELS[fault_type]
        snapshot["event_fault_type"] = event_fault_type
        snapshot["state_phase"] = state_phase
        snapshot["future_fault_type"] = "normal"
        snapshot["future_fault_label"] = 0
        snapshot["near_fault_window"] = 0
        snapshot["impending_fault_minutes"] = None
        self.history.append(snapshot)
        return snapshot

    def latest_window(self, size: int = 30) -> list[list[float]]:
        if len(self.history) < size:
            missing = size - len(self.history)
            seed_row = self.history[0] if self.history else self.step()
            seed_window = [
                [float(seed_row[name]) for name in FEATURE_NAMES]
                for _ in range(missing)
            ]
        else:
            seed_window = []
        recent = [[float(row[name]) for name in FEATURE_NAMES] for row in list(self.history)[-size:]]
        return seed_window + recent


class NetworkSimulator:
    def __init__(self, seed: int = 42, sample_period_seconds: int | None = None) -> None:
        self.seed = seed
        self.rng = np.random.default_rng(seed)
        self.sample_period_seconds = int(
            sample_period_seconds
            if sample_period_seconds is not None
            else int((os.getenv("SIM_SAMPLE_PERIOD_SECONDS", "60") or "60").strip())
        )
        self.sample_period_seconds = max(1, self.sample_period_seconds)
        self.towers = self._build_towers()
        self.clock = datetime.now(UTC)
        self._prime_histories()

    def _build_towers(self) -> dict[str, TowerSimulator]:
        towers: dict[str, TowerSimulator] = {}
        for site in SITE_PROFILES:
            towers[site["tower_id"]] = TowerSimulator(
                tower_id=site["tower_id"],
                lat=float(site["lat"]),
                lon=float(site["lon"]),
                city=site["city"],
                profile=site["profile"],
                operator=site["operator"],
                rng=np.random.default_rng(self.rng.integers(0, 10_000_000)),
            )
        return towers

    def _prime_histories(self) -> None:
        current_time = self.clock - timedelta(seconds=self.sample_period_seconds * 30)
        for step in range(30):
            tick_time = current_time + timedelta(seconds=step * self.sample_period_seconds)
            for tower in self.towers.values():
                tower.step(tick_time)
        self.clock = current_time + timedelta(seconds=30 * self.sample_period_seconds)

    def inject_fault(
        self,
        tower_id: str,
        fault_type: str,
        severity: float = 0.8,
        duration_steps: int | None = None,
        precursor_steps: int | None = None,
    ) -> None:
        self.towers[tower_id].inject_fault(fault_type, severity, duration_steps, precursor_steps)

    def reset_tower(self, tower_id: str) -> None:
        self.towers[tower_id].reset_fault()

    def advance_all(self, steps: int = 1, start_time: datetime | None = None) -> list[dict]:
        steps = max(1, int(steps))
        now = start_time or self.clock
        rows: list[dict] = []
        for step in range(steps):
            tick_time = now + timedelta(seconds=step * self.sample_period_seconds)
            for tower in self.towers.values():
                rows.append(tower.step(tick_time))
        if start_time is None:
            self.clock = now + timedelta(seconds=steps * self.sample_period_seconds)
        return rows

    def get_latest_tower_rows(self) -> list[dict]:
        return [tower.history[-1] for tower in self.towers.values()]

    def get_latest_window(self, tower_id: str, size: int = 30) -> list[list[float]]:
        return self.towers[tower_id].latest_window(size)

    @staticmethod
    def annotate_future_faults(rows: list[dict], interval_seconds: int, horizon_start_minutes: int = 15, horizon_end_minutes: int = 30) -> list[dict]:
        lookahead_start = max(1, int(np.ceil((horizon_start_minutes * 60) / interval_seconds)))
        lookahead_end = max(lookahead_start, int(np.floor((horizon_end_minutes * 60) / interval_seconds)))

        for index, row in enumerate(rows):
            future_fault_type = "normal"
            impending_fault_minutes = None

            for step_ahead in range(lookahead_start, lookahead_end + 1):
                future_index = index + step_ahead
                if future_index >= len(rows):
                    break
                candidate = rows[future_index]["current_fault_type"]
                if candidate != "normal":
                    future_fault_type = candidate
                    impending_fault_minutes = round((step_ahead * interval_seconds) / 60, 2)
                    break

            row["future_fault_type"] = future_fault_type
            row["future_fault_label"] = FAULT_LABELS[future_fault_type]
            row["near_fault_window"] = int(row["current_fault_type"] == "normal" and future_fault_type != "normal")
            row["impending_fault_minutes"] = impending_fault_minutes

        return rows

    def generate_dataset(self, n_hours: int = 48, interval_seconds: int = 60) -> Path:
        output_path = Path(__file__).resolve().parent / "output" / "training_data.csv"
        output_path.parent.mkdir(parents=True, exist_ok=True)

        start = datetime.now(UTC) - timedelta(hours=n_hours)
        steps = max(1, int((n_hours * 3600) / interval_seconds))
        rows_by_tower = {tower_id: [] for tower_id in self.towers}

        for step in range(steps):
            tick_time = start + timedelta(seconds=step * interval_seconds)
            for tower in self.towers.values():
                rows_by_tower[tower.tower_id].append(tower.step(tick_time))

        for tower_id, rows in rows_by_tower.items():
            rows_by_tower[tower_id] = self.annotate_future_faults(rows, interval_seconds)

        fieldnames = [
            "tower_id",
            "timestamp",
            "lat",
            "lon",
            "city",
            "profile",
            "operator",
            *FEATURE_NAMES,
            "fault_label",
            "fault_type",
            "current_fault_label",
            "current_fault_type",
            "event_fault_type",
            "state_phase",
            "future_fault_label",
            "future_fault_type",
            "near_fault_window",
            "impending_fault_minutes",
        ]

        with output_path.open("w", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=fieldnames)
            writer.writeheader()
            for tower_id in sorted(rows_by_tower):
                for row in rows_by_tower[tower_id]:
                    writer.writerow(row)

        return output_path

    def stream(self, sleep_seconds: float = 1.0) -> Iterator[dict]:
        while True:
            batch = self.advance_all(steps=1)
            for row in batch:
                yield row
            time.sleep(sleep_seconds)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Synthetic 5G KPI simulator")
    parser.add_argument("--mode", choices=["dataset", "stream"], default="stream")
    parser.add_argument("--hours", type=int, default=48)
    parser.add_argument("--seed", type=int, default=42)
    # A single sample represents a minute of network telemetry by default.
    parser.add_argument("--interval-seconds", type=int, default=60)
    parser.add_argument("--inject", nargs=2, metavar=("TOWER_ID", "FAULT_TYPE"))
    parser.add_argument("--showcase", action="store_true", help="print the configured showcase tower IDs and exit")
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    simulator = NetworkSimulator(seed=args.seed)

    if args.showcase:
        print("\n".join(SHOWCASE_TOWERS))
        return

    if args.inject:
        tower_id, fault_type = args.inject
        simulator.inject_fault(tower_id, fault_type)

    if args.mode == "dataset":
        path = simulator.generate_dataset(n_hours=args.hours, interval_seconds=args.interval_seconds)
        print(f"training dataset written to {path}")
        return

    for row in simulator.stream():
        print(json.dumps(row))


if __name__ == "__main__":
    main()
