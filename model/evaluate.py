from __future__ import annotations

import json
import os
from collections import defaultdict
from datetime import UTC, datetime
from itertools import product
from pathlib import Path

import joblib
import matplotlib
import numpy as np
import pandas as pd
import torch
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score, precision_recall_fscore_support

from model.inference import FAULT_TYPES, FaultLSTM
from model.train import PREDICTION_HORIZON_END, PREDICTION_HORIZON_START, build_sequence_frame

matplotlib.use("Agg")
import matplotlib.pyplot as plt


def split_dataset_with_metadata(sequence_frame: pd.DataFrame) -> dict[str, dict[str, np.ndarray]]:
    partitions: dict[str, list] = {
        "train_x": [],
        "train_y": [],
        "train_tower": [],
        "val_x": [],
        "val_y": [],
        "val_tower": [],
        "test_x": [],
        "test_y": [],
        "test_tower": [],
    }

    for tower_id, group in sequence_frame.groupby("tower_id"):
        ordered = group.sort_values("timestamp").reset_index(drop=True)
        total = len(ordered)
        train_end = int(total * 0.8)
        val_end = int(total * 0.9)

        partitions["train_x"].extend(ordered.iloc[:train_end]["features"].tolist())
        partitions["train_y"].extend(ordered.iloc[:train_end]["label"].tolist())
        partitions["train_tower"].extend([tower_id] * train_end)

        partitions["val_x"].extend(ordered.iloc[train_end:val_end]["features"].tolist())
        partitions["val_y"].extend(ordered.iloc[train_end:val_end]["label"].tolist())
        partitions["val_tower"].extend([tower_id] * max(0, val_end - train_end))

        partitions["test_x"].extend(ordered.iloc[val_end:]["features"].tolist())
        partitions["test_y"].extend(ordered.iloc[val_end:]["label"].tolist())
        partitions["test_tower"].extend([tower_id] * max(0, total - val_end))

    return {
        "train": {
            "x": np.asarray(partitions["train_x"], dtype=np.float32),
            "y": np.asarray(partitions["train_y"], dtype=np.int64),
            "tower_id": np.asarray(partitions["train_tower"], dtype=object),
        },
        "val": {
            "x": np.asarray(partitions["val_x"], dtype=np.float32),
            "y": np.asarray(partitions["val_y"], dtype=np.int64),
            "tower_id": np.asarray(partitions["val_tower"], dtype=object),
        },
        "test": {
            "x": np.asarray(partitions["test_x"], dtype=np.float32),
            "y": np.asarray(partitions["test_y"], dtype=np.int64),
            "tower_id": np.asarray(partitions["test_tower"], dtype=object),
        },
    }


def _class_counts(labels: np.ndarray) -> dict[str, int]:
    counts = np.bincount(labels, minlength=len(FAULT_TYPES))
    return {FAULT_TYPES[index]: int(count) for index, count in enumerate(counts)}


def multiclass_brier_score(probabilities: np.ndarray, labels: np.ndarray) -> float:
    one_hot = np.zeros_like(probabilities)
    one_hot[np.arange(len(labels)), labels] = 1.0
    return float(np.mean(np.sum((probabilities - one_hot) ** 2, axis=1)))


def expected_calibration_error(probabilities: np.ndarray, labels: np.ndarray, bins: int = 10) -> float:
    confidences = probabilities.max(axis=1)
    predictions = probabilities.argmax(axis=1)
    correctness = (predictions == labels).astype(np.float32)

    bin_edges = np.linspace(0.0, 1.0, bins + 1)
    ece = 0.0
    for start, end in zip(bin_edges[:-1], bin_edges[1:], strict=True):
        in_bin = (confidences > start) & (confidences <= end)
        if not np.any(in_bin):
            continue
        bin_conf = float(np.mean(confidences[in_bin]))
        bin_acc = float(np.mean(correctness[in_bin]))
        ece += float(np.mean(in_bin)) * abs(bin_acc - bin_conf)
    return float(ece)


