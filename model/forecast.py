from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import numpy as np

from model.feature_engineering import RAW_FEATURES
from model.inference import FaultPredictor


FEATURE_BOUNDS = {
    "rsrp": (-140.0, -40.0),
    "sinr": (-20.0, 45.0),
    "dl_throughput": (0.0, 2_500.0),
    "ul_throughput": (0.0, 400.0),
    "ho_failure_rate": (0.0, 100.0),
    "rtt": (0.0, 800.0),
}


@dataclass(slots=True)
class ForecastSettings:
    horizon_steps: int = 10
    step_minutes: int = 5
    simulations: int = 48


def _clip_row(row: np.ndarray) -> np.ndarray:
    clipped = row.copy()
    for index, feature_name in enumerate(RAW_FEATURES):
        lower, upper = FEATURE_BOUNDS[feature_name]
        clipped[index] = float(np.clip(clipped[index], lower, upper))
    return clipped


def _window_from_history(history: list[Any]) -> np.ndarray:
    rows = []
    for item in history[-30:]:
        if isinstance(item, (list, tuple, np.ndarray)):
            row = [float(value) for value in item]
        else:
            row = [
                float(item.rsrp),
                float(item.sinr),
                float(item.dl_throughput),
                float(item.ul_throughput),
                float(item.ho_failure_rate),
                float(item.rtt),
            ]
        rows.append(row)

    if not rows:
        raise ValueError("No history provided for forecasting")

    while len(rows) < 30:
        rows.insert(0, rows[0])

    return np.asarray(rows[-30:], dtype=np.float32)


def forecast_fault_probability(
    predictor: FaultPredictor,
    history: list[Any],
    *,
    settings: ForecastSettings | None = None,
) -> list[dict[str, Any]]:
    cfg = settings or ForecastSettings()
    window = _window_from_history(history)

    recent = window[-8:]
    trend = np.mean(np.diff(recent, axis=0), axis=0)
    trend = np.nan_to_num(trend, nan=0.0, posinf=0.0, neginf=0.0)
    volatility = np.std(recent, axis=0)
    noise_scale = np.maximum(volatility * 0.20, 0.001)

    rng = np.random.default_rng(42)
    trajectory_probabilities = [[] for _ in range(cfg.horizon_steps)]

    for _ in range(max(1, cfg.simulations)):
        sim_window = window.copy()
        for step_index in range(cfg.horizon_steps):
            noise = rng.normal(loc=0.0, scale=noise_scale, size=len(RAW_FEATURES))
            projected_row = _clip_row(sim_window[-1] + trend + noise)
            sim_window = np.vstack((sim_window[1:], projected_row))

            prediction = predictor.predict(sim_window.tolist())
            trajectory_probabilities[step_index].append(float(prediction["fault_probability"]))

    now = datetime.now(UTC)
    forecast = []
    for step_index, values in enumerate(trajectory_probabilities, start=1):
        step_values = np.asarray(values, dtype=np.float32)
        forecast.append(
            {
                "step_minutes_ahead": step_index * cfg.step_minutes,
                "timestamp": now + timedelta(minutes=step_index * cfg.step_minutes),
                "predicted_probability": round(float(np.mean(step_values)), 4),
                "confidence_lower": round(float(np.percentile(step_values, 10)), 4),
                "confidence_upper": round(float(np.percentile(step_values, 90)), 4),
            }
        )

    return forecast
