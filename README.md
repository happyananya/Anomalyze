# Anomalyze

## Kafka + Python producer (Docker)

### Prereqs

- Docker Desktop
- Python 3.10+

### 1) Start Kafka

From the repo root:

```bash
docker compose up -d
```

Kafka will be reachable from your machine at **`localhost:29092`**.

### 2) Download the dataset (HDFS_v3_TraceBench)

Get the dataset from LogHub under the `HDFS/` section: [`https://github.com/logpai/loghub`](https://github.com/logpai/loghub).

Put the file you want to stream under:

```bash
data/HDFS_v3_TraceBench.csv
```

Notes:
- If you use a different filename, pass it via `--input`.
- The producer can stream **CSV rows** (recommended) or **raw log lines**.

### 3) Run the Python producer

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

python -m producer.producer \
  --bootstrap localhost:29092 \
  --topic hdfs-logs \
  --input data/HDFS_v3_TraceBench.csv \
  --rate 50
```

### 4) (Optional) Inspect messages in Kafka UI

Open Kafka UI at `http://localhost:8080` and browse topic `hdfs-logs`.