"""Admin user-management schemas (super_admin only).

Roles here are restricted to branch_admin / staff — super_admin cannot be
created or assigned through this API (prevents privilege escalation).
"""
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr

from app.models.enums import MembershipRole


class MembershipInput(BaseModel):
    branch_id: uuid.UUID
    role: MembershipRole


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str | None = None
    memberships: list[MembershipInput] = []


class UserUpdate(BaseModel):
    full_name: str | None = None
    is_active: bool | None = None


class MembershipDetail(BaseModel):
    branch_id: uuid.UUID
    branch_code: str
    branch_name: str
    role: str
    model_config = ConfigDict(from_attributes=True)


class AdminUserOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str | None
    is_superadmin: bool
    is_active: bool
    last_login: datetime | None
    created_at: datetime
    memberships: list[MembershipDetail]
    model_config = ConfigDict(from_attributes=True)


class UserCreatedOut(BaseModel):
    user: AdminUserOut
    initial_password: str


class PasswordResetOut(BaseModel):
    initial_password: str
