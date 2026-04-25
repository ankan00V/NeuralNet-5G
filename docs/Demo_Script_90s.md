# NeuralNet5G - 90-Second Demo Script

Goal: show end-to-end credibility (prediction -> workflow -> action -> evidence), without dead time.

## Pre-demo setup (do this before walking in)
- Start backend + frontend and expose with Slim:
  - `uvicorn api.main:app --host 0.0.0.0 --port 8000`
  - `cd dashboard && npm run dev -- --host 0.0.0.0 --port 5173`
  - `slim start neuralnet5g --port 5173 --route /api=8000`
- Open: `https://neuralnet5g.test`
- Login:
  - Email: `ops@neuralnet5g.ai`
  - Password: `12345`

## Script (time-boxed)

### 0:00-0:10 (What this is)
Say:
"NeuralNet5G is an AI operator console that predicts 5G tower faults from KPI sequences, opens incidents with lead time, and produces evidence: explainability, signed audit logs, and live metrics."

Action:
- Land on **Overview**.

### 0:10-0:25 (Live proof: risk + lead time)
Say:
"We’re watching a national set of towers. Each tower is scored every cycle from a 30-step KPI window."

Action:
- Point to **Network Health**, **Critical Towers**, **Model Version**, and the live cycle timestamp.
- Click **Inference Queue** and sort by fault probability (already default).

### 0:25-0:45 (Trigger a fault drill)
Say:
"Now I’ll inject a realistic scenario to prove the closed-loop workflow."

Action:
- Go back to **Overview**.
- In **Mission Control**, click one drill:
  - Prefer **Coverage Drift Drill** or **Hardware Anomaly Drill**.
- Immediately point to the activity rail and the map for the highlighted tower.

### 0:45-1:05 (Explainability + recommended action)
Say:
"For the top tower, we can explain which KPIs drove the risk score and what the recommended playbook is."

Action:
- Click the highlighted tower on the map to open the tower drawer.
- Scroll to **Model Attribution** and read the top 1-2 KPI drivers.
- Point to the recommended action / class / lead window.

### 1:05-1:20 (Run recovery and close the loop)
Say:
"Now we execute the recovery workflow to show the system is operational, not just predictive."

Action:
- Click **Run Autonomous Recovery** (in simulation mode).
- Watch the activity log for the remediation entry.

### 1:20-1:30 (Evidence: audit + trace + metrics)
Say:
"Every operator action and AI action is recorded and verifiable."

Action:
- Open Governance panel and point to:
  - Signed audit records
  - Trace/integration events
- Optional (if asked): open `/metrics` or `/api/v1/model-quality` in a tab.

## Contingencies (avoid dead air)
- If Google Maps is unavailable: say "Map tiles are optional; the risk queue and workflow remain fully functional."
- If forecast is disabled: say "Forecast is behind a production gate; explanations remain model-backed."
- If network feed lags: switch to **Inference Queue** and open tower details from the list.

