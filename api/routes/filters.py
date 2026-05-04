from fastapi import APIRouter, Query

from api.database import (
    apply_anomaly_filters,
    apply_log_filters,
    get_anomalies_df,
    get_client,
    get_logs_df,
)

router = APIRouter()


@router.get("/filters")
def get_filters():
    try:
        get_client().admin.command("ping")
    except Exception as e:
        return {"error": f"MongoDB unreachable: {e}"}

    logs_df = get_logs_df()
    anom_df = get_anomalies_df()

    result: dict = {
        "date_range": {"min": None, "max": None},
        "levels": [],
        "components": [],
        "methods": [],
    }

    if not logs_df.empty:
        result["date_range"]["min"] = logs_df["ts"].min().isoformat()
        result["date_range"]["max"] = logs_df["ts"].max().isoformat()
        result["levels"] = sorted(logs_df["level"].dropna().unique().tolist())
        all_comps = sorted(logs_df["component"].dropna().unique().tolist())
        result["components"] = all_comps[:20]

    if not anom_df.empty and "method" in anom_df.columns:
        result["methods"] = anom_df["method"].unique().tolist()

    return result


@router.get("/overview")
def get_overview(
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    levels: str | None = Query(None),
    components: str | None = Query(None),
    methods: str | None = Query(None),
    block_search: str | None = Query(None),
):
    logs_df = apply_log_filters(get_logs_df(), start_date, end_date, levels, components)
    anom_df = apply_anomaly_filters(get_anomalies_df(), methods, block_search)

    return {
        "total_logs": len(logs_df),
        "error_logs": int((logs_df["level"] == "ERROR").sum()) if not logs_df.empty else 0,
        "total_anomalies": len(anom_df),
        "if_anomalies": int((anom_df["method"] == "isolation_forest").sum()) if not anom_df.empty else 0,
    }
