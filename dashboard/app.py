"""
Anomalyze Dashboard — interactive Streamlit UI.

Run:
  streamlit run dashboard/app.py
"""

import time
from datetime import datetime, timedelta

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st
from pymongo import MongoClient

MONGO_URI = "mongodb://localhost:27017"
MONGO_DB = "anomalyze"

st.set_page_config(
    page_title="Anomalyze",
    page_icon="🔍",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── styles ────────────────────────────────────────────────────────────────────
st.markdown(
    """
    <style>
    .metric-card {
        background: #1e1e2e;
        border-radius: 12px;
        padding: 20px 24px;
        border-left: 4px solid;
    }
    .metric-card.blue  { border-color: #60a5fa; }
    .metric-card.red   { border-color: #f87171; }
    .metric-card.amber { border-color: #fbbf24; }
    .metric-card.green { border-color: #34d399; }
    .metric-val { font-size: 2rem; font-weight: 700; }
    .metric-lbl { font-size: 0.85rem; color: #9ca3af; margin-top: 4px; }
    </style>
    """,
    unsafe_allow_html=True,
)


# ── data loading ──────────────────────────────────────────────────────────────
@st.cache_resource
def get_client():
    return MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)


def load_parsed_logs(client) -> pd.DataFrame:
    docs = list(
        client[MONGO_DB]["parsed_logs"].find(
            {},
            {"date": 1, "time": 1, "level": 1, "component": 1, "block_id": 1, "_id": 0},
        )
    )
    if not docs:
        return pd.DataFrame()
    df = pd.DataFrame(docs)
    df["ts"] = pd.to_datetime(
        df["date"] + df["time"], format="%y%m%d%H%M%S", errors="coerce"
    )
    return df.dropna(subset=["ts"])


def load_anomalies(client) -> pd.DataFrame:
    docs = list(client[MONGO_DB]["anomalies"].find({}, {"_id": 0}))
    return pd.DataFrame(docs) if docs else pd.DataFrame()


def load_log_templates() -> pd.DataFrame:
    try:
        return pd.read_csv("data/HDFS_v1/preprocessed/HDFS.log_templates.csv")
    except FileNotFoundError:
        return pd.DataFrame()


# ── sidebar ───────────────────────────────────────────────────────────────────
with st.sidebar:
    st.title("🔍 Anomalyze")
    st.caption("HDFS Log Anomaly Detection")
    st.divider()

    st.subheader("Filters")

    auto_refresh = st.toggle("Auto-refresh (30 s)", value=False)

    try:
        client = get_client()
        client.admin.command("ping")
        mongo_ok = True
    except Exception:
        mongo_ok = False

    if not mongo_ok:
        st.error("MongoDB unreachable")
        st.stop()

    logs_df_raw = load_parsed_logs(client)
    anom_df_raw = load_anomalies(client)

    if logs_df_raw.empty:
        st.warning("No parsed_logs in MongoDB yet.")
    else:
        ts_min = logs_df_raw["ts"].min().to_pydatetime()
        ts_max = logs_df_raw["ts"].max().to_pydatetime()

        date_range = st.date_input(
            "Date range",
            value=(ts_min.date(), ts_max.date()),
            min_value=ts_min.date(),
            max_value=ts_max.date(),
        )
        if len(date_range) == 2:
            start_dt = datetime.combine(date_range[0], datetime.min.time())
            end_dt = datetime.combine(date_range[1], datetime.max.time())
        else:
            start_dt, end_dt = ts_min, ts_max

        all_levels = sorted(logs_df_raw["level"].dropna().unique().tolist())
        selected_levels = st.multiselect("Log levels", all_levels, default=all_levels)

        all_components = sorted(logs_df_raw["component"].dropna().unique().tolist())
        selected_components = st.multiselect(
            "Components (top 20)",
            all_components[:20],
            default=[],
            placeholder="All components",
        )

    st.divider()
    st.subheader("Anomaly filters")

    anom_methods = []
    if not anom_df_raw.empty and "method" in anom_df_raw.columns:
        anom_methods = anom_df_raw["method"].unique().tolist()
    selected_methods = st.multiselect(
        "Detection method", anom_methods, default=anom_methods
    )

    block_search = st.text_input("Search block ID", placeholder="blk_-123456…")

    st.divider()
    granularity = st.selectbox(
        "Time granularity", ["1min", "5min", "15min", "1h"], index=1
    )


# ── apply filters ─────────────────────────────────────────────────────────────
if logs_df_raw.empty:
    logs_df = logs_df_raw.copy()
else:
    mask = (logs_df_raw["ts"] >= start_dt) & (logs_df_raw["ts"] <= end_dt)
    if selected_levels:
        mask &= logs_df_raw["level"].isin(selected_levels)
    if selected_components:
        mask &= logs_df_raw["component"].isin(selected_components)
    logs_df = logs_df_raw[mask].copy()

