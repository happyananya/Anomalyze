import pandas as pd
from fastapi import APIRouter, Query

from api.database import apply_anomaly_filters, get_anomalies_df

router = APIRouter()

ANOMALY_LABEL_PATH = "data/HDFS_v1/preprocessed/anomaly_label.csv"


def _load_ground_truth():
    try:
        gt = pd.read_csv(ANOMALY_LABEL_PATH)
        total_actual = int((gt["Label"] == "Anomaly").sum())
        total_blocks = len(gt)
        return total_actual, total_blocks
    except Exception:
        return None, None


@router.get("/metrics")
def get_metrics(
    methods: str | None = Query(None),
    block_search: str | None = Query(None),
):
    anom_df = apply_anomaly_filters(get_anomalies_df(), methods, block_search)
    if anom_df.empty:
        return {"has_data": False}

    if_df = anom_df[anom_df["method"] == "isolation_forest"]
    has_labels = "true_label" in if_df.columns and not if_df.empty

    if not has_labels:
        method_counts = anom_df["method"].value_counts().to_dict()
        return {
            "has_data": True,
            "has_labels": False,
            "method_counts": method_counts,
        }

    tp = int((if_df["true_label"] == "Fail").sum())
    fp = int((if_df["true_label"] == "Success").sum())
    detected = len(if_df)
    precision = tp / detected if detected > 0 else 0.0

    total_actual, total_blocks = _load_ground_truth()
    has_full = total_actual is not None

    result: dict = {
        "has_data": True,
        "has_labels": True,
        "has_full_metrics": has_full,
        "detected": detected,
        "tp": tp,
        "fp": fp,
        "precision": round(precision, 4),
    }

    if has_full:
        fn = total_actual - tp
        tn = total_blocks - tp - fp - fn
        recall = tp / total_actual if total_actual > 0 else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0
        result.update({
            "fn": fn,
            "tn": tn,
            "recall": round(recall, 4),
            "f1": round(f1, 4),
            "confusion_matrix": [[tp, fn], [fp, tn]],
        })

    return result


@router.get("/timeline")
def get_timeline(
    methods: str | None = Query(None),
    block_search: str | None = Query(None),
):
    anom_df = apply_anomaly_filters(get_anomalies_df(), methods, block_search)
    if_df = anom_df[anom_df["method"] == "isolation_forest"] if not anom_df.empty else anom_df

    if if_df.empty or "detected_at" not in if_df.columns:
        return []

    df = if_df.copy()
    df["detected_at_ts"] = pd.to_datetime(df["detected_at"], errors="coerce", utc=True)
    df = df.dropna(subset=["detected_at_ts"])
    if df.empty:
        return []

    df["result"] = df["true_label"].map({"Fail": "True Positive", "Success": "False Positive"}) if "true_label" in df.columns else "Unknown"
    df["bucket"] = df["detected_at_ts"].dt.floor("1h").dt.tz_localize(None)

    grp = df.groupby(["bucket", "result"]).size().reset_index(name="count")
    pivot = grp.pivot_table(index="bucket", columns="result", values="count", fill_value=0).reset_index()
    pivot.columns.name = None

    records = []
    for _, row in pivot.iterrows():
        rec = {"time": row["bucket"].isoformat()}
        for col in pivot.columns:
            if col != "bucket":
                rec[col] = int(row[col])
        records.append(rec)
    return records


@router.get("/spikes")
def get_spikes(
    methods: str | None = Query(None),
):
    anom_df = get_anomalies_df()
    if anom_df.empty:
        return []

    stat_df = anom_df[anom_df["method"] == "statistical_threshold"].copy()
    if stat_df.empty or "minute" not in stat_df.columns:
        return []

    stat_df["minute_ts"] = pd.to_datetime(stat_df["minute"], errors="coerce", utc=True)
    stat_df = stat_df.dropna(subset=["minute_ts"])
    if stat_df.empty:
        return []

    return [
        {
            "time": row["minute_ts"].isoformat(),
            "error_count": int(row.get("error_count", 0)),
        }
        for _, row in stat_df.iterrows()
    ]


@router.get("/records")
def get_records(
    methods: str | None = Query(None),
    block_search: str | None = Query(None),
    limit: int = Query(500, ge=1, le=5000),
    offset: int = Query(0, ge=0),
):
    anom_df = apply_anomaly_filters(get_anomalies_df(), methods, block_search)
    total = len(anom_df)

    if anom_df.empty:
        return {"total": 0, "items": []}

    page = anom_df.iloc[offset : offset + limit]
    items = []
    for _, row in page.iterrows():
        rec: dict = {"method": row.get("method", "")}
        if "block_id" in row:
            rec["block_id"] = row["block_id"] if pd.notna(row.get("block_id")) else None
        if "true_label" in row:
            lbl = row.get("true_label")
            rec["true_label"] = lbl if pd.notna(lbl) else None
            rec["correct"] = "True Positive" if lbl == "Fail" else ("False Positive" if lbl == "Success" else None)
        if "minute" in row:
            m = row.get("minute")
            rec["minute"] = str(m) if pd.notna(m) else None
        if "error_count" in row:
            ec = row.get("error_count")
            rec["error_count"] = int(ec) if pd.notna(ec) else None
        if "detected_at" in row:
            rec["detected_at"] = str(row["detected_at"])
        items.append(rec)

    return {"total": total, "items": items}
