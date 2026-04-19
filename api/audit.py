from __future__ import annotations

import hashlib
import hmac
import json
from datetime import UTC, datetime
from typing import Any

from api.mongo import MongoStorage
from api.security import UserPrincipal


class AuditLogger:
    def __init__(self, storage: MongoStorage | None, signing_key: str, max_records: int = 500) -> None:
        self.storage = storage
        self.signing_key = signing_key.encode("utf-8")
        self.max_records = max_records
        self.memory_records: list[dict[str, Any]] = []
        self._previous_signature = ""

    def _sign(self, payload: dict[str, Any]) -> str:
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")
        return hmac.new(self.signing_key, canonical, hashlib.sha256).hexdigest()

    async def write(
        self,
        *,
        event: str,
        actor: UserPrincipal | None,
        resource: str,
        action: str,
        outcome: str,
        details: dict[str, Any] | None = None,
        request_id: str | None = None,
    ) -> None:
        record: dict[str, Any] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "event": event,
            "resource": resource,
            "action": action,
            "outcome": outcome,
            "request_id": request_id,
            "actor": {
                "subject": actor.subject,
                "email": actor.email,
                "role": actor.role,
                "tenant": actor.tenant,
            }
            if actor is not None
            else {"subject": "service", "role": "ingestion"},
            "details": details or {},
            "prev_signature": self._previous_signature,
        }
        record["signature"] = self._sign(record)
        self._previous_signature = record["signature"]

        if self.storage is not None:
            await self.storage.write_audit_log(record)
            return

        self.memory_records.insert(0, record)
        del self.memory_records[self.max_records :]

    async def list(self, limit: int = 100) -> list[dict[str, Any]]:
        max_limit = min(max(1, limit), self.max_records)
        if self.storage is not None:
            return await self.storage.list_audit_log(limit=max_limit)
        return self.memory_records[:max_limit]
