import time
from functools import lru_cache

import pandas as pd
from pymongo import MongoClient

MONGO_URI = "mongodb://localhost:27017"
MONGO_DB = "anomalyze"
CACHE_TTL = 30  # seconds

_cache: dict = {}


@lru_cache(maxsize=1)
def get_client() -> MongoClient:
    return MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)


def get_db():
    return get_client()[MONGO_DB]


def _load_logs() -> pd.DataFrame:
    docs = list(
        get_db()["parsed_logs"].find(
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


def _load_anomalies() -> pd.DataFrame:
    docs = list(get_db()["anomalies"].find({}, {"_id": 0}))
    return pd.DataFrame(docs) if docs else pd.DataFrame()


def get_logs_df() -> pd.DataFrame:
    now = time.time()
    if "logs" not in _cache or now - _cache.get("logs_ts", 0) > CACHE_TTL:
        _cache["logs"] = _load_logs()
        _cache["logs_ts"] = now
    return _cache["logs"]


def get_anomalies_df() -> pd.DataFrame:
    now = time.time()
    if "anom" not in _cache or now - _cache.get("anom_ts", 0) > CACHE_TTL:
        _cache["anom"] = _load_anomalies()
        _cache["anom_ts"] = now
    return _cache["anom"]


def apply_log_filters(
    df: pd.DataFrame,
    start_date: str | None,
    end_date: str | None,
    levels: str | None,
    components: str | None,
) -> pd.DataFrame:
    if df.empty:
        return df
    if start_date:
        df = df[df["ts"] >= pd.Timestamp(start_date)]
    if end_date:
        df = df[df["ts"] <= pd.Timestamp(end_date)]
    if levels:
        df = df[df["level"].isin(levels.split(","))]
    if components:
        df = df[df["component"].isin(components.split(","))]
    return df


def apply_anomaly_filters(
    df: pd.DataFrame,
    methods: str | None,
    block_search: str | None,
) -> pd.DataFrame:
    if df.empty:
        return df
    if methods:
        df = df[df["method"].isin(methods.split(","))]
    if block_search and "block_id" in df.columns:
        df = df[df["block_id"].fillna("").str.contains(block_search, case=False)]
    return df
