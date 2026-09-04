"""Schemas for production KPI reporting."""
import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


class ProductionKpiSummary(BaseModel):
    period_start: date
    period_end: date
    completed_jobs: int
    active_jobs: int
    total_duration_minutes: int
    average_duration_minutes: float
    employees_count: int


class ProductionKpiEmployee(BaseModel):
    user_id: uuid.UUID
    employee_name: str
    completed_jobs: int
    active_jobs: int
    total_duration_minutes: int
    average_duration_minutes: float
    by_stage: dict[str, int] = Field(default_factory=dict)


class ProductionKpiOut(BaseModel):
    summary: ProductionKpiSummary
    employees: list[ProductionKpiEmployee]
