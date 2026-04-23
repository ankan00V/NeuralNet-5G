from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import torch
from torch import nn

from model.feature_engineering import ENGINEERED_GROUPS, INPUT_SIZE, RAW_FEATURES, engineer_sequence_features


FAULT_TYPES = ["normal", "congestion", "coverage_degradation", "hardware_anomaly"]


class FaultLSTM(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        hidden_size = 128
        self.lstm = nn.LSTM(
            input_size=INPUT_SIZE,
            hidden_size=hidden_size,
            num_layers=2,
            dropout=0.3,
            batch_first=True,
            bidirectional=True,
        )
        output_size = hidden_size * 2
        self.attention = nn.Sequential(
            nn.Linear(output_size, 64),
            nn.Tanh(),
            nn.Linear(64, 1),
        )
        self.classifier = nn.Sequential(
            nn.LayerNorm(output_size * 2),
            nn.Linear(output_size * 2, 256),
            nn.ReLU(),
            nn.Dropout(0.25),
            nn.Linear(256, 64),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(64, 4),
        )

    def forward(self, features: torch.Tensor) -> torch.Tensor:
        output, _ = self.lstm(features)
        attention_logits = self.attention(output).squeeze(-1)
        attention_weights = torch.softmax(attention_logits, dim=1).unsqueeze(-1)
        context = torch.sum(output * attention_weights, dim=1)
        tail = output[:, -1, :]
        pooled = torch.cat([context, tail], dim=-1)
        return self.classifier(pooled)


class FaultPredictor:
    def __init__(self) -> None:
        self.model: FaultLSTM | None = None
        self.scaler = None
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.ready = False
        self.model_version = "heuristic-v1"
        self.class_bias = np.zeros(len(FAULT_TYPES), dtype=np.float32)
        self.class_thresholds = np.asarray([0.0, 0.25, 0.20, 0.35], dtype=np.float32)

    def load(
        self,
        model_path: str | None = None,
        scaler_path: str | None = None,
        calibration_path: str | None = None,
    ) -> "FaultPredictor":
        root = Path(__file__).resolve().parents[1]
        model_path = model_path or os.getenv("MODEL_PATH", str(root / "model" / "lstm_fault.pt"))
        scaler_path = scaler_path or os.getenv("SCALER_PATH", str(root / "model" / "scaler.pkl"))
        calibration_path = calibration_path or os.getenv("CALIBRATION_PATH", str(root / "model" / "calibration.json"))

        if Path(model_path).exists() and Path(scaler_path).exists():
            self.model = FaultLSTM().to(self.device)
            self.model.load_state_dict(torch.load(model_path, map_location=self.device))
            self.model.eval()
            self.scaler = joblib.load(scaler_path)
            self.ready = True
            self.model_version = self._load_model_version(root)

        calibration_file = Path(calibration_path)
        if calibration_file.exists():
            try:
                payload = json.loads(calibration_file.read_text())
                bias = payload.get("class_bias", [0.0] * len(FAULT_TYPES))
                if isinstance(bias, list) and len(bias) == len(FAULT_TYPES):
                    self.class_bias = np.asarray(bias, dtype=np.float32)
                thresholds = payload.get("class_thresholds", self.class_thresholds.tolist())
                if isinstance(thresholds, list) and len(thresholds) == len(FAULT_TYPES):
                    self.class_thresholds = np.asarray(thresholds, dtype=np.float32)
            except Exception:
                self.class_bias = np.zeros(len(FAULT_TYPES), dtype=np.float32)
                self.class_thresholds = np.asarray([0.0, 0.25, 0.20, 0.35], dtype=np.float32)

        return self

    def _decode_label_index(self, probabilities: np.ndarray) -> int:
        thresholds = self.class_thresholds
        margins = probabilities[1:] - thresholds[1:]
        fault_index = int(np.argmax(margins))
        if float(margins[fault_index]) >= 0.0:
            return fault_index + 1
        return 0

    def _load_model_version(self, root: Path) -> str:
        metadata_path = root / "model" / "train_metadata.json"
        if not metadata_path.exists():
            return "fault-lstm"
        try:
            metadata = json.loads(metadata_path.read_text())
        except Exception:
            return "fault-lstm"

        val_f1 = metadata.get("best_val_macro_f1")
        if isinstance(val_f1, (int, float)):
            return f"fault-lstm-f1-{val_f1:.4f}"
        return "fault-lstm"

    def _heuristic_scores(self, history: np.ndarray) -> dict[str, float]:
        recent = history[-10:]
        earlier = history[:10]
        mean_recent = recent.mean(axis=0)
        mean_earlier = earlier.mean(axis=0)
        rsrp, sinr, dl, ul, ho_fail, _rtt = mean_recent.tolist()
        rsrp_drop = float(mean_earlier[0] - mean_recent[0])
        sinr_drop = float(mean_earlier[1] - mean_recent[1])
        dl_drop = float(mean_earlier[2] - mean_recent[2])
        ul_drop = float(mean_earlier[3] - mean_recent[3])
        ho_rise = float(mean_recent[4] - mean_earlier[4])
        rtt_rise = float(mean_recent[5] - mean_earlier[5])
        volatility = recent.std(axis=0)

        return {
            "congestion": (
                max(0.0, dl_drop / 90.0)
                + max(0.0, ul_drop / 30.0)
                + max(0.0, rtt_rise / 20.0)
                + max(0.0, ho_rise / 4.0)
                + max(0.0, (160.0 - dl) / 120.0)
            ),
            "coverage_degradation": (
                max(0.0, rsrp_drop / 8.0)
                + max(0.0, sinr_drop / 5.0)
                + max(0.0, (-96.0 - rsrp) / 10.0)
                + max(0.0, (5.0 - sinr) / 4.0)
            ),
            "hardware_anomaly": (
                max(0.0, volatility[0] / 7.0)
                + max(0.0, volatility[1] / 4.0)
                + max(0.0, volatility[5] / 25.0)
                + max(0.0, ho_fail / 8.0)
            ),
        }

    def _heuristic_predict(self, window: list[list[float]]) -> dict:
        history = np.asarray(window, dtype=np.float32)
        scores = self._heuristic_scores(history)

        fault_type = max(scores, key=scores.get)
        best_score = scores[fault_type]
        if best_score < 0.45:
            fault_type = "normal"
            fault_probability = max(0.06, min(0.24, best_score / 2))
        else:
            fault_probability = min(0.98, 0.25 + (best_score / 2.5))

        lead_time = max(5, int((1.0 - fault_probability) * 30))
        return {
            "fault_probability": float(round(fault_probability, 4)),
            "fault_type": fault_type,
            "lead_time_minutes": lead_time,
            "confidence": float(round(fault_probability, 4)),
            "probabilities": self._heuristic_probabilities(scores),
            "latency_ms": 0.0,
            "model_version": self.model_version,
        }

    def _heuristic_probabilities(self, scores: dict[str, float]) -> dict[str, float]:
        ordered_scores = [scores.get(name, 0.0) for name in FAULT_TYPES[1:]]
        total = sum(max(0.0, score) for score in ordered_scores)
        if total <= 0:
            return {fault: (1.0 if fault == "normal" else 0.0) for fault in FAULT_TYPES}

        scale = min(0.95, total / (total + 1.5))
        probabilities = {"normal": max(0.05, 1.0 - scale)}
        for fault, score in zip(FAULT_TYPES[1:], ordered_scores, strict=True):
            probabilities[fault] = (max(0.0, score) / total) * scale

        norm = sum(probabilities.values())
        return {key: float(value / norm) for key, value in probabilities.items()}

    def _raw_feature_attribution_from_tensor(
        self,
        gradients: np.ndarray,
        engineered_features: np.ndarray,
    ) -> dict[str, float]:
        # Use gradient*input magnitude and fold engineered groups back to raw feature names.
        weighted = np.abs(gradients * engineered_features)
        feature_scores = {feature: 0.0 for feature in RAW_FEATURES}
        for group_index, _group in enumerate(ENGINEERED_GROUPS):
            for raw_index, raw_name in enumerate(RAW_FEATURES):
                column = group_index * len(RAW_FEATURES) + raw_index
                feature_scores[raw_name] += float(weighted[:, column].mean())

        total = sum(feature_scores.values())
        if total <= 0:
            return {name: 0.0 for name in RAW_FEATURES}
        return {name: value / total for name, value in feature_scores.items()}

    def _model_predict(self, kpi_window: list[list[float]]) -> dict[str, Any]:
        raw_features = np.asarray(kpi_window, dtype=np.float32)
        if raw_features.ndim != 2 or raw_features.shape[1] != len(RAW_FEATURES):
            raise ValueError(f"expected KPI window with {len(RAW_FEATURES)} raw features")

        features = engineer_sequence_features(raw_features)
        scaled = self.scaler.transform(features)
        tensor = torch.tensor(scaled, dtype=torch.float32, device=self.device).unsqueeze(0)

        started = time.perf_counter()
        with torch.no_grad():
            logits = self.model(tensor)
            logits_np = logits.cpu().numpy()[0] + self.class_bias
            logits_np = logits_np - np.max(logits_np)
            probabilities = np.exp(logits_np) / np.sum(np.exp(logits_np))
        latency_ms = (time.perf_counter() - started) * 1000

        best_index = self._decode_label_index(probabilities)
        fault_probability = float(probabilities[best_index])
        return {
            "fault_probability": fault_probability,
            "fault_type": FAULT_TYPES[best_index],
            "lead_time_minutes": max(5, int((1.0 - fault_probability) * 30)),
            "confidence": fault_probability,
            "probabilities": {fault: float(probabilities[index]) for index, fault in enumerate(FAULT_TYPES)},
            "latency_ms": round(float(latency_ms), 3),
            "model_version": self.model_version,
        }

    def predict(self, kpi_window: list[list[float]]) -> dict:
        if not kpi_window:
            return {
                "fault_probability": 0.0,
                "fault_type": "normal",
                "lead_time_minutes": 30,
                "confidence": 0.0,
                "probabilities": {fault: (1.0 if fault == "normal" else 0.0) for fault in FAULT_TYPES},
                "latency_ms": 0.0,
                "model_version": self.model_version,
            }

        if not self.ready or self.model is None or self.scaler is None:
            return self._heuristic_predict(kpi_window)

        return self._model_predict(kpi_window)

    def explain(self, kpi_window: list[list[float]]) -> dict[str, Any]:
        if not self.ready or self.model is None or self.scaler is None:
            raise RuntimeError("Explainability requires trained model artifacts")

        raw_features = np.asarray(kpi_window, dtype=np.float32)
        engineered = engineer_sequence_features(raw_features)
        scaled = self.scaler.transform(engineered)
        tensor = torch.tensor(scaled, dtype=torch.float32, device=self.device).unsqueeze(0)
        tensor.requires_grad_(True)

        logits = self.model(tensor)
        bias_tensor = torch.tensor(self.class_bias, dtype=torch.float32, device=self.device).unsqueeze(0)
        adjusted_logits = logits + bias_tensor
        probabilities = torch.softmax(adjusted_logits, dim=-1)
        probabilities_np = probabilities.detach().cpu().numpy()[0]
        selected_class = self._decode_label_index(probabilities_np)
        selected_probability = probabilities[0, selected_class]

        self.model.zero_grad(set_to_none=True)
        selected_probability.backward()
        gradients = tensor.grad.detach().cpu().numpy()[0]

        attributions = self._raw_feature_attribution_from_tensor(gradients=gradients, engineered_features=scaled)
        base_value = float(probabilities[0, 0].detach().cpu().item())

        return {
            "model": self.model_version,
            "method": "gradient-x-input",
            "base_value": base_value,
            "output_value": float(selected_probability.detach().cpu().item()),
            "attributions": attributions,
            "note": "Feature impact derived from gradient*input attribution, aggregated across engineered temporal features.",
        }
