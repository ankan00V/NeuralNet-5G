# NeuralNet5G
## A secure, explainable AI operator console for proactive 5G tower fault prevention

Author: Team NeuralNet5G (5G Innovation Hackathon 2026)

### One-minute abstract
NeuralNet5G is an end-to-end telecom operations platform that scores live 5G tower KPI time-series, predicts fault type + risk, opens and manages incidents, recommends operator playbooks, and produces credible evidence: explainability attributions, signed audit logs, and tenant-scoped trace records. The system supports a demo simulator for judges and a production mode that enforces safety gates (auth/RBAC/tenancy, ingestion keys, model quality gates, and dev-route disabling).

### What judges can verify quickly (5 minutes)
1. Run locally with Slim HTTPS routing:
   - `slim start neuralnet5g --port 5173 --route /api=8000`
   - Open `https://neuralnet5g.test`
2. Sign in:
   - Email: `ops@neuralnet5g.ai`
   - Password: `12345`
3. Evidence endpoints:
   - Health: `GET /api/health/live`, `GET /api/health/ready`
   - Towers: `GET /api/towers` (tenant-scoped)
   - Explainability: `GET /api/v1/explain/{tower_id}` (model-backed attribution)
   - Observability: `GET /api/v1/observability`, Prometheus `GET /metrics`
   - Model quality transparency: `GET /api/v1/model-quality`
   - Trace log (prediction proof): `GET /api/v1/trace-log`
   - Signed audit trail: `GET /api/v1/audit-log`

---

## 1. Problem statement
5G RAN operations teams face three recurring issues:
- KPI noise and the scale of sites make manual triage slow; faults often become visible only after customer impact.
- “AI” demos frequently collapse under scrutiny because explanations, forecasts, or business impact numbers are synthetic.
- Even strong models fail in production without controls: auth, auditability, tenancy isolation, safe runtime modes, and observability.

NeuralNet5G targets proactive risk scoring (before impact), explainability credibility, and production-grade safety posture.

---

## 2. System overview (end-to-end)
NeuralNet5G is built as a real-time loop:
1. Ingest KPI telemetry (simulator or external feed).
2. Build 30-step windows per tower and run inference.
3. Broadcast live tower states via WebSocket.
4. Generate recommendations and incident workflow updates.
5. Produce verifiable evidence: model explanations, audit events, trace records, and metrics.

### Architecture (logical)
Frontend (Vite + React)
- Operator login + workspace
- Live national tower map and tower queue
- Incident workflow actions and approvals
- Explainability + forecast visualization
- Governance panels (audit + integration events)

Backend (FastAPI)
- `/api/ws/live`: real-time tower updates (tenant-scoped)
- `/api/predict`: inference API (RBAC protected)
- Incident lifecycle workflow and signed audit logging
- Observability: drift/latency counters, Prometheus `/metrics`
- Ingestion API for external telemetry + key-based access

Model (PyTorch + sklearn)
- Sequence feature engineering (raw + engineered temporal groups)
- Fault classification: `normal`, `congestion`, `coverage_degradation`, `hardware_anomaly`
- Calibration artifacts: class bias + per-class thresholds
- Explainability: gradient*input attribution aggregated to raw KPIs

---

## 3. ML pipeline details

### 3.1 Data and features
Input per tower is a 30-step KPI window with raw features:
- `rsrp`, `sinr`, `dl_throughput`, `ul_throughput`, `ho_failure_rate`, `rtt`

Feature engineering expands each time step into grouped engineered features (temporal deltas, rolling statistics). A scaler is fit on training data and shipped as an artifact.

### 3.2 Model
Core model is a bidirectional LSTM with attention pooling, followed by a deeper classifier head. Output is a 4-way probability distribution.

### 3.3 Minority-class optimization (telecom-relevant)
Telecom operations cares most about minority fault classes. The training pipeline includes:
- weighted sampler (optional)
- focal loss option (configurable)
- validation objective that weights minority macro-F1 (`congestion`, `coverage_degradation`, `hardware_anomaly`) more than overall macro-F1

### 3.4 Calibration and decoding
The predictor supports:
- `class_bias`: additive logit bias
- `class_thresholds`: per-class decision thresholds for fault-vs-normal gating

This avoids “argmax always” behavior and lets operators tune the fault trigger boundary.

### 3.5 Explainability (no theater)
Explain endpoint is model-backed and refuses to run if trained artifacts are missing.
Method:
- gradient*input attribution on the selected predicted class probability
- fold engineered features back into raw KPI impacts

Output is an ordered set of KPI attributions that a judge can inspect for plausibility.

### 3.6 Forecasting (guarded)
Forecast is implemented as model-driven Monte Carlo projection:
- estimate short-term KPI drift from recent history + noise
- simulate horizon windows and re-score with the predictor

