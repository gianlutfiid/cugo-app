"""add service production stages

Revision ID: 7c8d9e0f1a2b
Revises: f1a2b3c4d5e6
Create Date: 2026-09-04
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "7c8d9e0f1a2b"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "service_production_stages",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("service_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("stage", sa.String(length=30), nullable=False),
        sa.ForeignKeyConstraint(["service_id"], ["services.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("service_id", "stage", name="uq_service_production_stage"),
    )
    op.create_index("ix_service_production_stages_service_id", "service_production_stages", ["service_id"])

    stages = sa.table(
        "service_production_stages",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("service_id", postgresql.UUID(as_uuid=True)),
        sa.column("stage", sa.String(length=30)),
    )
    services = sa.table("services", sa.column("id", postgresql.UUID(as_uuid=True)))
    conn = op.get_bind()
    service_ids = [row[0] for row in conn.execute(sa.select(services.c.id)).all()]
    rows = [
        {"id": __import__("uuid").uuid4(), "service_id": service_id, "stage": stage}
        for service_id in service_ids
        for stage in ("washing", "ironing", "folding", "packing")
    ]
    if rows:
        conn.execute(stages.insert(), rows)


def downgrade() -> None:
    op.drop_index("ix_service_production_stages_service_id", table_name="service_production_stages")
    op.drop_table("service_production_stages")
