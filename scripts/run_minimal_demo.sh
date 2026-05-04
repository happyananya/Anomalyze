#!/usr/bin/env bash
# MongoDB + offline log ingest + detector + dashboard (no Kafka / Spark).
# Starts only the mongo service from docker-compose.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG_INPUT="${LOG_INPUT:-$HOME/Downloads/HDFS_2k.log}"
if [[ ! -f "$LOG_INPUT" ]]; then
  echo "Set LOG_INPUT to your HDFS .log path (default: $LOG_INPUT)" >&2
  exit 1
fi

docker compose up -d mongo
sleep 3

mkdir -p data/HDFS_v1/preprocessed
.venv/bin/python -m detector.hdfs_2k_to_event_matrix \
  --log "$LOG_INPUT" \
  --out data/HDFS_v1/preprocessed/Event_occurrence_matrix.csv

.venv/bin/python -m consumer.batch_ingest_to_mongo --input "$LOG_INPUT"
.venv/bin/python -m detector.anomaly_detector
exec .venv/bin/streamlit run dashboard/app.py