Forecast endpoint remains behind a config flag (`ENABLE_FORECAST_ENDPOINT`) because “always-on forecasting” is high stakes; gating is part of production safety.

---

## 4. Workflow and operator automation

### 4.1 Incident lifecycle engine
For towers above a configurable probability threshold, the backend opens incidents and supports transitions:
- acknowledge, dispatch, remediate, fail, rollback, verify, close, note

Each action is tenant-validated and written into the signed audit log.

### 4.2 Recommendations (self-healing playbooks)
Given fault type + probability, NeuralNet5G returns ranked actions with resolution-time and confidence.
The console surfaces these to the operator as “what to do now” evidence.

### 4.3 Demo behavior separation
Demo drills and mutation endpoints exist for hackathon story flow, but are isolated:
- backend dev endpoints require `APP_MODE=demo` and `ENABLE_DEV_ENDPOINTS=true` and admin role
- production rejects dev endpoints at config validation
- frontend local demo simulation runs only in demo runtime, and clears local synthetic artifacts when live mode is active

---

## 5. Security posture (production controls)
NeuralNet5G includes real controls rather than client-only login:
- JWT session tokens stored as HTTP-only cookies
- RBAC permissions per role (`admin`, `operator`, `viewer`, `service`)
- tenant scoping: non-admin users can only view/act on their operator’s towers and incidents
- ingestion write access via `X-Ingestion-Key` and/or service user
- request body limits + rate limiting middleware
- production-mode config validation rejects unsafe settings (wildcard CORS, missing secrets, simulator ingestion)
- strict runtime modes:
  - `APP_MODE=demo`: simulator + judge drill flows (still gated)
  - `APP_MODE=prod`: external ingestion only, secrets required, dev endpoints forbidden, model gate enforced

---

## 6. Observability and evidence

### 6.1 Prometheus metrics
`GET /metrics` exposes counters/histograms for:
- HTTP request totals
- inference totals, failures
- inference latency histogram
- drift score and drift alert status

### 6.2 Drift and latency monitoring
The backend maintains a baseline distribution for KPIs (from training metadata) and computes a simple drift score from live tower aggregates. Drift alerts can be raised into the in-memory alert feed and optionally pushed to an external webhook (`ALERT_WEBHOOK_URL`).

### 6.3 Trace log and signed audit log
NeuralNet5G keeps:
- prediction trace records (`/api/v1/trace-log`) for high-risk non-normal predictions
- signed audit records (`/api/v1/audit-log`) chained with a previous signature for tamper evidence

This provides credibility: judges can see the system is recording concrete model outputs and operator actions.

---

## 7. Current baseline results (transparent)
The current model artifacts are intentionally reported without inflating performance:
- `macro_f1`: ~0.316
- per-class F1:
  - `congestion`: ~0.492
  - `coverage_degradation`: ~0.295
  - `hardware_anomaly`: ~0.332

Interpretation:
- The platform is production-safe by design (auth, gating, auditability, observability).
- The model is a credible baseline but not yet production-grade for minority classes.
- Production mode enforces a model quality gate and can refuse startup when metrics are below thresholds.

---

## 8. Reproducibility and runbook (judge-friendly)

### 8.1 Local run (recommended)
Backend:
- `python -m venv .venv && source .venv/bin/activate`
- `pip install -r api/requirements.txt`
- `cp .env.example .env`
- `uvicorn api.main:app --host 0.0.0.0 --port 8000`

Frontend:
- `cd dashboard && npm install`
- `cp .env.example .env`
- `npm run dev -- --host 0.0.0.0 --port 5173`

Slim HTTPS local domain:
- `slim start neuralnet5g --port 5173 --route /api=8000`
- open `https://neuralnet5g.test`

### 8.2 External telemetry ingest (production-oriented path)
Use:
- `POST /api/v1/ingest/telemetry`
- `POST /api/v1/ingest/telemetry/batch`

Provide either:
- `X-Ingestion-Key: <key>` (recommended for services)
or a service JWT user with `ingest:write`.

---

## 9. Why this is hackathon-winner worthy
NeuralNet5G is not just a dashboard and not just a model:
- It ships an end-to-end story: KPI → model → explanation → incident → action → audit → metrics.
- It is honest about model quality and protects production with gates.
- It treats security and evidence as first-class requirements, not afterthoughts.
- It provides judge-verifiable proofs (trace log, signed audit log, explainability outputs, Prometheus metrics).

---

## 10. Roadmap (post-hackathon)
To reach operator production readiness:
- integrate operator-equivalent telemetry feeds (Kafka/MQTT/OSS alarms) and real label sources
- expand classes and add multi-site correlation
- improve minority-class performance via more data, better architectures, and cost-sensitive objectives
- add long-horizon forecasting with evaluation and safety thresholds
- add persistent metrics/tracing backends (OpenTelemetry exporters) and alert routing
