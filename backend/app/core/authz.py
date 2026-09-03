"""Reusable branch-scoping authorization layer.

Access rules (read):
- super_admin       -> all branches (active + inactive).
- branch_admin/staff -> only their assigned ACTIVE branches.

These helpers are resource-agnostic so the same scoping can be reused for any
future branch-scoped resource (orders, customers, etc.). To hide the existence
of branches a user cannot access, unauthorized access raises 404.
"""
import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.branch import Branch
from app.models.membership import BranchMembership
from app.models.user import User


async def accessible_branch_ids(user: User, db: AsyncSession) -> list[uuid.UUID] | None:
    """Branch IDs the user may access.

    Returns None to signal 'unrestricted' (super_admin). For other users, returns
    the IDs of their assigned ACTIVE branches (possibly an empty list).
    """
    if user.is_superadmin:
        return None

    result = await db.execute(
        select(BranchMembership.branch_id)
        .join(Branch, Branch.id == BranchMembership.branch_id)
        .where(BranchMembership.user_id == user.id, Branch.is_active.is_(True))
    )
    return [row[0] for row in result.all()]


async def ensure_branch_accessible(
    branch_id: uuid.UUID, user: User, db: AsyncSession
) -> Branch:
    """Return the branch if the user may access it, else raise 404.

    Reusable guard for any branch-scoped resource: resolve the branch_id (from a
    path/body) through this before returning branch-owned data.
    """
    branch = await db.get(Branch, branch_id)

    if branch is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found")

    if user.is_superadmin:
        return branch

    # For non-super users, an inaccessible branch is indistinguishable from a
    # non-existent one (both 404) to avoid leaking existence.
    if not branch.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found")

    membership = await db.execute(
        select(BranchMembership.id).where(
            BranchMembership.user_id == user.id,
            BranchMembership.branch_id == branch_id,
        )
    )
    if membership.first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found")

    return branch
