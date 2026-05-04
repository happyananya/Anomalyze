# Anomalyze

Distributed log analytics and anomaly detection system for HDFS logs.
Streams logs through Kafka, processes them with Spark, stores results in MongoDB,
and detects anomalies using Isolation Forest (ML) and statistical thresholds.
Results are visualized in an interactive Streamlit dashboard.

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
                                                               Streamlit Dashboard
```

## Services

| Service      | URL / Port                    | Description                        |
|--------------|-------------------------------|------------------------------------|
| Kafka UI     | http://localhost:8080         | Browse topics and messages         |
| Spark UI     | http://localhost:8081         | Monitor Spark jobs                 |
| MongoDB      | mongodb://localhost:27017     | Stores parsed logs and anomalies   |
| Dashboard    | http://localhost:8501         | Interactive anomaly dashboard      |
| Zookeeper    | localhost:2181                | Kafka coordination (internal)      |
| Kafka broker | localhost:29092               | Kafka bootstrap address for Python |

---

## Prerequisites

Before you begin, make sure the following are installed:

- **Docker Desktop** — runs Kafka, Spark, MongoDB, Zookeeper
- **Python 3.12** — PySpark 3.5 does not support Python 3.13+
- **Java 11+** — required by PySpark locally (`java -version` to check)

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

> If you are using Anaconda and don't have Python 3.12, you can still run the producer, detector, and dashboard with your existing Python. Just run `pip install -r requirements.txt` in your active Anaconda environment. The Spark consumer requires Python 3.12.

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

```bash
streamlit run dashboard/app.py
```

Opens at http://localhost:8501.

If you see `ModuleNotFoundError`, install dependencies first:

```bash
pip install -r requirements.txt
streamlit run dashboard/app.py
```

**Dashboard features:**

| Tab              | Contents                                                              |
|------------------|-----------------------------------------------------------------------|
| 📈 Log Activity  | Log level time-series, error rate % area chart                       |
| 🚨 Anomalies     | Donut chart by method, spike scatter timeline, anomaly table         |
| 🧩 Components    | Top-20 component bar chart, ERROR/WARN heatmap by hour               |
| 🗃️ Raw Data      | Searchable, paginated log record table                               |

**Sidebar controls:**
- Date range picker
- Log level filter (INFO / WARN / ERROR)
- Component filter
- Detection method filter
- Block ID search
- Time granularity: 1 min / 5 min / 15 min / 1 h
- Auto-refresh toggle (every 30 seconds)

---

## Running order summary

```
1. docker compose up -d                          # start infrastructure
2. pip install -r requirements.txt               # install Python deps
3. python -m producer.producer --input ...       # stream logs → Kafka
4. spark-submit --packages ... spark_consumer.py # Kafka → MongoDB
5. python -m detector.anomaly_detector           # detect anomalies
6. streamlit run dashboard/app.py                # view dashboard
```

Steps 3 and 4 can run in parallel (open two terminals).

---

## Model choice snapshot (K-Means vs Isolation Forest)

To justify the primary ML detector, we compared models on the HDFS_2k-derived event matrix:

```bash
python -m detector.compare_spark_anomaly_models \
  --csv data/HDFS_v1/preprocessed/Event_occurrence_matrix_2k.csv \
  --empirical-contamination \
  --no-spark
```

Observed comparison:

| Model | Precision | Recall | F1 | TP | FP | FN | TN |
|------|----------:|-------:|---:|---:|---:|---:|---:|
| K-Means distance | 0.0882 | 0.0882 | 0.0882 | 6 | 62 | 62 | 1864 |
| Isolation Forest | 0.0952 | 0.0294 | 0.0449 | 2 | 19 | 66 | 1907 |

Why K-Means is used as the primary ML method in this repo:
- It achieved significantly better **recall** and **F1** on our comparison run.
- For anomaly detection in this project, missing true anomalies (false negatives) was a bigger concern than a small precision gain.
- It remains simple and efficient for the E1-E29 event-count feature space.

Notes:
- Isolation Forest is still a valid baseline and can be kept for future re-evaluation.
- Results depend on dataset slice and contamination settings; rerun the comparison when data distribution changes.

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

---

## Project status

- [x] Kafka + Zookeeper (Docker)
- [x] Kafka UI
- [x] Kafka producer — streams HDFS_v1 logs
- [x] Spark master + worker (Docker)
- [x] MongoDB (Docker)
- [x] Spark consumer — parses logs → MongoDB
- [x] Anomaly detector — Isolation Forest + statistical threshold
- [x] Dashboard — interactive Streamlit UI
