from __future__ import annotations

import argparse
import asyncio
import json
import os

import httpx


async def run() -> None:
    parser = argparse.ArgumentParser(description="Forward telecom telemetry from Kafka to NeuralNet5G ingestion API")
    parser.add_argument("--topic", required=True)
    parser.add_argument("--brokers", default=os.getenv("KAFKA_BROKERS", ""))
    parser.add_argument("--api-base", default=os.getenv("API_BASE_URL", ""))
    parser.add_argument("--ingestion-key", default=os.getenv("INGESTION_API_KEY", ""))
    args = parser.parse_args()
    if not args.brokers:
        raise SystemExit("Set KAFKA_BROKERS or pass --brokers.")
    if not args.api_base:
        raise SystemExit("Set API_BASE_URL or pass --api-base.")

    try:
        from aiokafka import AIOKafkaConsumer
    except Exception as exc:  # pragma: no cover
        raise SystemExit("Install aiokafka to use this adapter: pip install aiokafka") from exc

    consumer = AIOKafkaConsumer(
        args.topic,
        bootstrap_servers=args.brokers,
        enable_auto_commit=True,
        value_deserializer=lambda value: json.loads(value.decode("utf-8")),
    )

    headers = {"Content-Type": "application/json"}
    if args.ingestion_key:
        headers["X-Ingestion-Key"] = args.ingestion_key

    await consumer.start()
    try:
        async with httpx.AsyncClient(base_url=args.api_base, timeout=10.0) as client:
            async for message in consumer:
                payload = message.value
                response = await client.post("/api/v1/ingest/telemetry", json=payload, headers=headers)
                response.raise_for_status()
    finally:
        await consumer.stop()


if __name__ == "__main__":
    asyncio.run(run())
