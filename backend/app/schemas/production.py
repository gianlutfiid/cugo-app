"""Schemas for production workflow jobs."""
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


ProductionStage = Literal["washing", "ironing", "folding", "packing"]
ProductionJobStatus = Literal["pending", "in_progress", "completed"]


class ProductionJobOut(BaseModel):
    id: uuid.UUID
    order_id: uuid.UUID
    branch_id: uuid.UUID
    invoice_number: str
    customer_name: str
    stage: ProductionStage
    status: ProductionJobStatus
    assigned_user_id: uuid.UUID | None
    assigned_user_name: str | None
    started_at: datetime | None
    completed_at: datetime | None
    notes: str | None
    model_config = ConfigDict(from_attributes=True)


class ProductionJobNoteUpdate(BaseModel):
    notes: str | None = Field(default=None, max_length=2000)
