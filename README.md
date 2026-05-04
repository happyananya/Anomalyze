# Anomalyze

Distributed log analytics and anomaly detection system for HDFS logs.
Streams logs through Kafka, processes them with Spark, stores results in MongoDB,
and detects anomalies using Isolation Forest (ML) and statistical thresholds.
Results are visualized in an interactive React dashboard backed by a FastAPI REST API.

## Architecture

```
HDFS.log
   │
   ▼
Kafka Producer  ──►  [hdfs-logs topic]  ──►  Spark Consumer  ──►  MongoDB (parsed_logs)
                                                                         │
                                                                         ▼
                                                                  Anomaly Detector
                                                               (isolation_forest + stats)
                                                                         │
                                                                         ▼
                                                               MongoDB (anomalies)
                                                                         │
                                                                         ▼
                                                               FastAPI (port 8000)
                                                                         │
                                                                         ▼
                                                               React Dashboard (port 5173)
```

## Services

| Service          | URL / Port                    | Description                        |
|------------------|-------------------------------|------------------------------------|
| Kafka UI         | http://localhost:8080         | Browse topics and messages         |
| Spark UI         | http://localhost:8081         | Monitor Spark jobs                 |
| MongoDB          | mongodb://localhost:27017     | Stores parsed logs and anomalies   |
| FastAPI          | http://localhost:8000         | REST API for the dashboard         |
| React Dashboard  | http://localhost:5173         | Interactive anomaly dashboard      |
| Zookeeper        | localhost:2181                | Kafka coordination (internal)      |
| Kafka broker     | localhost:29092               | Kafka bootstrap address for Python |

---

## Prerequisites

Before you begin, make sure the following are installed:

- **Docker Desktop** — runs Kafka, Spark, MongoDB, Zookeeper
- **Python 3.12** — PySpark 3.5 does not support Python 3.13+
- **Java 11+** — required by PySpark locally (`java -version` to check)
- **Node.js 18+** — required to run the React frontend

> If you only need the dashboard and detector (no Spark consumer), Python 3.13 with Anaconda works fine.

---

## Step-by-step setup

### Step 1 — Clone the repo

```bash
git clone https://github.com/your-username/Anomalyze.git
cd Anomalyze
```

---

### Step 2 — Start all infrastructure services

```bash
docker compose up -d
```

This starts Zookeeper, Kafka, Kafka UI, Spark master, Spark worker, and MongoDB in the background.

Verify all containers are running:

```bash
docker compose ps
```

All services should show `running` or `healthy`. Kafka takes ~20 seconds to become healthy — wait until `anomalyze-kafka` shows `healthy` before proceeding.

To stop everything later:

```bash
docker compose down
```

To stop and also delete all stored MongoDB data:

```bash
docker compose down -v
```

---

### Step 3 — Set up the Python environment

```bash
# Create and activate a virtual environment
python3.12 -m venv .venv
source .venv/bin/activate        # macOS / Linux
# .venv\Scripts\activate         # Windows

# Install all dependencies
pip install -r requirements.txt
```

> If you are using Anaconda and don't have Python 3.12, you can still run the producer, detector, and API server with your existing Python. The Spark consumer requires Python 3.12.

---

### Step 4 — Download the HDFS_v1 dataset

