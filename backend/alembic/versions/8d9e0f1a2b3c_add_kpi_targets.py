"""add KPI targets

Revision ID: 8d9e0f1a2b3c
Revises: 7c8d9e0f1a2b
Create Date: 2026-09-04
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "8d9e0f1a2b3c"
down_revision = "7c8d9e0f1a2b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "kpi_targets",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("branch_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("stage", sa.String(length=30), nullable=False),
        sa.Column("unit", sa.String(length=20), nullable=False),
        sa.Column("daily_target", sa.Numeric(12, 2), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("branch_id", "stage", "unit", name="uq_kpi_target_branch_stage_unit"),
    )
    op.create_index("ix_kpi_targets_branch_id", "kpi_targets", ["branch_id"])


def downgrade() -> None:
    op.drop_index("ix_kpi_targets_branch_id", table_name="kpi_targets")
    op.drop_table("kpi_targets")
