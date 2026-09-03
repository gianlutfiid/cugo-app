"""BranchMembership — many-to-many link between users and branches.

Each membership carries the user's role within that specific branch, enabling
per-branch data isolation to be enforced at the API layer later. A user can be
a member of multiple branches (unique per user+branch).
"""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.branch import Branch
    from app.models.user import User


class BranchMembership(Base, TimestampMixin):
    __tablename__ = "branch_memberships"
    __table_args__ = (
        UniqueConstraint("user_id", "branch_id", name="uq_branch_membership_user_branch"),
        CheckConstraint(
            "role IN ('branch_admin', 'staff')", name="ck_branch_membership_role"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    branch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("branches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)

    user: Mapped["User"] = relationship(back_populates="memberships")
    branch: Mapped["Branch"] = relationship(back_populates="memberships")
