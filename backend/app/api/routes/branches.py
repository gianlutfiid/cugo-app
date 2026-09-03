"""Branch read endpoints — enforce per-branch data isolation."""
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.authz import accessible_branch_ids, ensure_branch_accessible
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.branch import Branch
from app.models.user import User
from app.schemas.branch import BranchOut

router = APIRouter(prefix="/branches", tags=["branches"])


@router.get("", response_model=list[BranchOut])
async def list_branches(
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> list[Branch]:
    stmt = select(Branch)

    if not current_user.is_superadmin:
        ids = await accessible_branch_ids(current_user, db)
        if not ids:
            return []
        stmt = stmt.where(Branch.id.in_(ids), Branch.is_active.is_(True))

    stmt = stmt.order_by(Branch.name)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/{branch_id}", response_model=BranchOut)
async def get_branch(
    branch_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Branch:
    return await ensure_branch_accessible(branch_id, current_user, db)
