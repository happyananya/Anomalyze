"""
Streaming anomaly detector for use inside the Spark write_batch callback.

Builds the K-Means model once from the static event matrix at first call,
then classifies each batch by block_id lookup — no retraining per batch.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MATRIX_PATH = os.path.join(_REPO_ROOT, "data", "HDFS_v1", "preprocessed", "Event_occurrence_matrix.csv")

FEATURE_COLS = [f"E{i}" for i in range(1, 30)]
CONTAMINATION = 16838 / 575061
KMEANS_K = 8

_lookup: dict[str, dict] | None = None


def _build_lookup() -> dict[str, dict]:
    df = pd.read_csv(MATRIX_PATH)
    X = df[FEATURE_COLS].values

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    model = KMeans(n_clusters=KMEANS_K, random_state=42, n_init="auto")
    cluster_ids = model.fit_predict(X_scaled)

    centers = model.cluster_centers_
    diffs = X_scaled - centers[cluster_ids]
    distances = np.sqrt((diffs * diffs).sum(axis=1))

    n_anom = max(1, int(round(CONTAMINATION * len(distances))))
    cutoff = np.partition(distances, -n_anom)[-n_anom]
    y_pred = (distances >= cutoff).astype(int)

    lookup: dict[str, dict] = {}
    for i, row in df.iterrows():
        lookup[row["BlockId"]] = {
            "is_anomaly": bool(y_pred[i]),
            "true_label": row["Label"],
        }
    return lookup


def _get_lookup() -> dict[str, dict]:
    global _lookup
    if _lookup is None:
        print("[detector] Building K-Means model from event matrix …")
        _lookup = _build_lookup()
        n_anom = sum(1 for v in _lookup.values() if v["is_anomaly"])
        print(f"[detector] Ready — {len(_lookup):,} blocks indexed, {n_anom:,} anomalies in model")
    return _lookup


def detect_batch(docs: list[dict]) -> list[dict]:
    """
    Given parsed_log docs from one streaming batch, return anomaly records
    for any block_ids the K-Means model flags. Deduplicates within the batch.
    Caller is responsible for skipping block_ids already in MongoDB.
    """
    lookup = _get_lookup()
    detected_at = datetime.now(timezone.utc).isoformat()

    seen: set[str] = set()
    anomalies: list[dict] = []
    for doc in docs:
        block_id = doc.get("block_id")
        if not block_id or block_id in seen:
            continue
        seen.add(block_id)
        info = lookup.get(block_id)
        if info and info["is_anomaly"]:
            anomalies.append({
                "method": "kmeans_distance",
                "block_id": block_id,
                "true_label": info["true_label"],
                "detected_at": detected_at,
            })
    return anomalies
