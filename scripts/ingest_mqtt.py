from __future__ import annotations

import argparse
import json
import os

import httpx


def main() -> None:
    parser = argparse.ArgumentParser(description="Forward telecom telemetry from MQTT to NeuralNet5G ingestion API")
    parser.add_argument("--topic", required=True)
    parser.add_argument("--broker", default=os.getenv("MQTT_BROKER", ""))
    parser.add_argument("--port", type=int, default=int(os.getenv("MQTT_PORT", "1883")))
    parser.add_argument("--api-base", default=os.getenv("API_BASE_URL", ""))
    parser.add_argument("--ingestion-key", default=os.getenv("INGESTION_API_KEY", ""))
    args = parser.parse_args()
    if not args.broker:
        raise SystemExit("Set MQTT_BROKER or pass --broker.")
    if not args.api_base:
        raise SystemExit("Set API_BASE_URL or pass --api-base.")

    try:
        import paho.mqtt.client as mqtt
    except Exception as exc:  # pragma: no cover
        raise SystemExit("Install paho-mqtt to use this adapter: pip install paho-mqtt") from exc

    client = httpx.Client(base_url=args.api_base, timeout=10.0)
    headers = {"Content-Type": "application/json"}
    if args.ingestion_key:
        headers["X-Ingestion-Key"] = args.ingestion_key

    def on_message(_client: mqtt.Client, _userdata, msg: mqtt.MQTTMessage) -> None:
        payload = json.loads(msg.payload.decode("utf-8"))
        response = client.post("/api/v1/ingest/telemetry", json=payload, headers=headers)
        response.raise_for_status()

    mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    mqtt_client.on_message = on_message
    mqtt_client.connect(args.broker, args.port, 60)
    mqtt_client.subscribe(args.topic)
    mqtt_client.loop_forever()


if __name__ == "__main__":
    main()
