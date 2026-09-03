"""Reusable branch-scoping authorization layer.

Access rules (read):
- super_admin       -> all branches (active + inactive).
- branch_admin/staff -> only their assigned ACTIVE branches.

Write access for branch-scoped master data:
- super_admin       -> any branch.
- branch_admin      -> assigned ACTIVE branches.
- staff             -> read only.

Operational transactions use a separate helper because staff may create and
process customer orders without receiving master-data write access.
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
    """Return the branch if the user may access it, else raise 404."""
    branch = await db.get(Branch, branch_id)

    if branch is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found")

    if user.is_superadmin:
        return branch

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


async def ensure_branch_manager(
    branch_id: uuid.UUID, user: User, db: AsyncSession
) -> Branch:
    """Return an accessible ACTIVE branch when the user may manage its master data."""
    branch = await db.get(Branch, branch_id)
    if branch is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found")

    if user.is_superadmin:
        return branch

    if not branch.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found")

    membership = await db.execute(
        select(BranchMembership.role).where(
            BranchMembership.user_id == user.id,
            BranchMembership.branch_id == branch_id,
        )
    )
    role = membership.scalar_one_or_none()
    if role != "branch_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Branch manager access required",
        )

    return branch


async def ensure_transaction_editor(
    branch_id: uuid.UUID, user: User, db: AsyncSession
) -> Branch:
    """Allow operational transaction work for super admins and assigned users.

    Staff can create/update/process transactions because the current role model
    intentionally does not introduce a separate cashier role. Master-data write
    permissions remain protected by ensure_branch_manager().
    """
    return await ensure_branch_accessible(branch_id, user, db)