anom_df = anom_df_raw.copy()
if not anom_df.empty:
    if selected_methods:
        anom_df = anom_df[anom_df["method"].isin(selected_methods)]
    if block_search:
        anom_df = anom_df[
            anom_df.get("block_id", pd.Series(dtype=str))
            .fillna("")
            .str.contains(block_search, case=False)
        ]


# ── KPI cards ─────────────────────────────────────────────────────────────────
st.header("Overview")

total_logs = len(logs_df)
error_logs = int((logs_df["level"] == "ERROR").sum()) if not logs_df.empty else 0
total_anom = len(anom_df)
if_anom = int((anom_df["method"] == "isolation_forest").sum()) if not anom_df.empty else 0

col1, col2, col3, col4 = st.columns(4)

with col1:
    st.markdown(
        f'<div class="metric-card blue"><div class="metric-val">{total_logs:,}</div>'
        '<div class="metric-lbl">Total log lines</div></div>',
        unsafe_allow_html=True,
    )
with col2:
    st.markdown(
        f'<div class="metric-card red"><div class="metric-val">{error_logs:,}</div>'
        '<div class="metric-lbl">ERROR lines</div></div>',
        unsafe_allow_html=True,
    )
with col3:
    st.markdown(
        f'<div class="metric-card amber"><div class="metric-val">{total_anom:,}</div>'
        '<div class="metric-lbl">Anomalies detected</div></div>',
        unsafe_allow_html=True,
    )
with col4:
    st.markdown(
        f'<div class="metric-card green"><div class="metric-val">{if_anom:,}</div>'
        '<div class="metric-lbl">Isolation Forest flags</div></div>',
        unsafe_allow_html=True,
    )

st.divider()


# ── tab layout ────────────────────────────────────────────────────────────────
tab_logs, tab_anom, tab_components, tab_raw = st.tabs(
    ["📈 Log Activity", "🚨 Anomalies", "🧩 Components", "🗃️ Raw Data"]
)


# ── Tab 1: Log Activity ───────────────────────────────────────────────────────
with tab_logs:
    if logs_df.empty:
        st.info("No log data for the selected filters.")
    else:
        logs_df["bucket"] = logs_df["ts"].dt.floor(granularity)
        counts = (
            logs_df.groupby(["bucket", "level"])
            .size()
            .reset_index(name="count")
        )

        fig_ts = px.line(
            counts,
            x="bucket",
            y="count",
            color="level",
            title=f"Log lines per {granularity} by level",
            labels={"bucket": "Time", "count": "Count", "level": "Level"},
            color_discrete_map={
                "ERROR": "#f87171",
                "WARN": "#fbbf24",
                "INFO": "#60a5fa",
                "DEBUG": "#a78bfa",
            },
            template="plotly_dark",
        )
        fig_ts.update_layout(hovermode="x unified", legend_title_text="Level")
        st.plotly_chart(fig_ts, use_container_width=True)

        # Error rate percentage over time
        pivot = counts.pivot_table(
            index="bucket", columns="level", values="count", fill_value=0
        ).reset_index()
        if "ERROR" in pivot.columns:
            total_col = pivot.drop(columns="bucket").sum(axis=1)
            pivot["error_rate_pct"] = pivot["ERROR"] / total_col.replace(0, 1) * 100

            fig_rate = px.area(
                pivot,
                x="bucket",
                y="error_rate_pct",
                title=f"Error rate % over time ({granularity} buckets)",
                labels={"bucket": "Time", "error_rate_pct": "Error rate (%)"},
                template="plotly_dark",
                color_discrete_sequence=["#f87171"],
            )
            fig_rate.update_layout(showlegend=False)
            st.plotly_chart(fig_rate, use_container_width=True)


