from __future__ import annotations

import logging
import os
from datetime import UTC, datetime
from typing import Any, Iterable

from api.schemas import TowerStatus

try:
    import certifi
    from motor.motor_asyncio import AsyncIOMotorClient
    from pymongo import UpdateOne
except ImportError:  # pragma: no cover - graceful fallback for local envs without motor yet
    certifi = None
    AsyncIOMotorClient = None
    UpdateOne = None


logger = logging.getLogger(__name__)


class MongoStorage:
    def __init__(self, client: Any, database: Any) -> None:
        self.client = client
        self.database = database
        self.towers = database["towers"]
        self.acknowledgements = database["acknowledgements"]
        self.trace_log = database["trace_log"]
        self.audit_log = database["audit_log"]
        self.incidents = database["incidents"]

    @classmethod
    async def connect_from_env(cls) -> "MongoStorage | None":
        uri = os.getenv("MONGODB_URI")
        if not uri:
            return None

        if AsyncIOMotorClient is None or UpdateOne is None:
            logger.warning("MONGODB_URI is set but motor/pymongo is not installed; continuing with in-memory storage.")
            return None

        database_name = os.getenv("MONGODB_DB", "neuralnet5g")

        try:
            client_options: dict[str, Any] = {"serverSelectionTimeoutMS": 5000}
            if certifi is not None:
                client_options["tlsCAFile"] = certifi.where()

            client = AsyncIOMotorClient(uri, **client_options)
            await client.admin.command("ping")
            storage = cls(client, client[database_name])
            await storage.ensure_indexes()
            logger.info("Connected to MongoDB database '%s'.", database_name)
            return storage
        except Exception as exc:  # pragma: no cover - depends on external service
            logger.warning("MongoDB connection failed, continuing with in-memory storage: %s", exc)
            return None

    async def ensure_indexes(self) -> None:
        await self.towers.create_index("tower_id", unique=True)
        await self.acknowledgements.create_index("alert_id", unique=True)
        await self.acknowledgements.create_index("tower_id")
        await self.trace_log.create_index("trace_id", unique=True)
        await self.trace_log.create_index("tower_id")
        await self.trace_log.create_index("timestamp")
        await self.audit_log.create_index("timestamp")
        await self.audit_log.create_index("event")
        await self.audit_log.create_index("actor.email")
        await self.incidents.create_index("incident_id", unique=True)
        await self.incidents.create_index("tower_id")
        await self.incidents.create_index("status")
        await self.incidents.create_index("updated_at")

    async def close(self) -> None:
        self.client.close()

    async def load_acknowledged_alerts(self) -> dict[str, str]:
        rows = await self.acknowledgements.find({}, {"_id": 0, "alert_id": 1, "tower_id": 1}).to_list(length=None)
        return {row["alert_id"]: row["tower_id"] for row in rows}

    async def upsert_towers(self, towers: Iterable[TowerStatus], timestamp: datetime) -> None:
        operations = []
        persisted_at = timestamp.astimezone(UTC)

        for tower in towers:
            document = tower.model_dump(mode="json")
            document["updated_at"] = persisted_at
            operations.append(
                UpdateOne(
                    {"tower_id": tower.tower_id},
                    {"$set": document},
                    upsert=True,
                )
            )

        if operations:
            await self.towers.bulk_write(operations, ordered=False)

    async def list_towers(self) -> list[TowerStatus]:
        rows = await self.towers.find({}, {"_id": 0, "updated_at": 0}).sort("tower_id", 1).to_list(length=None)
        return [TowerStatus.model_validate(row) for row in rows]

    async def acknowledge_alert(self, tower_id: str, alert_id: str) -> None:
        acknowledged_at = datetime.now(UTC)
        await self.acknowledgements.update_one(
            {"alert_id": alert_id},
            {
                "$set": {
                    "alert_id": alert_id,
                    "tower_id": tower_id,
                    "acknowledged_at": acknowledged_at,
                }
            },
            upsert=True,
        )
        await self.towers.update_one(
            {"tower_id": tower_id},
            {"$set": {"acknowledged": True, "acknowledged_at": acknowledged_at}},
        )

    async def write_trace_log(self, record: dict) -> None:
        try:
            await self.trace_log.insert_one(record)
        except Exception as exc:  # pragma: no cover
            logger.warning("Trace log write failed: %s", exc)

    async def list_trace_log(self, limit: int = 100) -> list[dict]:
        rows = await (
            self.trace_log
            .find({}, {"_id": 0})
            .sort("timestamp", -1)
            .limit(limit)
            .to_list(length=limit)
        )
        return rows

    async def write_audit_log(self, record: dict) -> None:
        try:
            await self.audit_log.insert_one(record)
        except Exception as exc:  # pragma: no cover
            logger.warning("Audit log write failed: %s", exc)

    async def list_audit_log(self, limit: int = 100) -> list[dict]:
        rows = await (
            self.audit_log
            .find({}, {"_id": 0})
            .sort("timestamp", -1)
            .limit(limit)
            .to_list(length=limit)
        )
        return rows

    async def get_incident(self, incident_id: str) -> dict | None:
        return await self.incidents.find_one({"incident_id": incident_id}, {"_id": 0})

    async def get_open_incident_for_tower(self, tower_id: str) -> dict | None:
        return await self.incidents.find_one(
            {"tower_id": tower_id, "status": {"$in": ["open", "acknowledged", "dispatched"]}},
            {"_id": 0},
            sort=[("updated_at", -1)],
        )

    async def upsert_incident(self, incident: dict) -> None:
        incident = dict(incident)
        incident["updated_at"] = datetime.now(UTC)
        await self.incidents.update_one({"incident_id": incident["incident_id"]}, {"$set": incident}, upsert=True)

    async def list_incidents(self, limit: int = 100, include_closed: bool = False) -> list[dict]:
        query: dict[str, Any] = {}
        if not include_closed:
            query["status"] = {"$in": ["open", "acknowledged", "dispatched", "failed", "rolled_back"]}
        return await (
            self.incidents.find(query, {"_id": 0}).sort("updated_at", -1).limit(limit).to_list(length=limit)
        )
