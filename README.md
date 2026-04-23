# NeuralNet5G

NeuralNet5G is a telecom operations platform for early fault detection, explainable risk scoring, and operator workflow orchestration.

It includes:
- Real-time tower risk updates over WebSocket.
- Fault prediction + explainability APIs.
- Incident lifecycle workflow and audit logging.
- Secure API surface (auth, RBAC, tenant scoping, rate/body limits).
- Demo-mode simulator and production-safe runtime switches.

## Judge Evaluation (Fast Path)

### 1. What to evaluate
- Product credibility: no synthetic/random explainability values in API output.
- Safety posture: demo-only mutation endpoints are guarded and disabled in production.
- Deployment hygiene: no localhost or embedded API keys in frontend source.
- Ops readiness: authenticated API, audit trail, ingest contract, health/readiness checks.
- Model quality transparency: current baseline metrics are reported honestly (not yet production-grade).

### 2. 8-minute runbook

1. Backend setup
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r api/requirements.txt
cp .env.example .env
```

2. Set judge-friendly demo credentials in `.env`
```bash
cat >> .env <<'ENV'
AUTH_USERS_JSON=[{"email":"ops@neuralnet5g.ai","name":"NOC Lead","role":"admin","tenant":"*","password_hash":"plain:judge123"}]
APP_MODE=demo
ENABLE_DEV_ENDPOINTS=false
INGESTION_MODE=simulator
REQUIRE_WEBSOCKET_AUTH=true
ENV
```

3. Generate training/eval artifacts (optional but recommended for full evidence)
```bash
python -m data.simulator --mode dataset --hours 24
python -m model.train
python -m model.evaluate
```

4. Start API
```bash
uvicorn api.main:app --host 0.0.0.0 --port 8000
```

5. Start frontend
```bash
cd dashboard
npm install
cp .env.example .env
# optional: add your key if you want map tiles
# echo "VITE_GOOGLE_MAPS_API_KEY=..." >> .env
npm run dev -- --host 0.0.0.0 --port 5173
```

6. Serve with Slim (required local hosting workflow)
```bash
slim start neuralnet5g --port 5173 --route /api=8000
```
Open: `https://neuralnet5g.test`

7. Login
- Email: `ops@neuralnet5g.ai`
- Password: `judge123`

8. Optional public demo link (time-boxed)
```bash
slim share --port 5173 --subdomain neuralnet5g-demo --ttl 2h
```

### 3. Quick evidence checks (copy/paste)

1. Health and readiness
```bash
curl -s https://neuralnet5g.test/api/health/live
curl -s https://neuralnet5g.test/api/health/ready
```

2. Login and token
```bash
TOKEN=$(curl -s https://neuralnet5g.test/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"ops@neuralnet5g.ai","password":"judge123"}' | jq -r '.access_token')
```

3. Towers, explainability, observability
```bash
curl -s https://neuralnet5g.test/api/towers -H "Authorization: Bearer $TOKEN" | jq '.towers | length'
curl -s https://neuralnet5g.test/api/v1/explain/TOWER_001 -H "Authorization: Bearer $TOKEN" | jq '{method, model, top: .attributions[0:3]}'
curl -s https://neuralnet5g.test/api/v1/observability -H "Authorization: Bearer $TOKEN" | jq
curl -s https://neuralnet5g.test/api/v1/model-quality -H "Authorization: Bearer $TOKEN" | jq
curl -s https://neuralnet5g.test/api/v1/trace-log -H "Authorization: Bearer $TOKEN" | jq '.count'
curl -s https://neuralnet5g.test/metrics | head -40
```

4. Guardrail proof (dev endpoint disabled unless explicit demo+flag)
```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  https://neuralnet5g.test/api/dev/reset-tower \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"tower_id":"TOWER_001"}'
# expected: 404 when ENABLE_DEV_ENDPOINTS=false
```

5. Ingestion contract proof
```bash
curl -s https://neuralnet5g.test/api/v1/ingest/telemetry \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "tower_id":"TOWER_042",
    "timestamp":"2026-04-19T15:00:00Z",
    "operator":"Airtel",
    "city":"Mumbai - Sector 12",
    "lat":19.076,
    "lon":72.877,
    "profile":"urban_core",
    "source":"judge-manual",
    "kpis":{"rsrp":-98.2,"sinr":4.7,"dl_throughput":112.5,"ul_throughput":19.4,"ho_failure_rate":6.1,"rtt":94.2}
  }' | jq
```

## Current Scorecard (Transparent Baseline)

Latest `model/metrics.json` generated at `2026-04-20T08:16:00Z`:
- `accuracy`: 0.3428
- `macro_f1`: 0.3159
- `congestion f1`: 0.4918
- `coverage_degradation f1`: 0.2947
- `hardware_anomaly f1`: 0.3323

Interpretation:
- This is acceptable for architecture/demo validation.
- This is not yet production-acceptable for minority fault classes.
- The platform enforces model quality gates in production (`ENFORCE_MODEL_GATE=true` by default in `APP_MODE=prod`) and blocks startup when KPIs miss thresholds.

## What Was Hardened

### Explainability and forecast credibility
- Prediction explainability in production requires trained model artifacts and uses model signals (`gradient-x-input`).
- Forecast API uses model-driven Monte Carlo horizon scoring and remains behind `ENABLE_FORECAST_ENDPOINT` (returns `404` when disabled).

