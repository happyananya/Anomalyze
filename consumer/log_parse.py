"""HDFS raw log line parsing (shared by Spark consumer and offline ingest)."""

from __future__ import annotations

import re

# 081109 203518 143 INFO dfs.DataNode$DataXceiver: Receiving block ...
_LOG_RE = re.compile(
    r"^(\d{6})\s+(\d{6})\s+(\d+)\s+(\w+)\s+([\w.$]+):\s+(.*)$"
)
_BLOCK_RE = re.compile(r"blk_[+-]?\d+")


def parse_hdfs_raw_line(raw: str) -> dict | None:
    m = _LOG_RE.match(raw.strip())
    if not m:
        return None
    date, time_, pid, level, component, message = m.groups()
    block_ids = _BLOCK_RE.findall(message)
    return {
        "date": date,
        "time": time_,
        "pid": pid,
        "level": level,
        "component": component,
        "message": message,
        "block_id": block_ids[0] if block_ids else None,
        "all_block_ids": block_ids,
    }
