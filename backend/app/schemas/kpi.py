"""Schemas for production KPI reporting."""
import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

STAGES = ("washing", "ironing", "folding", "packing")


class KpiTargetCreate(BaseModel):
    branch_id: uuid.UUID
    stage: str
    unit: str = Field(min_length=1, max_length=20)
    daily_target: float = Field(gt=0)

    @field_validator("stage")
    @classmethod
    def validate_stage(cls, value: str) -> str:
        value = value.strip().lower()
        if value not in STAGES:
            raise ValueError("Invalid production stage")
        return value

    @field_validator("unit")
    @classmethod
    def normalize_unit(cls, value: str) -> str:
        value = value.strip().lower()
        if not value:
            raise ValueError("Unit cannot be blank")
        return value


class KpiTargetUpdate(BaseModel):
    daily_target: float | None = Field(default=None, gt=0)
    is_active: bool | None = None


class KpiTargetOut(BaseModel):
    id: uuid.UUID
    branch_id: uuid.UUID
    stage: str
    unit: str
    daily_target: float
    is_active: bool
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ProductionKpiSummary(BaseModel):
    period_start: date
    period_end: date
    completed_jobs: int
    active_jobs: int
    total_duration_minutes: int
    average_duration_minutes: float
    employees_count: int
    quantity_by_unit: dict[str, float] = Field(default_factory=dict)


class ProductionKpiEmployee(BaseModel):
    user_id: uuid.UUID
    employee_name: str
    completed_jobs: int
    active_jobs: int
    total_duration_minutes: int
    average_duration_minutes: float
    active_days: int
    quantity_by_unit: dict[str, float] = Field(default_factory=dict)
    by_stage: dict[str, int] = Field(default_factory=dict)
    quantity_by_stage: dict[str, dict[str, float]] = Field(default_factory=dict)
    target_by_stage: dict[str, dict[str, float]] = Field(default_factory=dict)
    achievement_by_stage: dict[str, dict[str, float]] = Field(default_factory=dict)


class ProductionKpiOut(BaseModel):
    summary: ProductionKpiSummary
    employees: list[ProductionKpiEmployee]
