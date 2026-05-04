"""
Load a raw HDFS .log file directly into MongoDB (same documents as Spark consumer).

Use when Docker/Kafka/Spark are unavailable or for a quick demo:

  python -m consumer.batch_ingest_to_mongo --input /path/to/HDFS_2k.log

Requires MongoDB at MONGO_URI (default mongodb://localhost:27017).
"""

from __future__ import annotations

import argparse
import os
from datetime import datetime, timezone

from pymongo import MongoClient

from consumer.log_parse import parse_hdfs_raw_line

MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB = os.environ.get("MONGO_DB", "anomalyze")
COLLECTION_LOGS = "parsed_logs"


def main() -> None:
    p = argparse.ArgumentParser(description="Ingest raw HDFS log lines into MongoDB.")
    p.add_argument("--input", required=True, help="Path to .log file")
    p.add_argument("--source-name", default=None, help="source_file field (default: basename of input)")
    args = p.parse_args()

    source = args.source_name or os.path.basename(args.input)
    ingested = datetime.now(timezone.utc).isoformat()

    docs: list[dict] = []
    with open(args.input, encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.rstrip("\n")
            if not line.strip():
                continue
            parsed = parse_hdfs_raw_line(line)
            if not parsed:
                continue
            docs.append({
                "ingested_at": ingested,
                "source_file": source,
                "raw": line,
                **parsed,
            })

    if not docs:
        print("No parseable log lines; nothing written.")
        return

    client = MongoClient(MONGO_URI)
    col = client[MONGO_DB][COLLECTION_LOGS]
    col.insert_many(docs)
    client.close()
    print(f"Inserted {len(docs)} docs into {MONGO_DB}.{COLLECTION_LOGS}")


if __name__ == "__main__":
    main()
