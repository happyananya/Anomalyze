"""
Compare K-Means (PySpark ML) vs One-Class SVM on the HDFS event matrix.

Data: same as detector/anomaly_detector.py — Event_occurrence_matrix.csv (E1–E29).

K-Means (PySpark ML): VectorAssembler + StandardScaler + KMeans. Anomaly score =
Euclidean distance from each point to its assigned cluster centroid. We flag the
same *fraction* of points as anomalies as Isolation Forest (CONTAMINATION), by
taking the farthest points — comparable decision budget to IF's contamination.

One-Class SVM: Apache Spark / PySpark MLlib does **not** implement One-Class SVM
(only binary LinearSVC / legacy SVMWithSGD). We therefore use sklearn.svm.OneClassSVM
on the identically StandardScaler-transformed feature matrix so Precision/Recall
are comparable in your report; note the engine is scikit-learn, not Spark.

Optional: prints Isolation Forest metrics using the same contamination setting.

Run:
  python3 -m detector.compare_spark_anomaly_models

  # smaller KMeans k or custom CSV path:
  python3 -m detector.compare_spark_anomaly_models --kmeans-k 4 --csv /path/to/Event_occurrence_matrix.csv

  # HDFS_2k matrix + empirical anomaly rate; sklearn K-Means if Java is not installed:
  python3 -m detector.hdfs_2k_to_event_matrix --log ~/Downloads/HDFS_2k.log --out data/HDFS_v1/preprocessed/Event_occurrence_matrix_2k.csv
  python3 -m detector.compare_spark_anomaly_models --csv data/HDFS_v1/preprocessed/Event_occurrence_matrix_2k.csv --empirical-contamination --no-spark
"""

from __future__ import annotations

import argparse
import os
import sys
from typing import Any

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans as SKLearnKMeans
from sklearn.ensemble import IsolationForest
from sklearn.metrics import precision_recall_fscore_support
from sklearn.preprocessing import StandardScaler
from sklearn.svm import OneClassSVM

from pyspark.ml import Pipeline
from pyspark.ml.clustering import KMeans
from pyspark.ml.feature import StandardScaler as SparkStandardScaler
from pyspark.ml.feature import VectorAssembler
from pyspark.sql import SparkSession

# Match anomaly_detector.py
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "HDFS_v1", "preprocessed")
DEFAULT_MATRIX_PATH = os.path.join(DATA_DIR, "Event_occurrence_matrix.csv")
FEATURE_COLS = [f"E{i}" for i in range(1, 30)]
CONTAMINATION_FULL_HDFS_V1 = 16838 / 575061


def _binary_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, Any]:
    """Anomaly = positive class (1)."""
    precision, recall, f1, _ = precision_recall_fscore_support(
        y_true, y_pred, average="binary", pos_label=1, zero_division=0
    )
    tp = int(np.sum((y_true == 1) & (y_pred == 1)))
    fp = int(np.sum((y_true == 0) & (y_pred == 1)))
    fn = int(np.sum((y_true == 1) & (y_pred == 0)))
    tn = int(np.sum((y_true == 0) & (y_pred == 0)))
    return {
        "precision": float(precision),
        "recall": float(recall),
        "f1": float(f1),
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "tn": tn,
    }


def _dense_vec_to_numpy(v) -> np.ndarray:
    return np.asarray(v.toArray() if hasattr(v, "toArray") else v, dtype=np.float64)


def _y_true_binary(labels: pd.Series) -> np.ndarray:
    s = labels.astype(str)
    if s.isin(["Fail", "Success"]).any():
        return (s == "Fail").astype(np.int32).values
    if s.isin(["Anomaly", "Normal"]).any():
        return (s == "Anomaly").astype(np.int32).values
    raise ValueError("Label column must be Fail/Success or Anomaly/Normal.")


def run_isolation_forest_baseline(
    X_scaled: np.ndarray, y_true: np.ndarray, contamination: float
) -> dict[str, Any]:
    c = float(min(max(contamination, 1e-6), 0.5))
    model = IsolationForest(
        n_estimators=100,
        contamination=c,
        random_state=42,
        n_jobs=-1,
    )
    raw = model.fit_predict(X_scaled)
    y_pred = (raw == -1).astype(np.int32)
    m = _binary_metrics(y_true, y_pred)
    m["model"] = "Isolation Forest (sklearn)"
    return m


def run_one_class_svm(
    X_scaled: np.ndarray, y_true: np.ndarray, contamination: float
) -> dict[str, Any]:
    # nu: upper bound on training outliers; ~contamination is standard heuristic
    nu = float(min(max(contamination, 1e-6), 0.99))
    clf = OneClassSVM(kernel="rbf", gamma="scale", nu=nu)
    clf.fit(X_scaled)
    raw = clf.predict(X_scaled)
    y_pred = (raw == -1).astype(np.int32)
    m = _binary_metrics(y_true, y_pred)
    m["model"] = f"One-Class SVM (sklearn, nu={nu:.4f})"
    return m


