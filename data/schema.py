from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


FaultType = Literal["normal", "congestion", "coverage_degradation", "hardware_anomaly"]


class KpiSnapshot(BaseModel):
    tower_id: str
    timestamp: datetime
    rsrp: float = Field(ge=-140, le=-44)
    sinr: float = Field(ge=-23, le=40)
    dl_throughput: float = Field(ge=0, le=1000)
    ul_throughput: float = Field(ge=0, le=200)
    ho_failure_rate: float = Field(ge=0, le=100)
    rtt: float = Field(ge=0, le=500)
    fault_label: int = Field(ge=0, le=3)
    fault_type: FaultType = "normal"


class TowerLocation(BaseModel):
    tower_id: str
    lat: float
    lon: float
    city: str
