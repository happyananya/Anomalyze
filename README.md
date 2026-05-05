# Anomalyze

A distributed log analytics and anomaly detection system for HDFS logs. It streams logs through Kafka, processes them with Spark, detects anomalies using Isolation Forest and statistical thresholds, and presents results in an interactive React dashboard.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [Setup Guide](#setup-guide)
5. [Dashboard](#dashboard)
6. [Troubleshooting](#troubleshooting)
7. [Project Status](#project-status)

---

## Architecture

```
HDFS.log  →  Kafka Producer  →  [hdfs-logs topic]  →  Spark Consumer  →  MongoDB (parsed_logs)
                                                                                  ↓
                                                                        Anomaly Detector
                                                                    (Isolation Forest + stats)
                                                                                  ↓
                                                                        MongoDB (anomalies)
                                                                                  ↓
                                                                        FastAPI  :8000
                                                                                  ↓
                                                                     React Dashboard  :5173
```

### Services

| Service         | Address                       | Purpose                              |
|-----------------|-------------------------------|--------------------------------------|
| React Dashboard | http://localhost:5173         | Interactive anomaly visualization    |
| FastAPI         | http://localhost:8000         | REST API serving the dashboard       |
| Kafka UI        | http://localhost:8080         | Browse Kafka topics and messages     |
| Spark UI        | http://localhost:8081         | Monitor Spark streaming jobs         |
| MongoDB         | mongodb://localhost:27017     | Stores parsed logs and anomalies     |
| Kafka broker    | localhost:29092               | Bootstrap address (used by Python)   |
| Zookeeper       | localhost:2181                | Kafka coordination (internal only)   |

---

## Prerequisites

| Tool            | Version  | Notes                                              |
|-----------------|----------|----------------------------------------------------|
| Docker Desktop  | any      | Runs Kafka, Spark, MongoDB, Zookeeper              |
| Python          | 3.12     | PySpark 3.5 does not support Python 3.13+          |
| Java            | 11+      | Required by PySpark — check with `java -version`   |
| Node.js         | 18+      | Required to run the React frontend                 |

> **Anaconda users:** If you don't have Python 3.12, you can still run the producer, detector, and API with your existing Python. Only the Spark consumer requires Python 3.12.

---

## Quick Start

Here's the full startup sequence at a glance. See [Setup Guide](#setup-guide) for details on each step.

```bash
# 1. Start infrastructure (Kafka, Spark, MongoDB)
docker compose up -d

# 2. Set up Python environment
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 3. Stream logs into Kafka  [Terminal A]
python -m producer.producer --input data/HDFS_v1/HDFS.log --topic hdfs-logs --rate 100

# 4. Parse logs into MongoDB  [Terminal B — runs alongside step 3]
spark-submit --packages org.apache.spark:spark-sql-kafka-0-10_2.12:3.5.0 consumer/spark_consumer.py

# 5. Detect anomalies
python -m detector.anomaly_detector

# 6. Start the API  [Terminal C]
uvicorn api.main:app --reload --port 8000

# 7. Start the dashboard  [Terminal D]
cd frontend && npm install && npm run dev
```

Open http://localhost:5173 to view the dashboard.

---

## Setup Guide

### 1. Clone the repository

```bash
git clone https://github.com/your-username/Anomalyze.git
cd Anomalyze
```

---

### 2. Start infrastructure

```bash
docker compose up -d
```

This starts Zookeeper, Kafka, Kafka UI, Spark master, Spark worker, and MongoDB in the background. Kafka takes ~20 seconds to become healthy.

```bash
docker compose ps   # all services should show "running" or "healthy"
```

**Useful Docker commands:**
```bash
docker compose down       # stop all services
docker compose down -v    # stop and delete all stored data (MongoDB included)
```

---

### 3. Set up Python environment

```bash
python3.12 -m venv .venv
source .venv/bin/activate   # macOS / Linux
# .venv\Scripts\activate    # Windows

pip install -r requirements.txt
```

---

### 4. Download the dataset

Download the **HDFS_v1** dataset from [LogHub](https://github.com/logpai/loghub) and place files at these paths:

```
data/HDFS_v1/
├── HDFS.log                          ← raw log file (~1.5 GB)
└── preprocessed/
    ├── anomaly_label.csv             ← ground-truth labels
    └── Event_occurrence_matrix.csv   ← feature matrix for Isolation Forest
```

```bash
mkdir -p data/HDFS_v1/preprocessed
```

---

### 5. Stream logs into Kafka

Reads `HDFS.log` line by line and publishes each line as a JSON message to the `hdfs-logs` topic.

```bash
python -m producer.producer \
  --input data/HDFS_v1/HDFS.log \
  --topic hdfs-logs \
  --rate 100
```

| Flag             | Default           | Description                            |
|------------------|-------------------|----------------------------------------|
| `--input`        | *(required)*      | Path to the log file                   |
| `--topic`        | `hdfs-logs`       | Kafka topic name                       |
| `--rate`         | `0` (unlimited)   | Messages per second                    |
| `--max-messages` | `0` (no limit)    | Stop after N messages                  |
| `--bootstrap`    | `localhost:29092` | Kafka bootstrap address                |

To do a quick test run first:
```bash
python -m producer.producer --input data/HDFS_v1/HDFS.log --topic hdfs-logs --rate 500 --max-messages 10000
```

Verify: open http://localhost:8080, select the `hdfs-logs` topic, and check the message count.

---

### 6. Run the Spark consumer

Reads from Kafka, parses each raw log line, and writes structured documents to MongoDB.

```bash
spark-submit \
  --packages org.apache.spark:spark-sql-kafka-0-10_2.12:3.5.0 \
  consumer/spark_consumer.py
```

> The Kafka connector (~200 MB) is downloaded on first run and cached locally after that.

This runs as a continuous stream — keep it running while the producer is active. Press `Ctrl+C` to stop.

**Verify data in MongoDB:**
```bash
docker exec -it anomalyze-mongo mongosh anomalyze --eval "db.parsed_logs.countDocuments()"
```

**Document schema (`anomalyze.parsed_logs`):**

| Field         | Example                        | Description                    |
|---------------|--------------------------------|--------------------------------|
| `date`        | `081109`                       | Date — YYMMDD (2008-11-09)     |
| `time`        | `203518`                       | Time — HHMMSS (20:35:18)       |
| `level`       | `INFO`                         | Log level (INFO / WARN / ERROR)|
| `component`   | `dfs.DataNode$DataXceiver`     | HDFS service component         |
| `block_id`    | `blk_-1608999687919862906`     | Block identifier               |
| `message`     | `Receiving block blk_...`      | Full log message               |
| `ingested_at` | `2024-01-01T00:00:00Z`         | Timestamp when produced        |

---

### 7. Run the anomaly detector

Trains Isolation Forest on the event matrix and applies statistical threshold detection. Results are saved to `anomalyze.anomalies`.

```bash
python -m detector.anomaly_detector
```

**Detection methods:**

- **Isolation Forest (ML)** — trains on 575,061 blocks from `Event_occurrence_matrix.csv` using E1–E29 event counts. Contamination rate matches the real anomaly rate (~2.9%). Outputs precision, recall, F1, and a confusion matrix.
- **Statistical threshold** — reads ERROR/WARN logs from MongoDB grouped by minute, and flags minutes where `error_count > mean + 2 × std`.

**Verify results:**
```bash
docker exec -it anomalyze-mongo mongosh anomalyze --eval "db.anomalies.countDocuments()"
```

---

### 8. Start the dashboard

Start the API and frontend in two separate terminals.

**Terminal 1 — FastAPI backend:**
```bash
uvicorn api.main:app --reload --port 8000
```

**Terminal 2 — React frontend:**
```bash
cd frontend
npm install   # first time only
npm run dev
```

Open http://localhost:5173.

> Vite proxies all `/api` requests to `localhost:8000` — no CORS setup needed.

---

## Dashboard

| Tab             | What you'll see                                                              |
|-----------------|------------------------------------------------------------------------------|
| 📈 Log Activity | Log level time-series, error rate area chart                                 |
| 🚨 Anomalies    | Precision / recall / F1, confusion matrix, TP/FP donut, anomaly table        |
| 🧩 Components   | Top-20 component bar chart, ERROR/WARN heatmap by hour                       |
| 🗃️ Raw Data     | Searchable, paginated log table                                              |

**Sidebar filters:** date range · log level · component · detection method · block ID · time granularity (1 min → 1 h) · auto-refresh (30 s)

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `NoBrokersAvailable` | Kafka not ready | Wait for `anomalyze-kafka` to show `healthy` in `docker compose ps` |
| `JAVA_HOME is not set` | Java missing | Install Java 11+ and ensure it's on your PATH |
| `ServerSelectionTimeoutError` | MongoDB not running | Run `docker compose up -d` and check `docker compose ps` |
| `Python 3.13 is not supported by PySpark 3.5` | Wrong Python version | Create venv with `python3.12 -m venv .venv` |
| Dashboard shows "No data" | Steps run out of order | Run producer → consumer → detector before opening the dashboard |
| `ModuleNotFoundError: No module named 'fastapi'` | Missing dependency | Run `pip install -r requirements.txt` inside the venv |

---

## Project Status

- [x] Kafka + Zookeeper (Docker)
- [x] Kafka UI
- [x] Kafka producer — streams HDFS_v1 logs
- [x] Spark master + worker (Docker)
- [x] MongoDB (Docker)
- [x] Spark consumer — parses logs → MongoDB
- [x] Anomaly detector — Isolation Forest + statistical threshold
- [x] FastAPI REST API — serves dashboard data from MongoDB
- [x] React dashboard — Vite + TypeScript + Tailwind + Recharts
