"""
Spark Structured Streaming consumer for the hdfs-logs Kafka topic.

Parses the HDFS_v1 log format:
  DATE(YYMMDD) TIME(HHMMSS) PID LEVEL COMPONENT: message
  e.g. 081109 203518 143 INFO dfs.DataNode$DataXceiver: Receiving block blk_-160...

Run with (from repository root):
  spark-submit \
    --packages org.apache.spark:spark-sql-kafka-0-10_2.12:3.5.0 \
    consumer/spark_consumer.py
"""

import json
import os
import sys
from pathlib import Path

# spark-submit puts the script directory on sys.path, not the repo root — needed for consumer.* imports
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from pymongo import MongoClient
from pyspark.sql import SparkSession

from consumer.log_parse import parse_hdfs_raw_line

KAFKA_BOOTSTRAP = os.environ.get("KAFKA_BOOTSTRAP", "localhost:29092")
KAFKA_TOPIC = os.environ.get("KAFKA_TOPIC", "hdfs-logs")
MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB = "anomalyze"
COLLECTION_LOGS = "parsed_logs"
CHECKPOINT_DIR = "/tmp/anomalyze-checkpoint"


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
        parsed = parse_hdfs_raw_line(raw)
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
