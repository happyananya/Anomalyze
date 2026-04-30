"""
Anomaly detector for Anomalyze.

Two detection methods:
  1. Isolation Forest (ML) — trained on Event_occurrence_matrix.csv (E1-E29 features).
     Labels: Success / Fail  (~2.9% anomaly rate).
  2. Statistical threshold — error-rate spike detection on parsed_logs in MongoDB.

Results are saved to MongoDB: anomalyze.anomalies

Run:
  python -m detector.anomaly_detector
"""

import os
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from pymongo import MongoClient
from sklearn.ensemble import IsolationForest
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.preprocessing import StandardScaler

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "HDFS_v1", "preprocessed")
MATRIX_PATH = os.path.join(DATA_DIR, "Event_occurrence_matrix.csv")

MONGO_URI = "mongodb://localhost:27017"
MONGO_DB = "anomalyze"
COL_LOGS = "parsed_logs"
COL_ANOMALIES = "anomalies"

FEATURE_COLS = [f"E{i}" for i in range(1, 30)]
CONTAMINATION = 16838 / 575061  # real anomaly rate from the dataset


# ── 1. Isolation Forest ───────────────────────────────────────────────────────

def run_isolation_forest() -> pd.DataFrame:
    print("Loading event matrix …")
    df = pd.read_csv(MATRIX_PATH)

    # True labels: Fail → 1 (anomaly), Success → 0
    y_true = (df["Label"] == "Fail").astype(int).values
    X = df[FEATURE_COLS].values

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    print(f"Training Isolation Forest on {len(X):,} blocks …")
    model = IsolationForest(
        n_estimators=100,
        contamination=CONTAMINATION,
        random_state=42,
        n_jobs=-1,
    )
    raw_preds = model.fit_predict(X_scaled)
    # IsolationForest: -1 = anomaly, 1 = normal
    y_pred = (raw_preds == -1).astype(int)

    print("\n── Isolation Forest Results ──")
    print(classification_report(y_true, y_pred, target_names=["Normal", "Anomaly"]))
    print("Confusion matrix (rows=true, cols=pred):")
    print(confusion_matrix(y_true, y_pred))

    df["if_anomaly"] = y_pred
    return df


# ── 2. Statistical threshold ──────────────────────────────────────────────────

def run_statistical_detection(client: MongoClient) -> list[dict]:
    """
    Counts ERROR/WARN log lines per minute from MongoDB parsed_logs.
    Flags any minute where the error count is > mean + 2*std as an anomaly.
    """
    docs = list(client[MONGO_DB][COL_LOGS].find(
        {"level": {"$in": ["ERROR", "WARN"]}},
        {"date": 1, "time": 1, "level": 1, "block_id": 1, "_id": 0},
    ))

    if not docs:
        print("No ERROR/WARN docs in parsed_logs — skipping statistical detection.")
        return []

    df = pd.DataFrame(docs)
    # Build a datetime from YYMMDD + HHMMSS, bucket by minute
    df["ts"] = pd.to_datetime(df["date"] + df["time"], format="%y%m%d%H%M%S", errors="coerce")
    df = df.dropna(subset=["ts"])
    df["minute"] = df["ts"].dt.floor("min")

    counts = df.groupby("minute").size().rename("error_count").reset_index()
    mean, std = counts["error_count"].mean(), counts["error_count"].std()
    threshold = mean + 2 * std

    spikes = counts[counts["error_count"] > threshold].copy()
    print(f"\n── Statistical Threshold Results ──")
    print(f"Mean errors/min: {mean:.1f}, std: {std:.1f}, threshold: {threshold:.1f}")
    print(f"Spike minutes detected: {len(spikes)}")

    return spikes.to_dict("records")


# ── Save to MongoDB ───────────────────────────────────────────────────────────

def save_anomalies(client: MongoClient, if_df: pd.DataFrame, stat_spikes: list[dict]) -> None:
    col = client[MONGO_DB][COL_ANOMALIES]
    col.drop()  # fresh run each time

    detected_at = datetime.now(timezone.utc).isoformat()
    docs = []

    # Isolation Forest anomalies — store block_id + scores
    if_anomalies = if_df[if_df["if_anomaly"] == 1][["BlockId", "Label"]].copy()
    for _, row in if_anomalies.iterrows():
        docs.append({
            "method": "isolation_forest",
            "block_id": row["BlockId"],
            "true_label": row["Label"],
            "detected_at": detected_at,
        })

    # Statistical spike anomalies
    for spike in stat_spikes:
        docs.append({
            "method": "statistical_threshold",
            "minute": spike["minute"].isoformat() if hasattr(spike["minute"], "isoformat") else str(spike["minute"]),
            "error_count": int(spike["error_count"]),
            "detected_at": detected_at,
        })

    if docs:
        col.insert_many(docs)

    print(f"\nSaved {len(if_anomalies):,} IF anomalies + {len(stat_spikes)} stat spikes → MongoDB:{MONGO_DB}/{COL_ANOMALIES}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    client = MongoClient(MONGO_URI)

    if_df = run_isolation_forest()
    stat_spikes = run_statistical_detection(client)
    save_anomalies(client, if_df, stat_spikes)

    client.close()
    print("\nDone. Next step: run the dashboard to visualize results.")


if __name__ == "__main__":
    main()
