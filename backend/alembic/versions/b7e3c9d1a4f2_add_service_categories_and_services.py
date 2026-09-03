"""create service categories and services

Revision ID: b7e3c9d1a4f2
Revises: 9d7b2c4e1f6a
Create Date: 2026-09-03
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "b7e3c9d1a4f2"
down_revision: Union[str, None] = "9d7b2c4e1f6a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "service_categories",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("branch_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("code", sa.String(length=30), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("branch_id", "code", name="uq_service_category_branch_code"),
        sa.UniqueConstraint("branch_id", "name", name="uq_service_category_branch_name"),
    )
    op.create_index(op.f("ix_service_categories_branch_id"), "service_categories", ["branch_id"], unique=False)

    op.create_table(
        "services",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("branch_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("code", sa.String(length=30), nullable=False),
        sa.Column("unit", sa.String(length=20), nullable=False),
        sa.Column("price", sa.BigInteger(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["category_id"], ["service_categories.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("branch_id", "code", name="uq_service_branch_code"),
        sa.UniqueConstraint("branch_id", "name", name="uq_service_branch_name"),
    )
    op.create_index(op.f("ix_services_branch_id"), "services", ["branch_id"], unique=False)
    op.create_index(op.f("ix_services_category_id"), "services", ["category_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_services_category_id"), table_name="services")
    op.drop_index(op.f("ix_services_branch_id"), table_name="services")
    op.drop_table("services")
    op.drop_index(op.f("ix_service_categories_branch_id"), table_name="service_categories")
    op.drop_table("service_categories")