def per_operator_metrics(tower_ids: np.ndarray, labels: np.ndarray, predictions: np.ndarray, operator_by_tower: dict[str, str]) -> dict[str, dict]:
    grouped_indices: dict[str, list[int]] = defaultdict(list)
    for index, tower_id in enumerate(tower_ids.tolist()):
        grouped_indices[operator_by_tower.get(str(tower_id), "unknown")].append(index)

    result: dict[str, dict] = {}
    for operator, indices in grouped_indices.items():
        idx = np.asarray(indices, dtype=np.int64)
        y = labels[idx]
        p = predictions[idx]
        per_fault = {}
        precision, recall, f1, support = precision_recall_fscore_support(y, p, labels=np.arange(len(FAULT_TYPES)), zero_division=0)
        for fault_index, fault_name in enumerate(FAULT_TYPES):
            per_fault[fault_name] = {
                "precision": float(precision[fault_index]),
                "recall": float(recall[fault_index]),
                "f1": float(f1[fault_index]),
                "support": int(support[fault_index]),
            }
        result[operator] = {
            "samples": int(len(idx)),
            "macro_f1": float(f1_score(y, p, average="macro", zero_division=0)),
            "accuracy": float(accuracy_score(y, p)),
            "per_fault": per_fault,
        }
    return result


def per_site_metrics(tower_ids: np.ndarray, labels: np.ndarray, predictions: np.ndarray) -> dict[str, dict]:
    grouped_indices: dict[str, list[int]] = defaultdict(list)
    for index, tower_id in enumerate(tower_ids.tolist()):
        grouped_indices[str(tower_id)].append(index)

    output: dict[str, dict] = {}
    for tower_id, indices in grouped_indices.items():
        idx = np.asarray(indices, dtype=np.int64)
        y = labels[idx]
        p = predictions[idx]
        output[tower_id] = {
            "samples": int(len(idx)),
            "macro_f1": float(f1_score(y, p, average="macro", zero_division=0)),
            "accuracy": float(accuracy_score(y, p)),
            "minority_fault_recall": float(
                precision_recall_fscore_support(
                    y,
                    p,
                    labels=[1, 2, 3],
                    average="macro",
                    zero_division=0,
                )[1]
            ),
        }
    return output


