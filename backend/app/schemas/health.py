"""Pydantic response schemas for health checks."""
from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    service: str
    database: str
    environment: str
