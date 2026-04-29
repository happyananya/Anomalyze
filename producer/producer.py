import argparse
import csv
import json
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, Optional, Tuple

from confluent_kafka import Producer


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _delivery_report(err, msg) -> None:
    if err is not None:
        raise RuntimeError(f"Delivery failed: {err}")


def iter_csv_records(path: str) -> Iterable[Tuple[Optional[str], Dict[str, Any]]]:
    with open(path, "r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Prefer block_id as the partitioning key when available (common for HDFS logs)
            key = None
            for k in ("block_id", "BlockId", "blk_id", "blkid"):
                v = row.get(k)
                if v:
                    key = str(v)
                    break
            yield key, row


def iter_log_lines(path: str) -> Iterable[Tuple[None, Dict[str, Any]]]:
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.rstrip("\n")
            if not line:
                continue
            yield None, {"raw": line}


def build_producer(bootstrap: str, client_id: str) -> Producer:
    return Producer(
        {
            "bootstrap.servers": bootstrap,
            "client.id": client_id,
            "enable.idempotence": True,
            "acks": "all",
            "linger.ms": 20,
            "batch.num.messages": 10000,
        }
    )


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Stream HDFS TraceBench logs into Kafka.")
    p.add_argument("--bootstrap", default="localhost:29092", help="Kafka bootstrap servers.")
    p.add_argument("--topic", default="hdfs-logs", help="Kafka topic.")
    p.add_argument("--input", required=True, help="Path to CSV (structured) or .log (raw).")
    p.add_argument("--format", choices=["auto", "csv", "raw"], default="auto")
    p.add_argument("--rate", type=float, default=0.0, help="Messages per second (0 = as fast as possible).")
    p.add_argument("--max-messages", type=int, default=0, help="Stop after N messages (0 = no limit).")
    p.add_argument("--client-id", default="anomalyze-producer")
    return p.parse_args()


def _choose_iterator(path: str, fmt: str):
    if fmt == "csv":
        return iter_csv_records
    if fmt == "raw":
        return iter_log_lines
    _, ext = os.path.splitext(path.lower())
    if ext in (".csv", ".tsv"):
        return iter_csv_records
    return iter_log_lines


def main() -> None:
    args = parse_args()
    if not os.path.exists(args.input):
        raise FileNotFoundError(f"Input file not found: {args.input}")

    prod = build_producer(args.bootstrap, args.client_id)
    iterator = _choose_iterator(args.input, args.format)(args.input)

    sleep_s = (1.0 / args.rate) if args.rate and args.rate > 0 else 0.0
    sent = 0

    for key, payload in iterator:
        envelope = {
            "ingested_at": _utc_now_iso(),
            "source_file": os.path.basename(args.input),
            "payload": payload,
        }
        prod.produce(
            args.topic,
            key=key.encode("utf-8") if key is not None else None,
            value=json.dumps(envelope, ensure_ascii=False).encode("utf-8"),
            on_delivery=_delivery_report,
        )
        prod.poll(0)

        sent += 1
        if sent % 5000 == 0:
            prod.flush(10)

        if args.max_messages and sent >= args.max_messages:
            break

        if sleep_s:
            time.sleep(sleep_s)

    prod.flush(30)
    print(f"Sent {sent} messages to topic '{args.topic}' on {args.bootstrap}")


if __name__ == "__main__":
    main()

