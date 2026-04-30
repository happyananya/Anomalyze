"""
Spark Structured Streaming consumer for the hdfs-logs Kafka topic.

Parses the HDFS_v1 log format:
  DATE(YYMMDD) TIME(HHMMSS) PID LEVEL COMPONENT: message
  e.g. 081109 203518 143 INFO dfs.DataNode$DataXceiver: Receiving block blk_-160...

Run with:
  spark-submit \
    --packages org.apache.spark:spark-sql-kafka-0-10_2.12:3.5.0 \
    consumer/spark_consumer.py
"""

import json
import re

from pymongo import MongoClient
from pyspark.sql import SparkSession

KAFKA_BOOTSTRAP = "localhost:29092"
KAFKA_TOPIC = "hdfs-logs"
MONGO_URI = "mongodb://localhost:27017"
MONGO_DB = "anomalyze"
COLLECTION_LOGS = "parsed_logs"
CHECKPOINT_DIR = "/tmp/anomalyze-checkpoint"

# 081109 203518 143 INFO dfs.DataNode$DataXceiver: Receiving block ...
_LOG_RE = re.compile(
    r"^(\d{6})\s+(\d{6})\s+(\d+)\s+(\w+)\s+([\w.$]+):\s+(.*)$"
)
_BLOCK_RE = re.compile(r"blk_[+-]?\d+")


def _parse_raw(raw: str) -> dict | None:
    m = _LOG_RE.match(raw.strip())
    if not m:
        return None
    date, time_, pid, level, component, message = m.groups()
    block_ids = _BLOCK_RE.findall(message)
    return {
        "date": date,        # e.g. "081109"  (2008-11-09)
        "time": time_,       # e.g. "203518"  (20:35:18)
        "pid": pid,
        "level": level,      # INFO / WARN / ERROR etc.
        "component": component,
        "message": message,
        "block_id": block_ids[0] if block_ids else None,
        "all_block_ids": block_ids,
    }


def write_batch(batch_df, batch_id: int) -> None:
    rows = batch_df.collect()
    if not rows:
        return

    docs = []
    for row in rows:
        try:
            envelope = json.loads(row.value)
        except (json.JSONDecodeError, TypeError):
            continue

        raw = envelope.get("payload", {}).get("raw", "")
        parsed = _parse_raw(raw)
        if parsed is None:
            continue

        docs.append({
            "ingested_at": envelope.get("ingested_at"),
            "source_file": envelope.get("source_file"),
            "raw": raw,
            **parsed,
        })

    if not docs:
        return

    client = MongoClient(MONGO_URI)
    client[MONGO_DB][COLLECTION_LOGS].insert_many(docs)
    client.close()
    print(f"[batch {batch_id}] inserted {len(docs)} docs into MongoDB:{MONGO_DB}/{COLLECTION_LOGS}")


def main() -> None:
    spark = (
        SparkSession.builder
        .appName("anomalyze-consumer")
        .config("spark.sql.shuffle.partitions", "4")
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("WARN")

    raw_stream = (
        spark.readStream
        .format("kafka")
        .option("kafka.bootstrap.servers", KAFKA_BOOTSTRAP)
        .option("subscribe", KAFKA_TOPIC)
        .option("startingOffsets", "earliest")
        .option("maxOffsetsPerTrigger", 5000)
        .load()
        .selectExpr("CAST(value AS STRING) as value")
    )

    query = (
        raw_stream.writeStream
        .foreachBatch(write_batch)
        .option("checkpointLocation", CHECKPOINT_DIR)
        .trigger(processingTime="10 seconds")
        .start()
    )

    query.awaitTermination()


if __name__ == "__main__":
    main()
