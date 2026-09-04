"""add production jobs

Revision ID: f1a2b3c4d5e6
Revises: d5e2f9a6c1b4
Create Date: 2026-09-04
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "f1a2b3c4d5e6"
down_revision = "d5e2f9a6c1b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "production_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("branch_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("stage", sa.String(length=30), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("assigned_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["assigned_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("order_id", "stage", name="uq_production_jobs_order_stage"),
    )
    op.create_index("ix_production_jobs_order_id", "production_jobs", ["order_id"])
    op.create_index("ix_production_jobs_branch_id", "production_jobs", ["branch_id"])
    op.create_index("ix_production_jobs_stage", "production_jobs", ["stage"])
    op.create_index("ix_production_jobs_status", "production_jobs", ["status"])
    op.create_index("ix_production_jobs_assigned_user_id", "production_jobs", ["assigned_user_id"])


def downgrade() -> None:
    op.drop_index("ix_production_jobs_assigned_user_id", table_name="production_jobs")
    op.drop_index("ix_production_jobs_status", table_name="production_jobs")
    op.drop_index("ix_production_jobs_stage", table_name="production_jobs")
    op.drop_index("ix_production_jobs_branch_id", table_name="production_jobs")
    op.drop_index("ix_production_jobs_order_id", table_name="production_jobs")
    op.drop_table("production_jobs")
