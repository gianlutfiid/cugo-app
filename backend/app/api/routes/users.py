"""Super-admin user management: create/list/edit users, manage branch
memberships, activate/deactivate, and reset passwords.

All endpoints require super_admin. Mutations targeting a super_admin account are
rejected. Roles are limited to branch_admin / staff (no privilege escalation).
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import require_super_admin
from app.core.security import generate_password, hash_password
from app.models.branch import Branch
from app.models.membership import BranchMembership
from app.models.user import User
from app.schemas.user import (
    AdminUserOut,
    MembershipDetail,
    MembershipInput,
    PasswordResetOut,
    UserCreate,
    UserCreatedOut,
    UserUpdate,
)

router = APIRouter(
    prefix="/users", tags=["users"], dependencies=[Depends(require_super_admin)]
)


def _serialize(user: User) -> AdminUserOut:
    return AdminUserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_superadmin=user.is_superadmin,
        is_active=user.is_active,
        last_login=user.last_login,
        created_at=user.created_at,
        memberships=[
            MembershipDetail(
                branch_id=m.branch_id,
                branch_code=m.branch.code,
                branch_name=m.branch.name,
                role=m.role,
            )
            for m in user.memberships
        ],
    )


async def _load_full_user(db: AsyncSession, user_id: uuid.UUID) -> User:
    result = await db.execute(
        select(User)
        .options(selectinload(User.memberships).selectinload(BranchMembership.branch))
        .where(User.id == user_id)
    )
    return result.scalar_one()


async def _get_branch_or_400(db: AsyncSession, branch_id: uuid.UUID) -> Branch:
    branch = await db.get(Branch, branch_id)
    if branch is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"Branch not found: {branch_id}"
        )
    return branch


async def _get_manageable_user(db: AsyncSession, user_id: uuid.UUID) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.is_superadmin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin accounts cannot be managed here",
        )
    return user


@router.get("", response_model=list[AdminUserOut])
async def list_users(db: AsyncSession = Depends(get_db)) -> list[AdminUserOut]:
    result = await db.execute(
        select(User)
        .options(selectinload(User.memberships).selectinload(BranchMembership.branch))
        .order_by(User.created_at)
    )
    return [_serialize(u) for u in result.scalars().all()]


@router.post("", response_model=UserCreatedOut, status_code=status.HTTP_201_CREATED)
async def create_user(payload: UserCreate, db: AsyncSession = Depends(get_db)) -> UserCreatedOut:
    email = payload.email.lower().strip()

    existing = await db.execute(select(User.id).where(User.email == email))
    if existing.first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="A user with this email already exists"
        )

    seen: dict[uuid.UUID, str] = {}
    for m in payload.memberships:
        await _get_branch_or_400(db, m.branch_id)
        seen[m.branch_id] = m.role.value

    initial_password = generate_password()
    user = User(
        email=email,
        hashed_password=hash_password(initial_password),
        full_name=payload.full_name,
        is_superadmin=False,
        is_active=True,
    )
    db.add(user)
    await db.flush()

    for branch_id, role in seen.items():
        db.add(BranchMembership(user_id=user.id, branch_id=branch_id, role=role))

    await db.commit()
    full = await _load_full_user(db, user.id)
    return UserCreatedOut(user=_serialize(full), initial_password=initial_password)


@router.get("/{user_id}", response_model=AdminUserOut)
async def get_user(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> AdminUserOut:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return _serialize(await _load_full_user(db, user_id))


@router.patch("/{user_id}", response_model=AdminUserOut)
async def update_user(
    user_id: uuid.UUID, payload: UserUpdate, db: AsyncSession = Depends(get_db)
) -> AdminUserOut:
    user = await _get_manageable_user(db, user_id)
    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.is_active is not None:
        user.is_active = payload.is_active
    await db.commit()
    return _serialize(await _load_full_user(db, user_id))


@router.post("/{user_id}/memberships", response_model=AdminUserOut)
async def upsert_membership(
    user_id: uuid.UUID, payload: MembershipInput, db: AsyncSession = Depends(get_db)
) -> AdminUserOut:
    await _get_manageable_user(db, user_id)
    await _get_branch_or_400(db, payload.branch_id)

    result = await db.execute(
        select(BranchMembership).where(
            BranchMembership.user_id == user_id,
            BranchMembership.branch_id == payload.branch_id,
        )
    )
    membership = result.scalar_one_or_none()
    if membership is None:
        db.add(
            BranchMembership(
                user_id=user_id, branch_id=payload.branch_id, role=payload.role.value
            )
        )
    else:
        membership.role = payload.role.value
    await db.commit()
    return _serialize(await _load_full_user(db, user_id))


@router.delete("/{user_id}/memberships/{branch_id}", response_model=AdminUserOut)
async def remove_membership(
    user_id: uuid.UUID, branch_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> AdminUserOut:
    await _get_manageable_user(db, user_id)
    result = await db.execute(
        select(BranchMembership).where(
            BranchMembership.user_id == user_id, BranchMembership.branch_id == branch_id
        )
    )
    membership = result.scalar_one_or_none()
    if membership is not None:
        await db.delete(membership)
        await db.commit()
    return _serialize(await _load_full_user(db, user_id))


@router.post("/{user_id}/reset-password", response_model=PasswordResetOut)
async def reset_password(
    user_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> PasswordResetOut:
    user = await _get_manageable_user(db, user_id)
    new_password = generate_password()
    user.hashed_password = hash_password(new_password)
    await db.commit()
    return PasswordResetOut(initial_password=new_password)
