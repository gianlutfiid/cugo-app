"""DEVELOPMENT / TEST SEED DATA — NOT PRODUCTION DATA.

Creates a few sample branches and test users (branch_admin + staff) so the
per-branch isolation rules can be verified. This is a manual dev tool; it is
NOT run on application startup and must never be used with real CUGO data.

Run from /app/backend:
    /root/.venv/bin/python scripts/seed_dev_data.py

Idempotent: re-running updates existing rows instead of duplicating them.
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select  # noqa: E402

from app.core.database import AsyncSessionLocal  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models.branch import Branch  # noqa: E402
from app.models.membership import BranchMembership  # noqa: E402
from app.models.user import User  # noqa: E402

TEST_PASSWORD = "TestPass#123"

BRANCHES = [
    {"name": "CUGO Jakarta Pusat", "code": "JKT-01", "is_active": True, "phone": "+62211111111"},
    {"name": "CUGO Bandung", "code": "BDG-01", "is_active": True, "phone": "+62222222222"},
    {"name": "CUGO Surabaya (Closed)", "code": "SBY-01", "is_active": False, "phone": "+62313333333"},
]


async def _get_or_create_branch(db, data: dict) -> Branch:
    result = await db.execute(select(Branch).where(Branch.code == data["code"]))
    branch = result.scalar_one_or_none()
    if branch is None:
        branch = Branch(**data)
        db.add(branch)
        await db.flush()
    else:
        branch.name = data["name"]
        branch.is_active = data["is_active"]
        branch.phone = data["phone"]
    return branch


async def _get_or_create_user(db, email: str, full_name: str) -> User:
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(
            email=email,
            hashed_password=hash_password(TEST_PASSWORD),
            full_name=full_name,
            is_superadmin=False,
            is_active=True,
        )
        db.add(user)
        await db.flush()
    else:
        user.hashed_password = hash_password(TEST_PASSWORD)
        user.is_active = True
    return user


async def _ensure_membership(db, user: User, branch: Branch, role: str) -> None:
    result = await db.execute(
        select(BranchMembership).where(
            BranchMembership.user_id == user.id, BranchMembership.branch_id == branch.id
        )
    )
    membership = result.scalar_one_or_none()
    if membership is None:
        db.add(BranchMembership(user_id=user.id, branch_id=branch.id, role=role))
    else:
        membership.role = role


async def main() -> None:
    async with AsyncSessionLocal() as db:
        jkt = await _get_or_create_branch(db, BRANCHES[0])
        bdg = await _get_or_create_branch(db, BRANCHES[1])
        sby = await _get_or_create_branch(db, BRANCHES[2])  # inactive

        # branch_admin: assigned to an ACTIVE branch (JKT) and an INACTIVE one (SBY)
        manager = await _get_or_create_user(db, "manager@cugo.app", "Branch Manager")
        await _ensure_membership(db, manager, jkt, "branch_admin")
        await _ensure_membership(db, manager, sby, "branch_admin")

        # staff: assigned to an ACTIVE branch (BDG) and an INACTIVE one (SBY)
        staff = await _get_or_create_user(db, "staff@cugo.app", "Branch Staff")
        await _ensure_membership(db, staff, bdg, "staff")
        await _ensure_membership(db, staff, sby, "staff")

        await db.commit()

    print("Dev seed complete:")
    print("  Branches: JKT-01 (active), BDG-01 (active), SBY-01 (inactive)")
    print(f"  manager@cugo.app / {TEST_PASSWORD}  -> branch_admin @ JKT-01 (active), SBY-01 (inactive)")
    print(f"  staff@cugo.app   / {TEST_PASSWORD}  -> staff @ BDG-01 (active), SBY-01 (inactive)")


if __name__ == "__main__":
    asyncio.run(main())
