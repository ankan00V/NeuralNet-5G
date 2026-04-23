from __future__ import annotations


def test_health_contract(client):
    response = client.get("/api/health/live")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert "timestamp" in payload


def test_predict_contract(client):
    payload = {
        "tower_id": "TOWER_001",
        "kpi_window": [[-85.0, 14.0, 280.0, 60.0, 1.2, 18.0] for _ in range(30)],
    }
    response = client.post("/api/predict", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["tower_id"] == "TOWER_001"
    assert isinstance(body["fault_probability"], float)
    assert body["fault_type"] in {"normal", "congestion", "coverage_degradation", "hardware_anomaly"}


def test_towers_contract(client):
    response = client.get("/api/towers")
    assert response.status_code == 200
    body = response.json()
    assert "towers" in body
    assert "timestamp" in body
    assert len(body["towers"]) >= 1


def test_explain_contract(client):
    towers = client.get("/api/towers").json()["towers"]
    tower_id = towers[0]["tower_id"]

    response = client.get(f"/api/v1/explain/{tower_id}")
    if response.status_code == 200:
        body = response.json()
        assert body["tower_id"] == tower_id
        assert body["method"]
        assert isinstance(body["attributions"], list)
        assert body["attributions"]
        assert {"feature", "impact"}.issubset(body["attributions"][0].keys())
    else:
        assert response.status_code == 503
        assert "trained model artifacts" in response.json()["detail"]


def test_incident_and_acknowledge_flow(client):
    towers = client.get("/api/towers").json()["towers"]
    tower = sorted(towers, key=lambda item: item["fault_probability"], reverse=True)[0]
    tower_id = tower["tower_id"]

    ack_response = client.post(
        "/api/acknowledge",
        json={"tower_id": tower_id, "alert_id": f"{tower_id}-test-alert"},
    )
    assert ack_response.status_code == 200

    incident_response = client.get("/api/v1/incidents")
    assert incident_response.status_code == 200
    body = incident_response.json()
    assert "incidents" in body
    assert "count" in body


def test_observability_metrics_contract(client):
    response = client.get("/metrics")
    assert response.status_code == 200
    body = response.text
    assert "nn5g_http_requests_total" in body
    assert "nn5g_inference_total" in body


def test_model_quality_contract(client):
    response = client.get("/api/v1/model-quality")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] in {"ok", "missing"}
    assert "gate" in body
    assert "model_version" in body


def test_trace_log_contract(client):
    response = client.get("/api/v1/trace-log?limit=20")
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body["count"], int)
    assert isinstance(body["records"], list)
    if body["records"]:
        first = body["records"][0]
        assert "trace_id" in first
        assert "tower_id" in first
        assert "fault_type" in first


def test_service_metrics_contract(client):
    response = client.get("/api/v1/service-metrics")
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body["auto_resolved_count"], int)
    assert isinstance(body["downtime_avoided_minutes"], int)
    assert isinstance(body["users_protected"], int)
    assert isinstance(body["cost_saved"], int)
    assert isinstance(body["active_dispatches"], int)
    assert isinstance(body["open_incidents"], int)
    assert body["source"] == "server"
    assert "updated_at" in body
