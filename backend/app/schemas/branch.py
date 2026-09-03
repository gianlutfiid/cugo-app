"""Branch response schema."""
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class BranchOut(BaseModel):
    id: uuid.UUID
    name: str
    code: str
    is_active: bool
    address: str | None
    phone: str | None
    timezone: str
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)
