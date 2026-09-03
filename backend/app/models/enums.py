"""Role definitions for the CUGO multi-branch system.

Roles are intentionally kept as simple string values (validated at the app layer
and constrained at the DB layer with a CHECK constraint) rather than a native
PostgreSQL ENUM, so that additional roles/permissions can be added later with
clean, reversible migrations.

- super_admin  : platform-wide access; represented by `User.is_superadmin`
                 (does NOT require a branch membership).
- branch_admin : scoped to the branches they are a member of.
- staff        : scoped to the branches they are a member of.
"""
from enum import Enum


class MembershipRole(str, Enum):
    """Roles that can be assigned to a user within a specific branch."""

    branch_admin = "branch_admin"
    staff = "staff"


class SystemRole(str, Enum):
    """Full set of roles recognised across the system."""

    super_admin = "super_admin"
    branch_admin = "branch_admin"
    staff = "staff"
