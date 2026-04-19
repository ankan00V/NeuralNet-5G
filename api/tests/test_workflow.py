from __future__ import annotations

import asyncio

from api.security import UserPrincipal
from api.workflow import IncidentWorkflow


def test_workflow_transitions_open_to_ack_to_closed():
    asyncio.run(_test_workflow_transitions_open_to_ack_to_closed())


async def _test_workflow_transitions_open_to_ack_to_closed():
    workflow = IncidentWorkflow(storage=None, open_probability_threshold=0.5)

    incident = await workflow.upsert_from_prediction(
        {
            "tower_id": "TOWER_001",
            "fault_type": "congestion",
            "fault_probability": 0.82,
            "operator": "Airtel",
            "city": "Delhi",
        }
    )
    assert incident is not None
    assert incident["status"] == "open"

    actor = UserPrincipal(subject="ops", email="ops@example.com", name="Ops", role="operator", tenant="Airtel")
    acknowledged = await workflow.transition(incident["incident_id"], "acknowledged", actor)
    assert acknowledged is not None
    assert acknowledged["status"] == "acknowledged"

    closed = await workflow.upsert_from_prediction(
        {
            "tower_id": "TOWER_001",
            "fault_type": "normal",
            "fault_probability": 0.11,
            "operator": "Airtel",
            "city": "Delhi",
        }
    )
    assert closed is not None
    assert closed["status"] == "closed"
