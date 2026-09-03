"""add order status logs

Revision ID: d5e2f9a6c1b4
Revises: c4f1a8b7e3d2
Create Date: 2026-09-03
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "d5e2f9a6c1b4"
down_revision: Union[str, None] = "c4f1a8b7e3d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "order_status_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("branch_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("from_status", sa.String(length=30), nullable=True),
        sa.Column("to_status", sa.String(length=30), nullable=False),
        sa.Column("changed_by_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["changed_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_order_status_logs_order_id"), "order_status_logs", ["order_id"], unique=False)
    op.create_index(op.f("ix_order_status_logs_branch_id"), "order_status_logs", ["branch_id"], unique=False)
    op.create_index(op.f("ix_order_status_logs_changed_by_user_id"), "order_status_logs", ["changed_by_user_id"], unique=False)
    op.create_index(op.f("ix_order_status_logs_changed_at"), "order_status_logs", ["changed_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_order_status_logs_changed_at"), table_name="order_status_logs")
    op.drop_index(op.f("ix_order_status_logs_changed_by_user_id"), table_name="order_status_logs")
    op.drop_index(op.f("ix_order_status_logs_branch_id"), table_name="order_status_logs")
    op.drop_index(op.f("ix_order_status_logs_order_id"), table_name="order_status_logs")
    op.drop_table("order_status_logs")