Download the **HDFS_v1** dataset from [LogHub](https://github.com/logpai/loghub) and place the files at these exact paths:

```
data/
└── HDFS_v1/
    ├── HDFS.log                          ← raw log file (~1.5 GB)
    └── preprocessed/
        ├── anomaly_label.csv             ← ground-truth labels
        └── Event_occurrence_matrix.csv   ← feature matrix for Isolation Forest
```

Create the directories if they don't exist:

```bash
mkdir -p data/HDFS_v1/preprocessed
```

---

### Step 5 — Stream logs into Kafka

This reads `HDFS.log` line by line and publishes each line as a JSON message to the `hdfs-logs` Kafka topic.

```bash
python -m producer.producer \
  --input data/HDFS_v1/HDFS.log \
  --topic hdfs-logs \
  --rate 100
```

**Options:**

| Flag             | Default        | Description                              |
|------------------|----------------|------------------------------------------|
| `--input`        | *(required)*   | Path to the log file or CSV              |
| `--topic`        | `hdfs-logs`    | Kafka topic name                         |
| `--rate`         | `0`            | Messages per second (`0` = unlimited)    |
| `--max-messages` | `0`            | Stop after N messages (`0` = no limit)   |
| `--bootstrap`    | `localhost:29092` | Kafka bootstrap address               |

To test with a small batch first:

```bash
python -m producer.producer \
  --input data/HDFS_v1/HDFS.log \
  --topic hdfs-logs \
  --rate 500 \
  --max-messages 10000
```

Verify messages arrived: open http://localhost:8080 → select the `hdfs-logs` topic → check message count.

---

### Step 6 — Run the Spark consumer

This reads from the `hdfs-logs` Kafka topic, parses each raw log line, and writes structured documents to MongoDB.

```bash
spark-submit \
  --packages org.apache.spark:spark-sql-kafka-0-10_2.12:3.5.0 \
  consumer/spark_consumer.py
```

> The `--packages` flag downloads the Kafka connector on first run (~200 MB). Subsequent runs use the local cache.

The consumer runs continuously (streaming). Leave it running while the producer is active. Press `Ctrl+C` to stop.

Verify data landed in MongoDB:

```bash
docker exec -it anomalyze-mongo mongosh anomalyze --eval "db.parsed_logs.countDocuments()"
```

**Schema of each document in `anomalyze.parsed_logs`:**

| Field          | Example                           | Description                   |
|----------------|-----------------------------------|-------------------------------|
| `date`         | `081109`                          | Log date (YYMMDD = 2008-11-09)|
| `time`         | `203518`                          | Log time (HHMMSS = 20:35:18)  |
| `level`        | `INFO`                            | Log level (INFO/WARN/ERROR)   |
| `component`    | `dfs.DataNode$DataXceiver`        | HDFS service component        |
| `block_id`     | `blk_-1608999687919862906`        | Block identifier              |
| `message`      | `Receiving block blk_...`         | Full log message              |
| `ingested_at`  | `2024-01-01T00:00:00Z`            | When it was produced          |

---

### Step 7 — Run the anomaly detector

Trains an Isolation Forest on the event matrix and runs statistical threshold detection on parsed logs. Results are saved to `anomalyze.anomalies` in MongoDB.

```bash
python -m detector.anomaly_detector
```

This runs two detection methods:

**Method 1 — Isolation Forest (ML)**
- Trains on 575,061 blocks from `Event_occurrence_matrix.csv` using E1–E29 event counts
- Contamination rate set to the real anomaly rate (~2.9%)
- Prints precision, recall, F1, and confusion matrix

**Method 2 — Statistical threshold**
- Reads ERROR/WARN logs from MongoDB, groups by minute
- Flags any minute where `error_count > mean + 2 × std`

Verify results saved:

```bash
docker exec -it anomalyze-mongo mongosh anomalyze --eval "db.anomalies.countDocuments()"
```

---

### Step 8 — Run the dashboard

The dashboard is a React app served by a Vite dev server, backed by a FastAPI REST API. Start both in separate terminals.

**Terminal 1 — FastAPI backend:**

```bash
uvicorn api.main:app --reload --port 8000
```

**Terminal 2 — React frontend:**

```bash
cd frontend
npm install      # first run only
npm run dev
```

Opens at http://localhost:5173.

> The Vite dev server proxies all `/api` requests to `localhost:8000`, so no CORS configuration is needed.

**Dashboard features:**

| Tab              | Contents                                                              |
|------------------|-----------------------------------------------------------------------|
| 📈 Log Activity  | Log level time-series, error rate % area chart                       |
| 🚨 Anomalies     | IF metrics (precision/recall/F1), confusion matrix, TP/FP donut, spike scatter timeline, anomaly table |
| 🧩 Components    | Top-20 component bar chart, ERROR/WARN heatmap by hour               |
| 🗃️ Raw Data      | Searchable, paginated log record table                               |

**Sidebar controls:**
- Date range picker
- Log level filter (INFO / WARN / ERROR / DEBUG)
- Component filter (top 20)
- Detection method filter
- Block ID search
- Time granularity: 1 min / 5 min / 15 min / 1 h
- Auto-refresh toggle (every 30 seconds)

**For production (optional):**

```bash
cd frontend && npm run build
# Serve the dist/ folder with any static file server
```

---

## Running order summary

```
1. docker compose up -d                          # start infrastructure
2. pip install -r requirements.txt               # install Python deps
3. python -m producer.producer --input ...       # stream logs → Kafka
4. spark-submit --packages ... spark_consumer.py # Kafka → MongoDB
5. python -m detector.anomaly_detector           # detect anomalies
6. uvicorn api.main:app --reload --port 8000     # start REST API
7. cd frontend && npm run dev                    # start React dashboard
```

Steps 3 and 4 can run in parallel (open two terminals). Steps 6 and 7 can also run in parallel.

---

## Troubleshooting

**Kafka not ready yet**
```
NoBrokersAvailable
```
Wait for `anomalyze-kafka` to show `healthy` in `docker compose ps`, then retry.

**PySpark / Java error**
```
JAVA_HOME is not set
```
Install Java 11+ and ensure it's on your PATH: `java -version`.

**MongoDB connection refused**
```
ServerSelectionTimeoutError
```
Make sure Docker is running: `docker compose up -d`. Check with `docker compose ps`.

**Wrong Python version for Spark**
```
Python 3.13 is not supported by PySpark 3.5
```
Use `python3.12` to create the venv: `python3.12 -m venv .venv`.

**Dashboard shows "No data"**
Steps must be run in order — run the producer, consumer, and detector before opening the dashboard.

**FastAPI import error**
```
ModuleNotFoundError: No module named 'fastapi'
```
```bash
pip install fastapi
```

---

## Project status

- [x] Kafka + Zookeeper (Docker)
- [x] Kafka UI
- [x] Kafka producer — streams HDFS_v1 logs
- [x] Spark master + worker (Docker)
- [x] MongoDB (Docker)
- [x] Spark consumer — parses logs → MongoDB
- [x] Anomaly detector — Isolation Forest + statistical threshold
- [x] FastAPI REST API — serves dashboard data from MongoDB
- [x] React dashboard — Vite + TypeScript + Tailwind + Recharts
