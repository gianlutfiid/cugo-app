"""Laundry services and branch-specific pricing."""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.branch import Branch
    from app.models.service_category import ServiceCategory


class Service(Base, TimestampMixin):
    __tablename__ = "services"
    __table_args__ = (
        UniqueConstraint("branch_id", "code", name="uq_service_branch_code"),
        UniqueConstraint("branch_id", "name", name="uq_service_branch_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    branch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("branches.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("service_categories.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    code: Mapped[str] = mapped_column(String(30), nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    price: Mapped[int] = mapped_column(BigInteger, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    branch: Mapped["Branch"] = relationship()
    category: Mapped["ServiceCategory"] = relationship(back_populates="services")
