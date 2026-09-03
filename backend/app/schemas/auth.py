"""Auth request/response schemas. Never expose password hashes or tokens."""
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class MembershipOut(BaseModel):
    branch_id: uuid.UUID
    role: str
    model_config = ConfigDict(from_attributes=True)


class UserOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str | None
    is_superadmin: bool
    is_active: bool
    last_login: datetime | None
    memberships: list[MembershipOut]
    model_config = ConfigDict(from_attributes=True)


class MessageResponse(BaseModel):
    message: str
