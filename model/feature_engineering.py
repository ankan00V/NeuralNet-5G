from __future__ import annotations

import numpy as np


RAW_FEATURES = ["rsrp", "sinr", "dl_throughput", "ul_throughput", "ho_failure_rate", "rtt"]
ENGINEERED_GROUPS = ("raw", "delta", "volatility", "slope")
INPUT_SIZE = len(RAW_FEATURES) * len(ENGINEERED_GROUPS)


def engineer_sequence_features(window: np.ndarray) -> np.ndarray:
    raw = np.asarray(window, dtype=np.float32)
    if raw.ndim != 2 or raw.shape[1] != len(RAW_FEATURES):
        raise ValueError(f"expected shape (timesteps, {len(RAW_FEATURES)}) but got {raw.shape}")

    delta = np.zeros_like(raw)
    delta[1:] = raw[1:] - raw[:-1]

    volatility = np.zeros_like(raw)
    slope = np.zeros_like(raw)
    for index in range(raw.shape[0]):
        start = max(0, index - 4)
        segment = raw[start : index + 1]
        volatility[index] = segment.std(axis=0)
        slope[index] = (segment[-1] - segment[0]) / max(1, len(segment) - 1)

    return np.concatenate([raw, delta, volatility, slope], axis=1).astype(np.float32)
