from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from api.mongo import MongoStorage
from api.security import UserPrincipal


OPEN_STATES = {"open", "acknowledged", "dispatched"}


class IncidentWorkflow:
    def __init__(self, storage: MongoStorage | None, open_probability_threshold: float = 0.5) -> None:
        self.storage = storage
        self.open_probability_threshold = open_probability_threshold
        self._memory_incidents: dict[str, dict[str, Any]] = {}

    def _event(self, event: str, actor: UserPrincipal | None, details: dict[str, Any] | None = None) -> dict[str, Any]:
        return {
            "timestamp": datetime.now(UTC).isoformat(),
            "event": event,
            "actor": {
                "subject": actor.subject,
                "email": actor.email,
                "role": actor.role,
                "tenant": actor.tenant,
            }
            if actor is not None
            else {"subject": "system", "role": "service"},
            "details": details or {},
        }

    async def _get_open_for_tower(self, tower_id: str) -> dict[str, Any] | None:
        if self.storage is not None:
            return await self.storage.get_open_incident_for_tower(tower_id)
        matches = [incident for incident in self._memory_incidents.values() if incident["tower_id"] == tower_id and incident["status"] in OPEN_STATES]
        matches.sort(key=lambda item: item.get("updated_at", ""), reverse=True)
        return matches[0] if matches else None

    async def get_open_incident_for_tower(self, tower_id: str) -> dict[str, Any] | None:
        return await self._get_open_for_tower(tower_id)

    async def _save(self, incident: dict[str, Any]) -> None:
        incident["updated_at"] = datetime.now(UTC).isoformat()
        if self.storage is not None:
            await self.storage.upsert_incident(incident)
            return
        self._memory_incidents[incident["incident_id"]] = incident

    async def upsert_from_prediction(self, tower: dict[str, Any]) -> dict[str, Any] | None:
        tower_id = str(tower["tower_id"])
        fault_probability = float(tower["fault_probability"])
        fault_type = str(tower["fault_type"])
        existing = await self._get_open_for_tower(tower_id)

        should_open = fault_type != "normal" and fault_probability >= self.open_probability_threshold
        if should_open:
            if existing is None:
                incident_id = f"INC-{uuid.uuid4().hex[:10].upper()}"
                incident = {
                    "incident_id": incident_id,
                    "tower_id": tower_id,
                    "operator": tower.get("operator"),
                    "city": tower.get("city"),
                    "fault_type": fault_type,
                    "fault_probability": fault_probability,
                    "status": "open",
                    "opened_at": datetime.now(UTC).isoformat(),
                    "updated_at": datetime.now(UTC).isoformat(),
                    "history": [self._event("opened", None, {"source": "prediction"})],
                }
            else:
                incident = existing
                incident["fault_type"] = fault_type
                incident["fault_probability"] = fault_probability
                if incident["status"] not in OPEN_STATES:
                    incident["status"] = "open"
                incident.setdefault("history", []).append(self._event("updated", None, {"source": "prediction"}))
            await self._save(incident)
            return incident

        if existing is not None:
            existing["status"] = "closed"
            existing.setdefault("history", []).append(self._event("closed", None, {"reason": "risk-normalized"}))
            await self._save(existing)
            return existing

        return None

    async def transition(
        self,
        incident_id: str,
        next_status: str,
        actor: UserPrincipal,
        details: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        incident = await self.get_incident(incident_id)
        if incident is None:
            return None
        incident["status"] = next_status
        incident.setdefault("history", []).append(self._event(next_status, actor, details))
        await self._save(incident)
        return incident

    async def append_event(
        self,
        incident_id: str,
        event_name: str,
        actor: UserPrincipal,
        details: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        incident = await self.get_incident(incident_id)
        if incident is None:
            return None
        incident.setdefault("history", []).append(self._event(event_name, actor, details))
        await self._save(incident)
        return incident

    async def get_incident(self, incident_id: str) -> dict[str, Any] | None:
        if self.storage is not None:
            return await self.storage.get_incident(incident_id)
        return self._memory_incidents.get(incident_id)

    async def list_incidents(self, limit: int = 100, include_closed: bool = False) -> list[dict[str, Any]]:
        if self.storage is not None:
            return await self.storage.list_incidents(limit=limit, include_closed=include_closed)
        incidents = list(self._memory_incidents.values())
        if not include_closed:
            incidents = [item for item in incidents if item["status"] != "closed"]
        incidents.sort(key=lambda item: item.get("updated_at", ""), reverse=True)
        return incidents[:limit]
