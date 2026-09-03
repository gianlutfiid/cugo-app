"""SQLAlchemy models.

Import all models here so Alembic autogenerate can discover them.
"""
from app.models.base import Base
from app.models.branch import Branch

__all__ = ["Base", "Branch"]
