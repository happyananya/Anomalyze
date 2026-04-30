# Anomalyze

Distributed log analytics and anomaly detection system for HDFS logs.
Streams logs through Kafka, processes them with Spark, stores results in MongoDB,
and detects anomalies using statistical and ML methods.

## Architecture

```
HDFS.log → Kafka Producer → [hdfs-logs topic] → Spark Consumer → MongoDB
                                                                      ↓
                                                           Anomaly Detector (Step 5)
                                                                      ↓
                                                              Dashboard (Step 6)
```

## Prerequisites

- Docker Desktop
- Python 3.12 (required — PySpark 3.5 does not support Python 3.14)
- Java 11+ (required by Spark)

## Setup

### 1. Start all services

```bash
docker compose up -d
```

This starts: Zookeeper, Kafka, Kafka UI, Spark master, Spark worker, MongoDB.

| Service     | URL                       |
|-------------|---------------------------|
| Kafka UI    | http://localhost:8080     |
| Spark UI    | http://localhost:8081     |
| MongoDB     | mongodb://localhost:27017 |

### 2. Create the Python environment

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3. Download the dataset

Get the **HDFS_v1** dataset from [LogHub](https://github.com/logpai/loghub) and place it at:

```
data/HDFS_v1/HDFS.log
data/HDFS_v1/preprocessed/anomaly_label.csv
```

### 4. Stream logs into Kafka

```bash
python -m producer.producer \
  --input data/HDFS_v1/HDFS.log \
  --topic hdfs-logs \
  --rate 100
```

`--rate 0` streams as fast as possible. `--max-messages N` stops after N messages.
Check messages landed at http://localhost:8080 → topic `hdfs-logs`.

### 5. Run the Spark consumer

Reads from `hdfs-logs`, parses each line, and writes structured records to MongoDB.

```bash
spark-submit \
  --packages org.apache.spark:spark-sql-kafka-0-10_2.12:3.5.0 \
  consumer/spark_consumer.py
```

Parsed docs land in MongoDB at `anomalyze.parsed_logs`. Each document contains:

| Field        | Example                        | Description                     |
|--------------|--------------------------------|---------------------------------|
| `date`       | `081109`                       | Log date (YYMMDD → 2008-11-09)  |
| `time`       | `203518`                       | Log time (HHMMSS → 20:35:18)    |
| `level`      | `INFO`                         | Log level                       |
| `component`  | `dfs.DataNode$DataXceiver`     | HDFS service component          |
| `block_id`   | `blk_-1608999687919862906`     | Links to `anomaly_label.csv`    |
| `message`    | `Receiving block blk_...`      | Full log message                |

## Project Status

- [x] Kafka + Zookeeper (Docker)
- [x] Kafka UI
- [x] Kafka producer — streams HDFS_v1 logs
- [x] Spark master + worker (Docker)
- [x] MongoDB (Docker)
- [x] Spark consumer — parses logs → MongoDB
- [ ] Anomaly detector — statistical thresholds + Isolation Forest
- [ ] Dashboard — error rates, anomaly visualization