def summarize_site_metrics(site_metrics: dict[str, dict]) -> dict[str, list[dict]]:
    ranked = sorted(site_metrics.items(), key=lambda item: item[1]["macro_f1"])
    worst = [{"tower_id": tower_id, **values} for tower_id, values in ranked[:10]]
    best = [{"tower_id": tower_id, **values} for tower_id, values in ranked[-10:]]
    return {"worst_sites": worst, "best_sites": best}


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    os.environ.setdefault("MPLCONFIGDIR", str(root / ".mplconfig"))
    (root / ".mplconfig").mkdir(exist_ok=True)
    data_path = root / "data" / "output" / "training_data.csv"
    model_path = root / "model" / "lstm_fault.pt"
    scaler_path = root / "model" / "scaler.pkl"

    if not data_path.exists() or not model_path.exists() or not scaler_path.exists():
        raise FileNotFoundError("dataset, model, or scaler is missing")

    frame = pd.read_csv(data_path, parse_dates=["timestamp"]).sort_values(["tower_id", "timestamp"])
    operator_by_tower = (
        frame[["tower_id", "operator"]]
        .drop_duplicates(subset=["tower_id"], keep="last")
        .set_index("tower_id")["operator"]
        .to_dict()
    )

    sequence_frame = build_sequence_frame(frame)
    dataset = split_dataset_with_metadata(sequence_frame)
    train_y = dataset["train"]["y"]
    val_x = dataset["val"]["x"]
    val_y = dataset["val"]["y"]
    test_x = dataset["test"]["x"]
    test_y = dataset["test"]["y"]
    test_tower_ids = dataset["test"]["tower_id"]

    scaler = joblib.load(scaler_path)
    scaled_val = scaler.transform(val_x.reshape(-1, val_x.shape[-1])).reshape(val_x.shape)
    scaled_test = scaler.transform(test_x.reshape(-1, test_x.shape[-1])).reshape(test_x.shape)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = FaultLSTM().to(device)
    model.load_state_dict(torch.load(model_path, map_location=device))
    model.eval()

    def infer_logits(array: np.ndarray) -> np.ndarray:
        with torch.no_grad():
            logits = model(torch.tensor(array, dtype=torch.float32, device=device))
        return logits.cpu().numpy()

    val_logits = infer_logits(scaled_val)
    test_logits = infer_logits(scaled_test)

    bias_candidates = [-0.5, -0.25, 0.0, 0.25, 0.5]
    best_bias = np.zeros(len(FAULT_TYPES), dtype=np.float32)
    best_val_f1 = -1.0
    for congestion_bias, coverage_bias, hardware_bias in product(bias_candidates, repeat=3):
        candidate = np.asarray([0.0, congestion_bias, coverage_bias, hardware_bias], dtype=np.float32)
        val_predictions = np.argmax(val_logits + candidate, axis=1)
        candidate_f1 = f1_score(val_y, val_predictions, average="macro", zero_division=0)
        if candidate_f1 > best_val_f1:
            best_val_f1 = candidate_f1
            best_bias = candidate

    adjusted_test_logits = test_logits + best_bias
    logits_max = np.max(adjusted_test_logits, axis=1, keepdims=True)
    exp_logits = np.exp(adjusted_test_logits - logits_max)
    probabilities = exp_logits / np.sum(exp_logits, axis=1, keepdims=True)
    predictions = np.argmax(adjusted_test_logits, axis=1)

    report = classification_report(test_y, predictions, target_names=FAULT_TYPES, output_dict=True, zero_division=0)
    site_metrics = per_site_metrics(test_tower_ids, test_y, predictions)
    operator_metrics = per_operator_metrics(test_tower_ids, test_y, predictions, operator_by_tower)

    class_balance = {
        "train": _class_counts(train_y),
        "test": _class_counts(test_y),
    }

    calibration = {
        "multiclass_brier": multiclass_brier_score(probabilities, test_y),
        "ece": expected_calibration_error(probabilities, test_y),
        "per_class_brier": {
            FAULT_TYPES[index]: float(np.mean((probabilities[:, index] - (test_y == index).astype(np.float32)) ** 2))
            for index in range(len(FAULT_TYPES))
        },
    }

    metrics = {
        "accuracy": float(accuracy_score(test_y, predictions)),
        "macro_f1": float(f1_score(test_y, predictions, average="macro", zero_division=0)),
        "weighted_f1": float(f1_score(test_y, predictions, average="weighted", zero_division=0)),
        "per_class": report,
        "class_balance": class_balance,
        "calibration": calibration,
        "operator_metrics": operator_metrics,
        "site_metrics_summary": summarize_site_metrics(site_metrics),
        "class_bias": [float(value) for value in best_bias.tolist()],
        "val_macro_f1_after_calibration": float(best_val_f1),
        "window_size": 30,
        "prediction_horizon_minutes": [PREDICTION_HORIZON_START, PREDICTION_HORIZON_END],
        "test_sequences": int(len(test_y)),
        "generated_at": datetime.now(UTC).isoformat(),
    }

    metrics_path = root / "model" / "metrics.json"
    metrics_path.write_text(json.dumps(metrics, indent=2))
    calibration_path = root / "model" / "calibration.json"
    calibration_path.write_text(
        json.dumps(
            {
                "class_bias": [float(value) for value in best_bias.tolist()],
                "val_macro_f1_after_calibration": float(best_val_f1),
                "generated_at": datetime.now(UTC).isoformat(),
            },
            indent=2,
        )
    )
    print(json.dumps(metrics, indent=2))

    matrix = confusion_matrix(test_y, predictions)
    plt.figure(figsize=(8, 6))
    plt.imshow(matrix, interpolation="nearest", cmap="Blues")
    plt.title("Fault Prediction Confusion Matrix")
    plt.colorbar()
    ticks = np.arange(len(FAULT_TYPES))
    plt.xticks(ticks, FAULT_TYPES, rotation=30, ha="right")
    plt.yticks(ticks, FAULT_TYPES)
    plt.xlabel("Predicted")
    plt.ylabel("Actual")
    for row in range(matrix.shape[0]):
        for column in range(matrix.shape[1]):
            plt.text(column, row, str(matrix[row, column]), ha="center", va="center", color="black")
    plt.tight_layout()
    plt.savefig(root / "model" / "confusion_matrix.png", dpi=200)


if __name__ == "__main__":
    main()
