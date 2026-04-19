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
    assert response.status_code == 200
    body = response.json()
    assert body["tower_id"] == tower_id
    assert body["method"]
    assert isinstance(body["attributions"], list)
    assert body["attributions"]
    assert {"feature", "impact"}.issubset(body["attributions"][0].keys())


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
