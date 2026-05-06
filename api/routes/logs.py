from fastapi import APIRouter, Query

from api.database import apply_log_filters, get_logs_df

router = APIRouter()

GRANULARITY_MAP = {
    "1min": "1min",
    "5min": "5min",
    "15min": "15min",
    "1h": "1h",
}


@router.get("/timeseries")
def get_timeseries(
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    levels: str | None = Query(None),
    components: str | None = Query(None),
    granularity: str = Query("5min"),
):
    df = apply_log_filters(get_logs_df(), start_date, end_date, levels, components)
    if df.empty:
        return []

    freq = GRANULARITY_MAP.get(granularity, "5min")
    df = df.copy()
    df["bucket"] = df["ts"].dt.floor(freq)

    counts = df.groupby(["bucket", "level"]).size().reset_index(name="count")
    pivot = counts.pivot_table(
        index="bucket", columns="level", values="count", fill_value=0
    ).reset_index()
    pivot.columns.name = None

    records = []
    for _, row in pivot.iterrows():
        rec = {"time": row["bucket"].isoformat()}
        for col in pivot.columns:
            if col != "bucket":
                rec[col] = int(row[col])
        records.append(rec)
    return records


@router.get("/error-rate")
def get_error_rate(
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    levels: str | None = Query(None),
    components: str | None = Query(None),
    granularity: str = Query("5min"),
):
    df = apply_log_filters(get_logs_df(), start_date, end_date, levels, components)
    if df.empty:
        return []

    freq = GRANULARITY_MAP.get(granularity, "5min")
    df = df.copy()
    df["bucket"] = df["ts"].dt.floor(freq)

    counts = df.groupby(["bucket", "level"]).size().reset_index(name="count")
    pivot = counts.pivot_table(
        index="bucket", columns="level", values="count", fill_value=0
    ).reset_index()
    pivot.columns.name = None

    total = pivot.drop(columns="bucket").sum(axis=1).replace(0, 1)
    error_col = pivot.get("ERROR", 0)
    pivot["error_rate"] = (error_col / total * 100).round(2)

    return [
        {"time": row["bucket"].isoformat(), "error_rate": float(row["error_rate"])}
        for _, row in pivot.iterrows()
    ]


@router.get("/components")
def get_components(
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    levels: str | None = Query(None),
    components: str | None = Query(None),
    top_n: int = Query(20),
):
    df = apply_log_filters(get_logs_df(), start_date, end_date, levels, components)
    if df.empty:
        return []

    counts = df.groupby(["component", "level"]).size().reset_index(name="count")
    top_comps = (
        counts.groupby("component")["count"]
        .sum()
        .nlargest(top_n)
        .index.tolist()
    )
    counts = counts[counts["component"].isin(top_comps)]

    pivot = counts.pivot_table(
        index="component", columns="level", values="count", fill_value=0
    ).reset_index()
    pivot.columns.name = None
    pivot["total"] = pivot.drop(columns="component").sum(axis=1)
    pivot = pivot.sort_values("total", ascending=True)

    records = []
    for _, row in pivot.iterrows():
        rec = {"component": row["component"], "total": int(row["total"])}
        for col in pivot.columns:
            if col not in ("component", "total"):
                rec[col] = int(row[col])
        records.append(rec)
    return records


@router.get("/heatmap")
def get_heatmap(
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    levels: str | None = Query(None),
    components: str | None = Query(None),
    top_n: int = Query(10),
):
    df = apply_log_filters(get_logs_df(), start_date, end_date, levels, components)
    if df.empty:
        return {"components": [], "hours": list(range(24)), "values": []}

    df = df.copy()
    df["hour"] = df["ts"].dt.hour

    heat = (
        df[df["level"].isin(["ERROR", "WARN"])]
        .groupby(["component", "hour"])
        .size()
        .reset_index(name="count")
    )

    top_comps = (
        df.groupby("component")["level"]
        .count()
        .nlargest(top_n)
        .index.tolist()
    )
    heat = heat[heat["component"].isin(top_comps)]

    if heat.empty:
        return {"components": [], "hours": list(range(24)), "values": []}

    pivot = heat.pivot_table(
        index="component", columns="hour", values="count", fill_value=0
    )
    # Fill all 24 hours
    for h in range(24):
        if h not in pivot.columns:
            pivot[h] = 0
    pivot = pivot[sorted(pivot.columns)]

    comps = pivot.index.tolist()
    values = pivot.values.tolist()

    return {
        "components": comps,
        "hours": list(range(24)),
        "values": [[int(v) for v in row] for row in values],
    }


@router.get("/raw")
def get_raw(
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    levels: str | None = Query(None),
    components: str | None = Query(None),
    text_filter: str | None = Query(None),
    limit: int = Query(500, ge=100, le=10000),
    offset: int = Query(0, ge=0),
):
    df = apply_log_filters(get_logs_df(), start_date, end_date, levels, components)

    if not df.empty and text_filter:
        mask = (
            df["block_id"].fillna("").str.contains(text_filter, case=False)
            | df["component"].fillna("").str.contains(text_filter, case=False)
        )
        df = df[mask]

    total = len(df)
    if not df.empty:
        df = df.sort_values("ts", ascending=False)

    page = df.iloc[offset : offset + limit] if not df.empty else df

    records = []
    for _, row in page.iterrows():
        records.append({
            "ts": row["ts"].isoformat(),
            "level": row.get("level", ""),
            "component": row.get("component", ""),
            "block_id": row.get("block_id") if row.get("block_id") else None,
        })

    return {"total": total, "items": records}
