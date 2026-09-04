"""Production queue and job lifecycle endpoints."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.authz import accessible_branch_ids, ensure_branch_accessible
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.order import Order
from app.models.order_status_log import OrderStatusLog
from app.models.production_job import ProductionJob
from app.models.user import User
from app.schemas.production import ProductionJobNoteUpdate, ProductionJobOut

router = APIRouter(prefix="/production", tags=["production"])

STAGES = ("washing", "ironing", "folding", "packing")
NEXT_STAGE = {
    "washing": "ironing",
    "ironing": "folding",
    "folding": "packing",
    "packing": "completed",
}


async def _load_job(db: AsyncSession, job_id: uuid.UUID) -> ProductionJob:
    result = await db.execute(
        select(ProductionJob)
        .options(
            selectinload(ProductionJob.order).selectinload(Order.customer),
            selectinload(ProductionJob.assigned_user),
        )
        .where(ProductionJob.id == job_id)
    )
    job = result.scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Production job not found")
    return job


def _out(job: ProductionJob) -> ProductionJobOut:
    return ProductionJobOut(
        id=job.id, order_id=job.order_id, branch_id=job.branch_id,
        invoice_number=job.order.invoice_number,
        customer_name=job.order.customer.name,
        stage=job.stage, status=job.status,
        assigned_user_id=job.assigned_user_id,
        assigned_user_name=job.assigned_user.full_name if job.assigned_user else None,
        started_at=job.started_at, completed_at=job.completed_at, notes=job.notes,
    )


@router.get("/queue", response_model=list[ProductionJobOut])
async def queue(
    stage: str = Query(...),
    branch_id: uuid.UUID | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ProductionJobOut]:
    if stage not in STAGES:
        raise HTTPException(status_code=400, detail="Invalid production stage")
    accessible = await accessible_branch_ids(current_user, db)
    if branch_id is not None:
        await ensure_branch_accessible(branch_id, current_user, db)

    stmt = (
        select(ProductionJob)
        .options(
            selectinload(ProductionJob.order).selectinload(Order.customer),
            selectinload(ProductionJob.assigned_user),
        )
        .where(ProductionJob.stage == stage, ProductionJob.status != "completed")
        .order_by(ProductionJob.order_id)
    )
    if accessible is not None:
        if not accessible:
            return []
        stmt = stmt.where(ProductionJob.branch_id.in_(accessible))
    if branch_id is not None:
        stmt = stmt.where(ProductionJob.branch_id == branch_id)
    result = await db.execute(stmt)
    return [_out(job) for job in result.scalars().all()]


@router.post("/orders/{order_id}/jobs/{stage}", response_model=ProductionJobOut, status_code=status.HTTP_201_CREATED)
async def create_stage_job(
    order_id: uuid.UUID,
    stage: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProductionJobOut:
    if stage not in STAGES:
        raise HTTPException(status_code=400, detail="Invalid production stage")
    result = await db.execute(select(Order).options(selectinload(Order.customer)).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    await ensure_branch_accessible(order.branch_id, current_user, db)
    if order.status != stage:
        raise HTTPException(status_code=400, detail="Order must be at the matching production stage")
    existing = await db.execute(
        select(ProductionJob.id).where(ProductionJob.order_id == order_id, ProductionJob.stage == stage)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Production job already exists for this stage")
    job = ProductionJob(order_id=order.id, branch_id=order.branch_id, stage=stage, status="pending")
    db.add(job)
    await db.commit()
    return _out(await _load_job(db, job.id))


@router.post("/jobs/{job_id}/claim", response_model=ProductionJobOut)
async def claim_job(
    job_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProductionJobOut:
    job = await _load_job(db, job_id)
    await ensure_branch_accessible(job.branch_id, current_user, db)
    if job.status != "pending" or job.assigned_user_id is not None:
        raise HTTPException(status_code=409, detail="Production job is no longer available")
    job.assigned_user_id = current_user.id
    await db.commit()
    return _out(await _load_job(db, job.id))


@router.post("/jobs/{job_id}/start", response_model=ProductionJobOut)
async def start_job(
    job_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProductionJobOut:
    job = await _load_job(db, job_id)
    await ensure_branch_accessible(job.branch_id, current_user, db)
    if job.assigned_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the assigned worker can start this job")
    if job.status != "pending":
        raise HTTPException(status_code=409, detail="Production job cannot be started")
    job.status = "in_progress"
    job.started_at = datetime.now(timezone.utc)
    await db.commit()
    return _out(await _load_job(db, job.id))


@router.post("/jobs/{job_id}/complete", response_model=ProductionJobOut)
async def complete_job(
    job_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProductionJobOut:
    job = await _load_job(db, job_id)
    await ensure_branch_accessible(job.branch_id, current_user, db)
    if job.assigned_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the assigned worker can complete this job")
    if job.status != "in_progress":
        raise HTTPException(status_code=409, detail="Production job must be in progress")

    order = job.order
    if order.status != job.stage:
        raise HTTPException(status_code=409, detail="Order status no longer matches this job")
    next_status = NEXT_STAGE[job.stage]
    old_status = order.status
    now = datetime.now(timezone.utc)

    job.status = "completed"
    job.completed_at = now
    order.status = next_status
    db.add(OrderStatusLog(
        order_id=order.id, branch_id=order.branch_id,
        from_status=old_status, to_status=next_status,
        changed_by_user_id=current_user.id, changed_at=now,
        note=f"Production stage {job.stage} completed",
    ))
    await db.commit()
    return _out(await _load_job(db, job.id))


@router.patch("/jobs/{job_id}/notes", response_model=ProductionJobOut)
async def update_job_notes(
    job_id: uuid.UUID,
    payload: ProductionJobNoteUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProductionJobOut:
    job = await _load_job(db, job_id)
    await ensure_branch_accessible(job.branch_id, current_user, db)
    if job.status == "completed":
        raise HTTPException(status_code=400, detail="Completed job cannot be edited")
    if job.assigned_user_id not in {None, current_user.id} and not current_user.is_superadmin:
        raise HTTPException(status_code=403, detail="Only the assigned worker can edit job notes")
    job.notes = payload.notes
    await db.commit()
    return _out(await _load_job(db, job.id))
