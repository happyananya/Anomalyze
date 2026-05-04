#!/usr/bin/env bash
# Run the full Anomalyze pipeline (README order). Requires Docker Desktop, Java 11+
# for spark-submit, and Python 3.12 venv with requirements.txt installed.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG_INPUT="${LOG_INPUT:-$HOME/Downloads/HDFS_2k.log}"
if [[ ! -f "$LOG_INPUT" ]]; then
  echo "Set LOG_INPUT to your HDFS .log path (default tried: $LOG_INPUT)" >&2
  exit 1
fi

echo "==> 1. Docker infrastructure"
docker compose up -d
echo "Waiting for Kafka healthy..."
for i in $(seq 1 60); do
  if docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' anomalyze-kafka 2>/dev/null | grep -q healthy; then
    break
  fi
  sleep 2
done

echo "==> 2. Event matrix (HDFS_2k → Event_occurrence_matrix.csv)"
mkdir -p data/HDFS_v1/preprocessed
.venv/bin/python -m detector.hdfs_2k_to_event_matrix \
  --log "$LOG_INPUT" \
  --out data/HDFS_v1/preprocessed/Event_occurrence_matrix.csv

echo "==> 3. Producer → Kafka"
.venv/bin/python -m producer.producer \
  --input "$LOG_INPUT" \
  --topic hdfs-logs \
  --bootstrap localhost:29092 \
  --max-messages 2000

echo "==> 4. Spark consumer → MongoDB (Ctrl+C after ~30s if it does not exit)"
rm -rf /tmp/anomalyze-checkpoint
.venv/bin/spark-submit \
  --packages org.apache.spark:spark-sql-kafka-0-10_2.12:3.5.0 \
  consumer/spark_consumer.py &
SPARK_PID=$!
sleep 45
kill "$SPARK_PID" 2>/dev/null || true
wait "$SPARK_PID" 2>/dev/null || true

echo "==> 5. Anomaly detector"
.venv/bin/python -m detector.anomaly_detector

echo "==> 6. Dashboard (http://localhost:8501) — stop with Ctrl+C"
exec .venv/bin/streamlit run dashboard/app.py
