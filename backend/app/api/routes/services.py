"""Service category and service master endpoints."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.authz import accessible_branch_ids, ensure_branch_accessible, ensure_branch_manager
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.service import Service
from app.models.service_category import ServiceCategory
from app.models.user import User
from app.schemas.service import (
    ServiceCategoryCreate,
    ServiceCategoryOut,
    ServiceCategoryUpdate,
    ServiceCreate,
    ServiceOut,
    ServiceUpdate,
)

router = APIRouter(prefix="/services", tags=["services"])


async def _category_for_branch(
    db: AsyncSession, category_id: uuid.UUID, branch_id: uuid.UUID
) -> ServiceCategory:
    category = await db.get(ServiceCategory, category_id)
    if category is None or category.branch_id != branch_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Category does not belong to this branch")
    return category


def _service_out(service: Service) -> ServiceOut:
    return ServiceOut(
        id=service.id,
        branch_id=service.branch_id,
        category_id=service.category_id,
        category_name=service.category.name,
        category_code=service.category.code,
        name=service.name,
        code=service.code,
        unit=service.unit,
        price=service.price,
        is_active=service.is_active,
        created_at=service.created_at,
        updated_at=service.updated_at,
    )


@router.get("/categories", response_model=list[ServiceCategoryOut])
async def list_categories(
    branch_id: uuid.UUID | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ServiceCategory]:
    accessible_ids = await accessible_branch_ids(current_user, db)
    if branch_id is not None:
        await ensure_branch_accessible(branch_id, current_user, db)

    stmt = select(ServiceCategory).order_by(ServiceCategory.name)
    if accessible_ids is not None:
        if not accessible_ids:
            return []
        stmt = stmt.where(ServiceCategory.branch_id.in_(accessible_ids))
    if branch_id is not None:
        stmt = stmt.where(ServiceCategory.branch_id == branch_id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.post("/categories", response_model=ServiceCategoryOut, status_code=status.HTTP_201_CREATED)
async def create_category(
    payload: ServiceCategoryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ServiceCategory:
    await ensure_branch_manager(payload.branch_id, current_user, db)
    category = ServiceCategory(
        branch_id=payload.branch_id,
        name=payload.name,
        code=payload.code.upper(),
        is_active=True,
    )
    db.add(category)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Category name or code already exists in this branch")
    await db.refresh(category)
    return category


@router.patch("/categories/{category_id}", response_model=ServiceCategoryOut)
async def update_category(
    category_id: uuid.UUID,
    payload: ServiceCategoryUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ServiceCategory:
    category = await db.get(ServiceCategory, category_id)
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    await ensure_branch_manager(category.branch_id, current_user, db)

    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(category, field, value)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Category name or code already exists in this branch")
    await db.refresh(category)
    return category


@router.get("", response_model=list[ServiceOut])
async def list_services(
    branch_id: uuid.UUID | None = None,
    category_id: uuid.UUID | None = None,
    include_inactive: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ServiceOut]:
    accessible_ids = await accessible_branch_ids(current_user, db)
    if branch_id is not None:
        await ensure_branch_accessible(branch_id, current_user, db)
    if category_id is not None:
        category = await db.get(ServiceCategory, category_id)
        if category is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
        await ensure_branch_accessible(category.branch_id, current_user, db)
        if branch_id is not None and category.branch_id != branch_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Category does not belong to selected branch")

    stmt = (
        select(Service)
        .options(selectinload(Service.category))
        .order_by(Service.category_id, Service.name)
    )
    if accessible_ids is not None:
        if not accessible_ids:
            return []
        stmt = stmt.where(Service.branch_id.in_(accessible_ids))
    if branch_id is not None:
        stmt = stmt.where(Service.branch_id == branch_id)
    if category_id is not None:
        stmt = stmt.where(Service.category_id == category_id)
    if not include_inactive:
        stmt = stmt.where(Service.is_active.is_(True))
    result = await db.execute(stmt)
    return [_service_out(s) for s in result.scalars().all()]


@router.post("", response_model=ServiceOut, status_code=status.HTTP_201_CREATED)
async def create_service(
    payload: ServiceCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ServiceOut:
    await ensure_branch_manager(payload.branch_id, current_user, db)
    category = await _category_for_branch(db, payload.category_id, payload.branch_id)
    if not category.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot create a service under an inactive category")

    service = Service(
        branch_id=payload.branch_id,
        category_id=category.id,
        name=payload.name,
        code=payload.code.upper(),
        unit=payload.unit,
        price=payload.price,
        is_active=True,
    )
    db.add(service)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Service name or code already exists in this branch")
    result = await db.execute(
        select(Service).options(selectinload(Service.category)).where(Service.id == service.id)
    )
    return _service_out(result.scalar_one())


@router.patch("/{service_id}", response_model=ServiceOut)
async def update_service(
    service_id: uuid.UUID,
    payload: ServiceUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ServiceOut:
    service = await db.get(Service, service_id)
    if service is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
    await ensure_branch_manager(service.branch_id, current_user, db)

    data = payload.model_dump(exclude_unset=True)
    if "category_id" in data:
        category = await _category_for_branch(db, data["category_id"], service.branch_id)
        if not category.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot move a service into an inactive category")
    if "code" in data:
        data["code"] = data["code"].upper()
    for field, value in data.items():
        setattr(service, field, value)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Service name or code already exists in this branch")
    result = await db.execute(
        select(Service).options(selectinload(Service.category)).where(Service.id == service.id)
    )
    return _service_out(result.scalar_one())
