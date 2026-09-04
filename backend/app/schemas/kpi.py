"""Schemas for production KPI reporting."""
import uuid
from datetime import date

from pydantic import BaseModel, Field


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