### Auth, RBAC, tenancy, and audit
- Login/session endpoints:
  - `POST /api/v1/auth/login`
  - `GET /api/v1/auth/me`
  - `POST /api/v1/auth/logout`
- Role/permission checks for tower, prediction, recommendation, incident, and ingest paths.
- Tenant checks prevent cross-operator actions for non-admin roles.
- Signed audit records exposed via `GET /api/v1/audit-log`.
- Prediction trace records exposed via `GET /api/v1/trace-log` (tenant-scoped).

### Observability and alerting
- Prometheus metrics endpoint: `GET /metrics`.
- Model drift score + drift alert state are tracked and exposed in observability payloads.
- Optional outbound alert webhook (`ALERT_WEBHOOK_URL`) forwards structured alert events to external tooling.

### Demo isolation and unsafe routes
- Demo behaviors are mode-gated in frontend (`VITE_APP_MODE`) and backend (`APP_MODE`).
- Dev mutation endpoints (`/api/dev/inject-fault`, `/api/dev/reset-tower`) require:
  - admin role
  - `APP_MODE=demo`
  - `ENABLE_DEV_ENDPOINTS=true`
- In production mode, these endpoints are not available.

### Frontend deployment hygiene
- API host is env-configurable (`VITE_API_BASE_URL`), no localhost hardcoding.
- Google Maps key must come from env (`VITE_GOOGLE_MAPS_API_KEY`), no embedded fallback key.

### Ingestion path beyond simulator
- `INGESTION_MODE` supports `simulator`, `hybrid`, and `external` in demo workflows.
- In production (`APP_MODE=prod`), ingestion is locked to `INGESTION_MODE=external` and requires `INGESTION_API_KEYS`.
- External ingestion endpoints:
  - `POST /api/v1/ingest/telemetry`
  - `POST /api/v1/ingest/telemetry/batch`
- Reference adapters:
  - `scripts/ingest_kafka.py`
  - `scripts/ingest_mqtt.py`
- Contract: `docs/ingestion_contract.md`

## Architecture Snapshot

- `api/`: FastAPI app, auth/RBAC, workflows, ingestion, observability.
- `dashboard/`: React + Vite operator console.
- `model/`: Training, evaluation, inference, calibration artifacts.
- `data/`: Telecom KPI simulator and dataset generation.
- `scripts/`: adapters, smoke pipeline, utilities.

## Runtime Modes

- `APP_MODE=demo`
  - Simulator available.
  - Legacy unprefixed API routes also mounted.
  - Dev endpoints still require explicit `ENABLE_DEV_ENDPOINTS=true`.

- `APP_MODE=prod`
  - Auth must be enabled.
  - WebSocket auth must be enabled.
  - Wildcard CORS rejected.
  - Dev endpoints forbidden.
  - Audit signing key required.
  - External ingestion feed and ingestion keys are required.
  - Model quality gate is mandatory.

## Environment Variables

Backend (`.env`):
- `APP_MODE=demo|prod`
- `AUTH_ENABLED=true|false`
- `AUTH_JWT_SECRET=...`
- `AUDIT_SIGNING_KEY=...`
- `AUTH_USERS_JSON=[...]`
- `ENABLE_DEV_ENDPOINTS=true|false`
- `INGESTION_MODE=simulator|hybrid|external`
- `INGESTION_API_KEYS=key1,key2`
- `REQUIRE_WEBSOCKET_AUTH=true|false`
- `TELEMETRY_MIN_ACTIVE_TOWERS=0`
- `ALERT_WEBHOOK_URL=`
- `ALERT_WEBHOOK_TIMEOUT_SECONDS=2.0`
- `ENFORCE_MODEL_GATE=true|false`
- `MODEL_MIN_MACRO_F1=...`
- `MODEL_MIN_CLASS_F1=...`
- `ENABLE_FORECAST_ENDPOINT=true|false`

Frontend (`dashboard/.env`):
- `VITE_APP_MODE=demo|prod`
- `VITE_API_BASE_URL=`
- `VITE_WS_URL=`
- `VITE_GOOGLE_MAPS_API_KEY=`

## Testing and Verification

Backend:
```bash
pytest api/tests -q
```

Frontend:
```bash
cd dashboard
npm run test:run
npm run build
```

End-to-end smoke:
```bash
API_BASE_URL=https://neuralnet5g.test \
API_AUTH_EMAIL=ops@neuralnet5g.ai \
API_AUTH_PASSWORD=judge123 \
python scripts/smoke_pipeline.py
```

## Known Gaps (Explicit)

- Minority-class model quality still below production expectation; additional data and architecture work is required before field rollout.
- Bundle still includes a large lazy-loaded 3D/login asset chunk; initial route is optimized, but total artifact size can be reduced further.
- OSS/BSS/RAN adapters are reference-level examples; operator-specific contract integrations are still implementation work.

## Slim Commands Reference

Install:
```bash
curl -sL https://slim.sh/install.sh | sh
```

Local domain with API path routing:
```bash
slim start neuralnet5g --port 5173 --route /api=8000
```

List, logs, stop:
```bash
slim list
slim logs
slim stop
```

Internet sharing:
```bash
slim login
slim share --port 5173 --subdomain neuralnet5g-demo --ttl 2h
```
