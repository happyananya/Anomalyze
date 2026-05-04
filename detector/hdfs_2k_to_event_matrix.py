"""
Build a block-level Event_occurrence_matrix (E1–E29 + Label) from HDFS_2k.log.

HDFS_2k.log is raw text; event IDs and parsing follow LogHub's
HDFS_2k.log_structured.csv. This script checks your log line count matches that
file, downloads the structured CSV + loglizer anomaly_label.csv, aggregates
counts per BlockId, and writes a CSV compatible with compare_spark_anomaly_models.

Labels use Anomaly/Normal in the source file; output uses Fail/Success like
Event_occurrence_matrix.csv (Fail = anomaly).

Run:
  python -m detector.hdfs_2k_to_event_matrix --log ~/Downloads/HDFS_2k.log \\
    --out data/HDFS_v1/preprocessed/Event_occurrence_matrix_2k.csv
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import tempfile

import pandas as pd


def _download(url: str) -> str:
    """Fetch URL to a temp file (curl avoids some Python SSL setups on macOS)."""
    fd, path = tempfile.mkstemp(suffix=".csv")
    os.close(fd)
    try:
        subprocess.run(["curl", "-fsSL", url, "-o", path], check=True)
        return path
    except (subprocess.CalledProcessError, FileNotFoundError):
        os.unlink(path)
        raise

STRUCTURED_URL = (
    "https://raw.githubusercontent.com/logpai/loghub/master/HDFS/HDFS_2k.log_structured.csv"
)
LABEL_URL = (
    "https://raw.githubusercontent.com/logpai/loglizer/master/data/HDFS/anomaly_label.csv"
)
FEATURE_COLS = [f"E{i}" for i in range(1, 30)]

BLOCK_RE = re.compile(r"(blk_-?\d+)")


def _primary_block_id(content: str) -> str | None:
    ms = BLOCK_RE.findall(content or "")
    return ms[0] if ms else None


def build_matrix_from_structured(struct_df: pd.DataFrame) -> pd.DataFrame:
    struct_df = struct_df.copy()
    struct_df["BlockId"] = struct_df["Content"].map(_primary_block_id)
    struct_df = struct_df.dropna(subset=["BlockId"])
    struct_df["EventId"] = struct_df["EventId"].astype(str).str.strip().str.upper()

    counts = (
        struct_df.groupby(["BlockId", "EventId"], observed=False)
        .size()
        .reset_index(name="cnt")
    )
    wide = counts.pivot(index="BlockId", columns="EventId", values="cnt").fillna(0.0)
    for c in FEATURE_COLS:
        if c not in wide.columns:
            wide[c] = 0.0
    extra = [c for c in wide.columns if c not in FEATURE_COLS]
    if extra:
        wide = wide.drop(columns=extra, errors="ignore")
    wide = wide[FEATURE_COLS]
    return wide.reset_index()


def main() -> int:
    parser = argparse.ArgumentParser(description="HDFS_2k.log → Event_occurrence_matrix CSV")
    parser.add_argument("--log", required=True, help="Path to HDFS_2k.log")
    parser.add_argument("--out", required=True, help="Output CSV path")
    parser.add_argument(
        "--structured",
        default=None,
        help="Optional local HDFS_2k.log_structured.csv (default: download from LogHub)",
    )
    parser.add_argument(
        "--labels",
        default=None,
        help="Optional local anomaly_label.csv (default: download from loglizer)",
    )
    args = parser.parse_args()

    if not os.path.isfile(args.log):
        print(f"Error: log not found: {args.log}", file=sys.stderr)
        return 1

    with open(args.log, encoding="utf-8", errors="replace") as f:
        log_lines = [ln for ln in f.read().splitlines() if ln.strip()]

    if args.structured:
        struct_df = pd.read_csv(args.structured)
    else:
        p = _download(STRUCTURED_URL)
        try:
            struct_df = pd.read_csv(p)
        finally:
            os.unlink(p)

    if len(log_lines) != len(struct_df):
        print(
            f"Error: line count mismatch — log has {len(log_lines)} non-empty lines, "
            f"structured CSV has {len(struct_df)} rows. Use the matching HDFS_2k pair from LogHub.",
            file=sys.stderr,
        )
        return 1

    matrix = build_matrix_from_structured(struct_df)

    if args.labels:
        labels = pd.read_csv(args.labels)
    else:
        p = _download(LABEL_URL)
        try:
            labels = pd.read_csv(p)
        finally:
            os.unlink(p)

    if "BlockId" not in labels.columns or "Label" not in labels.columns:
        print("Error: labels CSV must have BlockId and Label columns.", file=sys.stderr)
        return 1

    out = matrix.merge(labels[["BlockId", "Label"]], on="BlockId", how="left")
    out["Label"] = out["Label"].fillna("Normal")
    out["Label"] = out["Label"].replace({"Anomaly": "Fail", "Normal": "Success"})

    os.makedirs(os.path.dirname(os.path.abspath(args.out)) or ".", exist_ok=True)
    out.to_csv(args.out, index=False)

    n_fail = int((out["Label"] == "Fail").sum())
    print(f"Wrote {len(out):,} blocks → {args.out}")
    print(f"  Anomalies (Fail): {n_fail}, normal (Success): {len(out) - n_fail}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
