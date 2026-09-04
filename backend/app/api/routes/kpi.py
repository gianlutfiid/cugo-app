"""Production KPI reporting based on completed and active production jobs."""
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.authz import accessible_branch_ids, ensure_branch_accessible
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.membership import BranchMembership
from app.models.production_job import ProductionJob
from app.models.user import User
from app.schemas.kpi import ProductionKpiEmployee, ProductionKpiOut, ProductionKpiSummary

router = APIRouter(prefix="/kpi", tags=["kpi"])

STAGES = ("washing", "ironing", "folding", "packing")


def _utc_bounds(start: date, end: date) -> tuple[datetime, datetime]:
    start_dt = datetime.combine(start, time.min, tzinfo=timezone.utc)
    end_dt = datetime.combine(end + timedelta(days=1), time.min, tzinfo=timezone.utc)
    return start_dt, end_dt


@router.get("/production", response_model=ProductionKpiOut)
async def production_kpi(
    start_date: date = Query(...),
    end_date: date = Query(...),
    branch_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProductionKpiOut:
    if end_date < start_date:
        raise HTTPException(status_code=400, detail="End date cannot be before start date")
    if (end_date - start_date).days > 366:
        raise HTTPException(status_code=400, detail="KPI period cannot exceed 366 days")
    if branch_id is not None:
        await ensure_branch_accessible(branch_id, current_user, db)

    accessible = await accessible_branch_ids(current_user, db)
    if accessible is not None and not accessible:
        empty = ProductionKpiSummary(
            period_start=start_date, period_end=end_date, completed_jobs=0,
            active_jobs=0, total_duration_minutes=0, average_duration_minutes=0.0,
            employees_count=0,
        )
        return ProductionKpiOut(summary=empty, employees=[])

    start_dt, end_dt = _utc_bounds(start_date, end_date)
    stmt = (
        select(ProductionJob)
        .options(selectinload(ProductionJob.assigned_user))
        .where(
            ProductionJob.assigned_user_id.is_not(None),
            ProductionJob.started_at.is_not(None),
            ProductionJob.started_at >= start_dt,
            ProductionJob.started_at < end_dt,
        )
    )
    if accessible is not None:
        stmt = stmt.where(ProductionJob.branch_id.in_(accessible))
    if branch_id is not None:
        stmt = stmt.where(ProductionJob.branch_id == branch_id)
    if user_id is not None:
        stmt = stmt.where(ProductionJob.assigned_user_id == user_id)

    result = await db.execute(stmt)
    jobs = result.scalars().all()

    totals = defaultdict(lambda: {"completed": 0, "active": 0, "duration": 0, "stages": defaultdict(int)})
    completed_count = 0
    active_count = 0
    total_duration = 0

    for job in jobs:
        key = job.assigned_user_id
        if key is None:
            continue
        if job.status == "completed":
            completed_count += 1
            totals[key]["completed"] += 1
            if job.completed_at and job.started_at:
                minutes = max(0, int((job.completed_at - job.started_at).total_seconds() / 60))
                totals[key]["duration"] += minutes
                total_duration += minutes
            totals[key]["stages"][job.stage] += 1
        elif job.status == "in_progress":
            active_count += 1
            totals[key]["active"] += 1

    employees = []
    for uid, data in totals.items():
        user = next((j.assigned_user for j in jobs if j.assigned_user_id == uid), None)
        completed = data["completed"]
        employees.append(
            ProductionKpiEmployee(
                user_id=uid,
                employee_name=(user.full_name if user and user.full_name else user.email if user else str(uid)),
                completed_jobs=completed,
                active_jobs=data["active"],
                total_duration_minutes=data["duration"],
                average_duration_minutes=round(data["duration"] / completed, 1) if completed else 0.0,
                by_stage={stage: data["stages"].get(stage, 0) for stage in STAGES},
            )
        )

    employees.sort(key=lambda e: (-e.completed_jobs, e.average_duration_minutes or 999999, e.employee_name.lower()))
    summary = ProductionKpiSummary(
        period_start=start_date,
        period_end=end_date,
        completed_jobs=completed_count,
        active_jobs=active_count,
        total_duration_minutes=total_duration,
        average_duration_minutes=round(total_duration / completed_count, 1) if completed_count else 0.0,
        employees_count=len(employees),
    )
    return ProductionKpiOut(summary=summary, employees=employees)
