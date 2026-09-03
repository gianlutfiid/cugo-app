"""Customer master endpoints with reusable branch-scoped authorization."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.authz import accessible_branch_ids, ensure_branch_accessible
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.customer import Customer
from app.models.user import User
from app.schemas.customer import CustomerCreate, CustomerOut, CustomerUpdate

router = APIRouter(prefix="/customers", tags=["customers"])


async def _ensure_unique_phone(
    db: AsyncSession, branch_id: uuid.UUID, phone: str | None, customer_id: uuid.UUID | None = None
) -> None:
    if phone is None:
        return
    stmt = select(Customer.id).where(Customer.branch_id == branch_id, Customer.phone == phone)
    if customer_id is not None:
        stmt = stmt.where(Customer.id != customer_id)
    if (await db.execute(stmt)).scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A customer with this phone number already exists in this branch",
        )


@router.get("", response_model=list[CustomerOut])
async def list_customers(
    branch_id: uuid.UUID | None = None,
    q: str | None = Query(default=None, max_length=100),
    include_inactive: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Customer]:
    accessible_ids = await accessible_branch_ids(current_user, db)
    if branch_id is not None:
        await ensure_branch_accessible(branch_id, current_user, db)

    stmt = select(Customer)
    if accessible_ids is not None:
        if not accessible_ids:
            return []
        stmt = stmt.where(Customer.branch_id.in_(accessible_ids))
    if branch_id is not None:
        stmt = stmt.where(Customer.branch_id == branch_id)
    if not include_inactive:
        stmt = stmt.where(Customer.is_active.is_(True))
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(Customer.name.ilike(pattern), Customer.phone.ilike(pattern), Customer.email.ilike(pattern))
        )
    stmt = stmt.order_by(Customer.name, Customer.created_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/{customer_id}", response_model=CustomerOut)
async def get_customer(
    customer_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Customer:
    customer = await db.get(Customer, customer_id)
    if customer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    await ensure_branch_accessible(customer.branch_id, current_user, db)
    return customer


@router.post("", response_model=CustomerOut, status_code=status.HTTP_201_CREATED)
async def create_customer(
    payload: CustomerCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Customer:
    await ensure_branch_accessible(payload.branch_id, current_user, db)
    phone = payload.phone
    await _ensure_unique_phone(db, payload.branch_id, phone)

    customer = Customer(
        branch_id=payload.branch_id,
        name=payload.name,
        phone=phone,
        email=str(payload.email) if payload.email is not None else None,
        address=payload.address,
        notes=payload.notes,
        is_active=True,
    )
    db.add(customer)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A customer with this phone number already exists in this branch",
        )
    await db.refresh(customer)
    return customer


@router.patch("/{customer_id}", response_model=CustomerOut)
async def update_customer(
    customer_id: uuid.UUID,
    payload: CustomerUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Customer:
    customer = await db.get(Customer, customer_id)
    if customer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    await ensure_branch_accessible(customer.branch_id, current_user, db)

    update_data = payload.model_dump(exclude_unset=True)
    if "phone" in update_data:
        await _ensure_unique_phone(db, customer.branch_id, update_data["phone"], customer_id)
    if "email" in update_data and update_data["email"] is not None:
        update_data["email"] = str(update_data["email"])

    for field, value in update_data.items():
        setattr(customer, field, value)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A customer with this phone number already exists in this branch",
        )
    await db.refresh(customer)
    return customer