def run_kmeans_spark(
    pdf: pd.DataFrame,
    kmeans_k: int,
    y_true: np.ndarray,
    spark: SparkSession,
    contamination: float,
) -> dict[str, Any]:
    sdf = spark.createDataFrame(pdf[FEATURE_COLS + ["Label"]])
    assembler = VectorAssembler(inputCols=FEATURE_COLS, outputCol="raw_features", handleInvalid="skip")
    scaler = SparkStandardScaler(
        inputCol="raw_features",
        outputCol="features",
        withMean=True,
        withStd=True,
    )
    kmeans = KMeans(
        featuresCol="features",
        predictionCol="prediction",
        k=kmeans_k,
        seed=42,
        maxIter=30,
    )
    pipe = Pipeline(stages=[assembler, scaler, kmeans])
    model = pipe.fit(sdf)
    transformed = model.transform(sdf)

    kmeans_model = model.stages[-1]
    centers = np.asarray([c for c in kmeans_model.clusterCenters()], dtype=np.float64)

    rows = transformed.select("features", "prediction").collect()
    X = np.stack([_dense_vec_to_numpy(r.features) for r in rows])
    pred_idx = np.array([int(r.prediction) for r in rows], dtype=np.int64)
    dists = np.linalg.norm(X - centers[pred_idx], axis=1)

    n = len(dists)
    n_anom = int(round(contamination * n))
    n_anom = max(1, min(n_anom, n))

    farthest_idx = np.argsort(-dists)[:n_anom]
    y_pred = np.zeros(n, dtype=np.int32)
    y_pred[farthest_idx] = 1

    m = _binary_metrics(y_true, y_pred)
    m["model"] = f"K-Means distance (PySpark ML, k={kmeans_k})"
    return m


def run_kmeans_sklearn(
    X_scaled: np.ndarray,
    y_true: np.ndarray,
    kmeans_k: int,
    contamination: float,
) -> dict[str, Any]:
    """Same distance-to-centroid + top-fraction rule as Spark path; no JVM required."""
    km = SKLearnKMeans(n_clusters=kmeans_k, random_state=42, n_init="auto")
    pred = km.fit_predict(X_scaled)
    centers = km.cluster_centers_
    dists = np.linalg.norm(X_scaled - centers[pred], axis=1)
    n = len(dists)
    n_anom = int(round(contamination * n))
    n_anom = max(1, min(n_anom, n))
    farthest_idx = np.argsort(-dists)[:n_anom]
    y_pred = np.zeros(n, dtype=np.int32)
    y_pred[farthest_idx] = 1
    m = _binary_metrics(y_true, y_pred)
    m["model"] = f"K-Means distance (sklearn, k={kmeans_k})"
    return m


def _print_table(rows: list[dict[str, Any]]) -> None:
    name_w = max(len(str(r["model"])) for r in rows)
    header = f"{'Model':<{name_w}}  {'Precision':>10}  {'Recall':>10}  {'F1':>10}"
    print("\n" + header)
    print("-" * len(header))
    for r in rows:
        print(
            f"{r['model']:<{name_w}}  {r['precision']:10.4f}  {r['recall']:10.4f}  {r['f1']:10.4f}"
        )
    print("\nCounts (TP, FP, FN, TN):")
    for r in rows:
        print(f"  {r['model']}: tp={r['tp']}, fp={r['fp']}, fn={r['fn']}, tn={r['tn']}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Compare K-Means / OCSVM / IF on HDFS event matrix.")
    parser.add_argument("--csv", default=DEFAULT_MATRIX_PATH, help="Path to Event_occurrence_matrix.csv")
    parser.add_argument("--kmeans-k", type=int, default=8, help="Number of KMeans clusters")
    parser.add_argument("--skip-if", action="store_true", help="Omit Isolation Forest baseline row")
    parser.add_argument(
        "--empirical-contamination",
        action="store_true",
        help="Set contamination/nu to the anomaly rate in the CSV (use for HDFS_2k subsets). "
        "Default uses full HDFS_v1 rate (~2.9%%).",
    )
    parser.add_argument(
        "--no-spark",
        action="store_true",
        help="Run K-Means with sklearn instead of PySpark (use when Java is not installed).",
    )
    args = parser.parse_args()

    path = args.csv
    if not os.path.isfile(path):
        print(f"Error: matrix not found: {path}", file=sys.stderr)
        print("Download/preprocess HDFS_v1 data into data/HDFS_v1/preprocessed/ first.", file=sys.stderr)
        return 1

    pdf = pd.read_csv(path)
    missing = [c for c in FEATURE_COLS if c not in pdf.columns]
    if missing:
        print(f"Error: CSV missing columns: {missing}", file=sys.stderr)
        return 1
    if "Label" not in pdf.columns:
        print("Error: CSV must include a 'Label' column (Success/Fail).", file=sys.stderr)
        return 1

    X = pdf[FEATURE_COLS].values.astype(np.float64)
    y_true = _y_true_binary(pdf["Label"])

    contamination = float(np.mean(y_true)) if args.empirical_contamination else CONTAMINATION_FULL_HDFS_V1

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    print(
        f"Loaded {len(pdf):,} blocks, contamination={contamination:.4f} "
        f"({'empirical from labels' if args.empirical_contamination else 'full HDFS_v1 default'}), "
        f"~{int(round(contamination * len(pdf))):,} flagged slots if exact fraction.\n"
        "Note: PySpark MLlib has no One-Class SVM; OCSVM row uses sklearn on the same scaled X.\n"
    )

    results: list[dict[str, Any]] = []
    if args.no_spark:
        results.append(
            run_kmeans_sklearn(X_scaled, y_true, args.kmeans_k, contamination)
        )
    else:
        spark = (
            SparkSession.builder.appName("anomalyze-compare-kmeans")
            .master(os.environ.get("SPARK_MASTER_URL", "local[*]"))
            .config("spark.sql.shuffle.partitions", "64")
            .getOrCreate()
        )
        spark.sparkContext.setLogLevel("WARN")
        try:
            results.append(
                run_kmeans_spark(pdf, args.kmeans_k, y_true, spark, contamination)
            )
        finally:
            spark.stop()

    results.append(run_one_class_svm(X_scaled, y_true, contamination))
    if not args.skip_if:
        results.append(run_isolation_forest_baseline(X_scaled, y_true, contamination))

    _print_table(results)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
