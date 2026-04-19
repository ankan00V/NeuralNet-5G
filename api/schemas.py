from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


FaultType = Literal["normal", "congestion", "coverage_degradation", "hardware_anomaly"]
TowerStatusColor = Literal["green", "amber", "red"]
IncidentStatus = Literal["open", "acknowledged", "dispatched", "remediated", "failed", "rolled_back", "closed"]


class KpiWindow(BaseModel):
    tower_id: str = Field(min_length=3, max_length=64)
    kpi_window: list[list[float]] = Field(min_length=30, max_length=30)


class PredictionResponse(BaseModel):
    tower_id: str
    fault_probability: float
    fault_type: FaultType
    lead_time_minutes: int
    confidence: float
    timestamp: datetime


class RecommendationRequest(BaseModel):
    tower_id: str = Field(min_length=3, max_length=64)
    fault_type: FaultType
    fault_probability: float


class ActionRecommendation(BaseModel):
    rank: int
    action_name: str
    description: str
    confidence_score: float
    estimated_resolution_minutes: int


class RecommendationResponse(BaseModel):
    tower_id: str
    fault_type: FaultType
    actions: list[ActionRecommendation]


class KpiSnapshotResponse(BaseModel):
    tower_id: str
    timestamp: datetime
    rsrp: float
    sinr: float
    dl_throughput: float
    ul_throughput: float
    ho_failure_rate: float
    rtt: float
    lat: float | None = None
    lon: float | None = None
    city: str | None = None


class TowerStatus(BaseModel):
    tower_id: str
    status: TowerStatusColor
    last_updated: datetime | None = None
    kpis: KpiSnapshotResponse
    kpi_history: list[KpiSnapshotResponse]
    fault_probability: float
    fault_type: FaultType
    lead_time_minutes: int
    confidence: float
    top_action: str
    recommendations: list[ActionRecommendation] = Field(default_factory=list)
    acknowledged: bool = False
    lat: float | None = None
    lon: float | None = None
    city: str | None = None
    operator: str | None = None
    profile: str | None = None
    state_phase: str | None = None
    incident_id: str | None = None


class TowerListResponse(BaseModel):
    towers: list[TowerStatus]
    timestamp: datetime


class AcknowledgeRequest(BaseModel):
    tower_id: str = Field(min_length=3, max_length=64)
    alert_id: str = Field(min_length=3, max_length=128)


class FaultInjectionRequest(BaseModel):
    tower_id: str = Field(min_length=3, max_length=64)
    fault_type: Literal["congestion", "coverage_degradation", "hardware_anomaly"]
    severity: float = 0.8
    duration_steps: int | None = None
    precursor_steps: int | None = None


class ResetTowerRequest(BaseModel):
    tower_id: str = Field(min_length=3, max_length=64)


class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=200)
    password: str = Field(min_length=1, max_length=200)


class AuthUser(BaseModel):
    email: str
    name: str
    role: str
    tenant: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_seconds: int
    user: AuthUser


class TelemetryKpis(BaseModel):
    rsrp: float
    sinr: float
    dl_throughput: float
    ul_throughput: float
    ho_failure_rate: float
    rtt: float


class TelemetryIngestRequest(BaseModel):
    tower_id: str = Field(min_length=3, max_length=64)
    timestamp: datetime
    operator: str | None = Field(default=None, max_length=64)
    city: str | None = Field(default=None, max_length=120)
    lat: float | None = None
    lon: float | None = None
    profile: str | None = Field(default=None, max_length=64)
    source: str = Field(default="ingestion", max_length=32)
    kpis: TelemetryKpis


class TelemetryBatchRequest(BaseModel):
    events: list[TelemetryIngestRequest] = Field(min_length=1, max_length=250)


class ExplainAttribution(BaseModel):
    feature: str
    impact: float


class ExplainResponse(BaseModel):
    tower_id: str
    timestamp: datetime
    model: str
    method: str
    base_value: float
    output_value: float
    attributions: list[ExplainAttribution]
    note: str


class ForecastPoint(BaseModel):
    step_minutes_ahead: int
    timestamp: datetime
    predicted_probability: float
    confidence_lower: float
    confidence_upper: float


class ForecastResponse(BaseModel):
    tower_id: str
    forecast_horizon_minutes: int
    forecast: list[ForecastPoint]
    method: str


class IncidentEvent(BaseModel):
    timestamp: datetime
    event: str
    actor: dict[str, Any]
    details: dict[str, Any] = Field(default_factory=dict)


class IncidentRecord(BaseModel):
    incident_id: str
    tower_id: str
    operator: str | None = None
    city: str | None = None
    fault_type: FaultType
    fault_probability: float
    status: IncidentStatus
    opened_at: datetime
    updated_at: datetime
    history: list[IncidentEvent] = Field(default_factory=list)


class IncidentListResponse(BaseModel):
    incidents: list[IncidentRecord]
    count: int


class IncidentActionRequest(BaseModel):
    details: dict[str, Any] = Field(default_factory=dict)
