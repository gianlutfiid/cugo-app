"""Laundry service categories scoped to a branch."""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.branch import Branch
    from app.models.service import Service


class ServiceCategory(Base, TimestampMixin):
    __tablename__ = "service_categories"
    __table_args__ = (
        UniqueConstraint("branch_id", "code", name="uq_service_category_branch_code"),
        UniqueConstraint("branch_id", "name", name="uq_service_category_branch_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    branch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("branches.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    code: Mapped[str] = mapped_column(String(30), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    branch: Mapped["Branch"] = relationship()
    services: Mapped[list["Service"]] = relationship(
        back_populates="category", cascade="all, delete-orphan"
    )