# ── Tab 2: Anomalies ──────────────────────────────────────────────────────────
with tab_anom:
    if anom_df.empty:
        st.info("No anomalies for the selected filters. Run `python -m detector.anomaly_detector` first.")
    else:
        col_a, col_b = st.columns(2)

        with col_a:
            method_counts = anom_df["method"].value_counts().reset_index()
            method_counts.columns = ["method", "count"]
            fig_pie = px.pie(
                method_counts,
                names="method",
                values="count",
                title="Anomalies by detection method",
                template="plotly_dark",
                color_discrete_sequence=["#60a5fa", "#f87171"],
                hole=0.45,
            )
            fig_pie.update_traces(textposition="outside", textinfo="percent+label")
            st.plotly_chart(fig_pie, use_container_width=True)

        with col_b:
            # Timeline of anomaly detections
            if "detected_at" in anom_df.columns:
                anom_df["detected_at_ts"] = pd.to_datetime(
                    anom_df["detected_at"], errors="coerce", utc=True
                )
                anom_time = (
                    anom_df.groupby(["method"])
                    .size()
                    .reset_index(name="count")
                )
                fig_bar = px.bar(
                    anom_time,
                    x="method",
                    y="count",
                    title="Anomaly count by method",
                    template="plotly_dark",
                    color="method",
                    color_discrete_sequence=["#60a5fa", "#f87171"],
                    text="count",
                )
                fig_bar.update_traces(textposition="outside")
                fig_bar.update_layout(showlegend=False)
                st.plotly_chart(fig_bar, use_container_width=True)

        # Statistical spikes timeline
        stat_df = anom_df[anom_df["method"] == "statistical_threshold"].copy()
        if not stat_df.empty and "minute" in stat_df.columns:
            stat_df["minute_ts"] = pd.to_datetime(stat_df["minute"], errors="coerce", utc=True)
            stat_df = stat_df.dropna(subset=["minute_ts"])
            if not stat_df.empty:
                fig_spikes = px.scatter(
                    stat_df,
                    x="minute_ts",
                    y="error_count",
                    title="Statistical threshold — error spike timeline",
                    labels={"minute_ts": "Time", "error_count": "Error count"},
                    template="plotly_dark",
                    color_discrete_sequence=["#fbbf24"],
                    size="error_count",
                    size_max=20,
                )
                fig_spikes.update_layout(showlegend=False)
                st.plotly_chart(fig_spikes, use_container_width=True)

        # Anomaly table
        st.subheader("Anomaly records")
        display_cols = [c for c in ["method", "block_id", "true_label", "minute", "error_count", "detected_at"] if c in anom_df.columns]
        st.dataframe(
            anom_df[display_cols].reset_index(drop=True),
            use_container_width=True,
            height=400,
        )


# ── Tab 3: Components ─────────────────────────────────────────────────────────
with tab_components:
    if logs_df.empty:
        st.info("No log data for the selected filters.")
    else:
        comp_counts = (
            logs_df.groupby(["component", "level"])
            .size()
            .reset_index(name="count")
        )
        top_components = (
            comp_counts.groupby("component")["count"]
            .sum()
            .nlargest(20)
            .index.tolist()
        )
        comp_counts = comp_counts[comp_counts["component"].isin(top_components)]

        fig_comp = px.bar(
            comp_counts,
            x="count",
            y="component",
            color="level",
            orientation="h",
            title="Top 20 components by log volume",
            labels={"count": "Log lines", "component": "Component"},
            template="plotly_dark",
            color_discrete_map={
                "ERROR": "#f87171",
                "WARN": "#fbbf24",
                "INFO": "#60a5fa",
                "DEBUG": "#a78bfa",
            },
            barmode="stack",
        )
        fig_comp.update_layout(yaxis={"categoryorder": "total ascending"}, height=600)
        st.plotly_chart(fig_comp, use_container_width=True)

        # Heatmap: component × hour
        logs_df["hour"] = logs_df["ts"].dt.hour
        heat_data = (
            logs_df[logs_df["level"].isin(["ERROR", "WARN"])]
            .groupby(["component", "hour"])
            .size()
            .reset_index(name="count")
        )
        heat_top = heat_data[heat_data["component"].isin(top_components[:10])]
        if not heat_top.empty:
            heat_pivot = heat_top.pivot_table(
                index="component", columns="hour", values="count", fill_value=0
            )
            fig_heat = px.imshow(
                heat_pivot,
                title="ERROR/WARN heatmap — component × hour of day",
                labels={"x": "Hour", "y": "Component", "color": "Count"},
                template="plotly_dark",
                color_continuous_scale="Reds",
                aspect="auto",
            )
            st.plotly_chart(fig_heat, use_container_width=True)


# ── Tab 4: Raw data ───────────────────────────────────────────────────────────
with tab_raw:
    st.subheader("Parsed log records")

    col_f1, col_f2 = st.columns([2, 1])
    with col_f1:
        text_filter = st.text_input("Filter by block ID or component", key="raw_search")
    with col_f2:
        n_rows = st.number_input("Max rows to show", min_value=100, max_value=10000, value=500, step=100)

    display_df = logs_df.copy()
    if text_filter:
        mask = (
            display_df["block_id"].fillna("").str.contains(text_filter, case=False)
            | display_df["component"].fillna("").str.contains(text_filter, case=False)
        )
        display_df = display_df[mask]

    show_cols = [c for c in ["ts", "level", "component", "block_id"] if c in display_df.columns]
    st.dataframe(
        display_df[show_cols].sort_values("ts", ascending=False).head(n_rows).reset_index(drop=True),
        use_container_width=True,
        height=500,
    )
    st.caption(f"Showing {min(n_rows, len(display_df)):,} of {len(display_df):,} filtered records")


# ── auto-refresh ──────────────────────────────────────────────────────────────
if auto_refresh:
    time.sleep(30)
    st.cache_data.clear()
    st.rerun()
