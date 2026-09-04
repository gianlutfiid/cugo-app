"""Schemas for service categories and laundry services."""
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

PRODUCTION_STAGES = ("washing", "ironing", "folding", "packing")


class ServiceCategoryCreate(BaseModel):
    branch_id: uuid.UUID
    name: str = Field(min_length=1, max_length=80)
    code: str = Field(min_length=1, max_length=30)

    @field_validator("name", "code")
    @classmethod
    def normalize(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Field cannot be blank")
        return value

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return value.strip().upper()


class ServiceCategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    code: str | None = Field(default=None, min_length=1, max_length=30)
    is_active: bool | None = None

    @field_validator("name", "code")
    @classmethod
    def normalize(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("Field cannot be blank")
        return value

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str | None) -> str | None:
        return value.upper() if value is not None else None


class ServiceCategoryOut(BaseModel):
    id: uuid.UUID
    branch_id: uuid.UUID
    name: str
    code: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ServiceCreate(BaseModel):
    branch_id: uuid.UUID
    category_id: uuid.UUID
    name: str = Field(min_length=1, max_length=120)
    code: str = Field(min_length=1, max_length=30)
    unit: str = Field(min_length=1, max_length=20)
    price: int = Field(ge=0)
    production_stages: list[str] = Field(default_factory=lambda: list(PRODUCTION_STAGES), min_length=1)

    @field_validator("name", "code", "unit")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Field cannot be blank")
        return value

    @field_validator("code")
    @classmethod
    def normalize_service_code(cls, value: str) -> str:
        return value.upper()

    @field_validator("production_stages")
    @classmethod
    def validate_stages(cls, value: list[str]) -> list[str]:
        normalized = list(dict.fromkeys(stage.strip().lower() for stage in value))
        if not normalized or any(stage not in PRODUCTION_STAGES for stage in normalized):
            raise ValueError("Production stages must be one or more of washing, ironing, folding, packing")
        return normalized


class ServiceUpdate(BaseModel):
    category_id: uuid.UUID | None = None
    name: str | None = Field(default=None, min_length=1, max_length=120)
    code: str | None = Field(default=None, min_length=1, max_length=30)
    unit: str | None = Field(default=None, min_length=1, max_length=20)
    price: int | None = Field(default=None, ge=0)
    production_stages: list[str] | None = None
    is_active: bool | None = None

    @field_validator("name", "code", "unit")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("Field cannot be blank")
        return value

    @field_validator("code")
    @classmethod
    def normalize_optional_code(cls, value: str | None) -> str | None:
        return value.upper() if value is not None else None

    @field_validator("production_stages")
    @classmethod
    def validate_optional_stages(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        normalized = list(dict.fromkeys(stage.strip().lower() for stage in value))
        if not normalized or any(stage not in PRODUCTION_STAGES for stage in normalized):
            raise ValueError("Production stages must be one or more of washing, ironing, folding, packing")
        return normalized


class ServiceOut(BaseModel):
    id: uuid.UUID
    branch_id: uuid.UUID
    category_id: uuid.UUID
    category_name: str
    category_code: str
    name: str
    code: str
    unit: str
    price: int
    production_stages: list[str] = Field(default_factory=list)
    is_active: bool
    created_at: datetime
    updated_at: datetime
