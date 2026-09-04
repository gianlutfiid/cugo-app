"""add expenses

Revision ID: 9e0f1a2b3c4d
Revises: 8d9e0f1a2b3c
Create Date: 2026-09-04
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "9e0f1a2b3c4d"
down_revision = "8d9e0f1a2b3c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "expenses",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("branch_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("transaction_date", sa.Date(), nullable=False),
        sa.Column("category", sa.String(length=60), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column("amount", sa.BigInteger(), nullable=False),
        sa.Column("payment_method", sa.String(length=30), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_expenses_branch_id", "expenses", ["branch_id"])
    op.create_index("ix_expenses_transaction_date", "expenses", ["transaction_date"])
    op.create_index("ix_expenses_category", "expenses", ["category"])


def downgrade() -> None:
    op.drop_index("ix_expenses_category", table_name="expenses")
    op.drop_index("ix_expenses_transaction_date", table_name="expenses")
    op.drop_index("ix_expenses_branch_id", table_name="expenses")
    op.drop_table("expenses")
