# Telecom Ingestion Contract

NeuralNet5G now supports three runtime ingestion modes via `INGESTION_MODE`:

- `simulator`: current behavior, no external feed required.
- `hybrid`: consume external telemetry when present, fallback to simulator otherwise.
- `external`: consume only external telemetry windows.

## API Endpoints

- `POST /api/v1/ingest/telemetry`
- `POST /api/v1/ingest/telemetry/batch`

Authentication:

- Preferred: `X-Ingestion-Key: <key>` where key is listed in `INGESTION_API_KEYS`.
- Fallback: authenticated `admin` or `service` user session.

## Event Schema

```json
{
  "tower_id": "TOWER_042",
  "timestamp": "2026-04-19T15:00:00Z",
  "operator": "Airtel",
  "city": "Mumbai - Sector 12",
  "lat": 19.076,
  "lon": 72.877,
  "profile": "urban_core",
  "source": "kafka-ran-topic",
  "kpis": {
    "rsrp": -98.2,
    "sinr": 4.7,
    "dl_throughput": 112.5,
    "ul_throughput": 19.4,
    "ho_failure_rate": 6.1,
    "rtt": 94.2
  }
}
```

## Reference Adapters

- `scripts/ingest_kafka.py`: Kafka topic to ingestion endpoint.
- `scripts/ingest_mqtt.py`: MQTT topic to ingestion endpoint.

Both adapters forward raw telemetry payloads to the ingestion API and can be deployed next to OSS/BSS/RAN connectors.
