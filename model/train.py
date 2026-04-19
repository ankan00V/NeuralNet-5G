from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import torch
from sklearn.metrics import f1_score
from sklearn.preprocessing import StandardScaler
from torch import nn
from torch.nn import functional as F
from torch.utils.data import DataLoader, TensorDataset

from model.feature_engineering import INPUT_SIZE, RAW_FEATURES, engineer_sequence_features
from model.inference import FaultLSTM


FEATURES = RAW_FEATURES
WINDOW_SIZE = 30
PREDICTION_HORIZON_START = 15
PREDICTION_HORIZON_END = 30


def create_sequences(frame: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    windows: list[np.ndarray] = []
    labels: list[int] = []

    for _, group in frame.groupby("tower_id"):
        values = group.sort_values("timestamp")
        feature_values = values[FEATURES].to_numpy(dtype=np.float32)
        label_values = values["fault_label"].to_numpy(dtype=np.int64)
        for index in range(WINDOW_SIZE, len(values)):
            windows.append(feature_values[index - WINDOW_SIZE:index])
            labels.append(int(label_values[index]))

    return np.asarray(windows), np.asarray(labels)


def determine_future_label(labels: np.ndarray, current_index: int) -> int:
    future_start = current_index + PREDICTION_HORIZON_START
    future_end = min(len(labels), current_index + PREDICTION_HORIZON_END + 1)
    if future_start >= future_end:
        return -1

    future_slice = labels[future_start:future_end]
    future_faults = future_slice[future_slice != 0]
    if len(future_faults) == 0:
        return 0

    counts = np.bincount(future_faults, minlength=4)
    counts[0] = 0
    return int(np.argmax(counts))


def build_sequence_frame(frame: pd.DataFrame) -> pd.DataFrame:
    rows: list[dict] = []
    for tower_id, group in frame.groupby("tower_id"):
        values = group.sort_values("timestamp").reset_index(drop=True)
        feature_values = values[FEATURES].to_numpy(dtype=np.float32)
        label_source = "future_fault_label" if "future_fault_label" in values.columns else "fault_label"
        label_values = values[label_source].to_numpy(dtype=np.int64)
        timestamp_values = values["timestamp"].to_numpy()

        for index in range(WINDOW_SIZE, len(values) - PREDICTION_HORIZON_START):
            if label_source == "future_fault_label":
                label = int(label_values[index])
            else:
                label = determine_future_label(label_values, index)
            if label < 0:
                continue
            rows.append(
                {
                    "tower_id": tower_id,
                    "timestamp": timestamp_values[index],
                    "features": engineer_sequence_features(feature_values[index - WINDOW_SIZE:index]),
                    "label": label,
                }
            )
    return pd.DataFrame(rows)


def split_dataset(sequence_frame: pd.DataFrame) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    partitions: dict[str, list[np.ndarray]] = {"train_x": [], "train_y": [], "val_x": [], "val_y": [], "test_x": [], "test_y": []}

    for _, group in sequence_frame.groupby("tower_id"):
        ordered = group.sort_values("timestamp").reset_index(drop=True)
        total = len(ordered)
        train_end = int(total * 0.8)
        val_end = int(total * 0.9)

        partitions["train_x"].extend(ordered.iloc[:train_end]["features"].tolist())
        partitions["train_y"].extend(ordered.iloc[:train_end]["label"].tolist())
        partitions["val_x"].extend(ordered.iloc[train_end:val_end]["features"].tolist())
        partitions["val_y"].extend(ordered.iloc[train_end:val_end]["label"].tolist())
        partitions["test_x"].extend(ordered.iloc[val_end:]["features"].tolist())
        partitions["test_y"].extend(ordered.iloc[val_end:]["label"].tolist())

    return {
        "train": (np.asarray(partitions["train_x"], dtype=np.float32), np.asarray(partitions["train_y"], dtype=np.int64)),
        "val": (np.asarray(partitions["val_x"], dtype=np.float32), np.asarray(partitions["val_y"], dtype=np.int64)),
        "test": (np.asarray(partitions["test_x"], dtype=np.float32), np.asarray(partitions["test_y"], dtype=np.int64)),
    }


def rebalance_training_set(features: np.ndarray, labels: np.ndarray, seed: int = 42) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    indices_by_class = {label: np.where(labels == label)[0] for label in range(4)}
    normal_indices = indices_by_class[0]
    fault_indices = np.concatenate([indices_by_class[1], indices_by_class[2], indices_by_class[3]])

    if len(fault_indices) == 0 or len(normal_indices) == 0:
        return features, labels

    target_by_class = {
        1: max(6000, int(len(indices_by_class[1]) * 2.2)) if len(indices_by_class[1]) > 0 else 0,
        2: max(7000, int(len(indices_by_class[2]) * 2.8)) if len(indices_by_class[2]) > 0 else 0,
        3: max(7000, int(len(indices_by_class[3]) * 2.8)) if len(indices_by_class[3]) > 0 else 0,
    }

    sampled_fault_indices = []
    for label in (1, 2, 3):
        class_indices = indices_by_class[label]
        if len(class_indices) == 0:
            continue
        target_fault_count = target_by_class[label]
        if len(class_indices) >= target_fault_count:
            sampled = rng.choice(class_indices, size=target_fault_count, replace=False)
        else:
            sampled = rng.choice(class_indices, size=target_fault_count, replace=True)
        sampled_fault_indices.append(sampled)

    combined_faults = np.concatenate(sampled_fault_indices)
    normal_cap = min(len(normal_indices), max(int(len(combined_faults) * 1.05), 10_000))
    sampled_normal = rng.choice(normal_indices, size=normal_cap, replace=False)
    selected = np.concatenate([combined_faults, sampled_normal])
    rng.shuffle(selected)
    return features[selected], labels[selected]


class ClassBalancedFocalLoss(nn.Module):
    def __init__(self, alpha: torch.Tensor, gamma: float = 2.0) -> None:
        super().__init__()
        self.register_buffer("alpha", alpha)
        self.gamma = gamma

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        log_probs = F.log_softmax(logits, dim=-1)
        probs = torch.exp(log_probs)
        target_log_probs = log_probs.gather(1, targets.unsqueeze(1)).squeeze(1)
        target_probs = probs.gather(1, targets.unsqueeze(1)).squeeze(1)
        alpha_t = self.alpha[targets]
        loss = -alpha_t * ((1.0 - target_probs) ** self.gamma) * target_log_probs
        return loss.mean()


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    data_path = root / "data" / "output" / "training_data.csv"
    if not data_path.exists():
        raise FileNotFoundError(f"training dataset not found: {data_path}")

    frame = pd.read_csv(data_path, parse_dates=["timestamp"]).sort_values(["tower_id", "timestamp"])
    sequence_frame = build_sequence_frame(frame)
    dataset = split_dataset(sequence_frame)

    scaler = StandardScaler()
    train_x, train_y = dataset["train"]
    val_x, val_y = dataset["val"]
    test_x, test_y = dataset["test"]
    raw_train_size = len(train_x)
    train_x, train_y = rebalance_training_set(train_x, train_y)

    train_x_flat = train_x.reshape(-1, train_x.shape[-1])
    scaler.fit(train_x_flat)

    def scale_windows(array: np.ndarray) -> np.ndarray:
        scaled = scaler.transform(array.reshape(-1, array.shape[-1]))
        return scaled.reshape(array.shape)

    train_x = scale_windows(train_x)
    val_x = scale_windows(val_x)
    test_x = scale_windows(test_x)

    scaler_path = root / "model" / "scaler.pkl"
    joblib.dump(scaler, scaler_path)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    torch.set_num_threads(min(8, torch.get_num_threads()))
    model = FaultLSTM().to(device)

    class_counts = np.bincount(train_y, minlength=4)
    effective_num = 1.0 - np.power(0.999, np.maximum(class_counts, 1))
    class_weights = (1.0 - 0.999) / np.maximum(effective_num, 1e-8)
    class_weights = class_weights / class_weights.mean()
    criterion = ClassBalancedFocalLoss(
        alpha=torch.tensor(class_weights, dtype=torch.float32, device=device),
        gamma=2.0,
    )
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=50)

    train_loader = DataLoader(
        TensorDataset(torch.tensor(train_x), torch.tensor(train_y)),
        batch_size=512,
        shuffle=True,
    )
    val_loader = DataLoader(
        TensorDataset(torch.tensor(val_x), torch.tensor(val_y)),
        batch_size=512,
    )

    best_f1 = -1.0
    patience = 8
    stale_epochs = 0
    best_model_path = root / "model" / "lstm_fault.pt"

    print(
        json.dumps(
            {
                "train_sequences_raw": int(raw_train_size),
                "train_sequences_balanced": int(len(train_x)),
                "val_sequences": int(len(val_x)),
                "test_sequences": int(len(test_x)),
                "input_size": INPUT_SIZE,
                "prediction_horizon_minutes": [PREDICTION_HORIZON_START, PREDICTION_HORIZON_END],
                "train_label_counts": {str(index): int(count) for index, count in enumerate(np.bincount(train_y, minlength=4))},
            },
            indent=2,
        ),
        flush=True,
    )

    for epoch in range(50):
        model.train()
        for batch_features, batch_labels in train_loader:
            batch_features = batch_features.to(device=device, dtype=torch.float32)
            batch_labels = batch_labels.to(device=device, dtype=torch.long)
            optimizer.zero_grad()
            logits = model(batch_features)
            loss = criterion(logits, batch_labels)
            loss.backward()
            optimizer.step()

        scheduler.step()

        model.eval()
        predictions = []
        targets = []
        with torch.no_grad():
            for batch_features, batch_labels in val_loader:
                logits = model(batch_features.to(device=device, dtype=torch.float32))
                predictions.extend(torch.argmax(logits, dim=-1).cpu().numpy().tolist())
                targets.extend(batch_labels.numpy().tolist())

        val_f1 = f1_score(targets, predictions, average="macro", zero_division=0)
        print(f"epoch={epoch + 1} val_macro_f1={val_f1:.4f}", flush=True)

        if val_f1 > best_f1:
            best_f1 = val_f1
            stale_epochs = 0
            torch.save(model.state_dict(), best_model_path)
        else:
            stale_epochs += 1
            if stale_epochs >= patience:
                print("early stopping triggered")
                break

    raw_feature_means = train_x[:, :, : len(RAW_FEATURES)].mean(axis=(0, 1))
    raw_feature_stds = train_x[:, :, : len(RAW_FEATURES)].std(axis=(0, 1))

    metadata = {
        "best_val_macro_f1": best_f1,
        "train_sequences_raw": int(raw_train_size),
        "train_sequences": int(len(train_x)),
        "val_sequences": int(len(val_x)),
        "test_sequences": int(len(test_x)),
        "input_size": INPUT_SIZE,
        "prediction_horizon_minutes": [PREDICTION_HORIZON_START, PREDICTION_HORIZON_END],
        "train_label_counts": {str(index): int(count) for index, count in enumerate(np.bincount(train_y, minlength=4))},
        "val_label_counts": {str(index): int(count) for index, count in enumerate(np.bincount(val_y, minlength=4))},
        "test_label_counts": {str(index): int(count) for index, count in enumerate(np.bincount(test_y, minlength=4))},
        "raw_feature_baseline": {
            name: {
                "mean": float(raw_feature_means[index]),
                "std": float(raw_feature_stds[index]),
            }
            for index, name in enumerate(RAW_FEATURES)
        },
    }
    metadata_path = root / "model" / "train_metadata.json"
    metadata_path.write_text(json.dumps(metadata, indent=2))
    print(f"saved model to {best_model_path}", flush=True)


if __name__ == "__main__":
    main()
