"""Branch endpoints — read access by membership, writes by super_admin."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.authz import accessible_branch_ids, ensure_branch_accessible
from app.core.database import get_db
from app.core.deps import get_current_user, require_super_admin
from app.models.branch import Branch
from app.models.kpi_target import KpiTarget
from app.models.user import User
from app.schemas.branch import BranchCreate, BranchOut, BranchUpdate

router = APIRouter(prefix="/branches", tags=["branches"])


@router.get("", response_model=list[BranchOut])
async def list_branches(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[Branch]:
    stmt = select(Branch)
    if not current_user.is_superadmin:
        ids = await accessible_branch_ids(current_user, db)
        if not ids: return []
        stmt = stmt.where(Branch.id.in_(ids), Branch.is_active.is_(True))
    stmt = stmt.order_by(Branch.name)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/{branch_id}", response_model=BranchOut)
async def get_branch(branch_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> Branch:
    return await ensure_branch_accessible(branch_id, current_user, db)


@router.post("", response_model=BranchOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_super_admin)])
async def create_branch(payload: BranchCreate, db: AsyncSession = Depends(get_db)) -> Branch:
    code = payload.code.strip().upper()
    existing = await db.execute(select(Branch.id).where(Branch.code == code))
    if existing.scalar_one_or_none() is not None: raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A branch with this code already exists")
    branch = Branch(name=payload.name.strip(), code=code, is_active=True, address=payload.address, phone=payload.phone, timezone=payload.timezone)
    db.add(branch)
    await db.flush()
    db.add(KpiTarget(branch_id=branch.id, stage="ironing", unit="kg", daily_target=50, is_active=True))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A branch with this code already exists")
    await db.refresh(branch)
    return branch


@router.patch("/{branch_id}", response_model=BranchOut, dependencies=[Depends(require_super_admin)])
async def update_branch(branch_id: uuid.UUID, payload: BranchUpdate, db: AsyncSession = Depends(get_db)) -> Branch:
    branch = await db.get(Branch, branch_id)
    if branch is None: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found")
    if payload.name is not None: branch.name = payload.name
    if payload.address is not None: branch.address = payload.address
    if payload.phone is not None: branch.phone = payload.phone
    if payload.timezone is not None: branch.timezone = payload.timezone
    if payload.is_active is not None: branch.is_active = payload.is_active
    await db.commit(); await db.refresh(branch)
    return branch
