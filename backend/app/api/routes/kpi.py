"""Production KPI reporting and target configuration endpoints."""
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.authz import accessible_branch_ids, ensure_branch_accessible, ensure_branch_manager
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.kpi_target import KpiTarget
from app.models.order import Order, OrderItem
from app.models.production_job import ProductionJob
from app.models.service import Service
from app.models.user import User
from app.schemas.kpi import KpiTargetCreate, KpiTargetOut, KpiTargetUpdate, ProductionKpiEmployee, ProductionKpiOut, ProductionKpiSummary, STAGES

router = APIRouter(prefix="/kpi", tags=["kpi"])


def _utc_bounds(start: date, end: date) -> tuple[datetime, datetime]:
    return datetime.combine(start, time.min, tzinfo=timezone.utc), datetime.combine(end + timedelta(days=1), time.min, tzinfo=timezone.utc)


def _add_qty(target: dict[str, float], unit: str, quantity) -> None:
    target[unit] = round(target.get(unit, 0.0) + float(quantity), 2)


@router.get("/targets", response_model=list[KpiTargetOut])
async def list_kpi_targets(branch_id: uuid.UUID | None = None, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[KpiTarget]:
    accessible = await accessible_branch_ids(current_user, db)
    if branch_id is not None: await ensure_branch_accessible(branch_id, current_user, db)
    stmt = select(KpiTarget).order_by(KpiTarget.branch_id, KpiTarget.stage, KpiTarget.unit)
    if accessible is not None:
        if not accessible: return []
        stmt = stmt.where(KpiTarget.branch_id.in_(accessible))
    if branch_id is not None: stmt = stmt.where(KpiTarget.branch_id == branch_id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.post("/targets", response_model=KpiTargetOut, status_code=status.HTTP_201_CREATED)
async def create_kpi_target(payload: KpiTargetCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> KpiTarget:
    await ensure_branch_manager(payload.branch_id, current_user, db)
    target = KpiTarget(branch_id=payload.branch_id, stage=payload.stage, unit=payload.unit, daily_target=payload.daily_target, is_active=True)
    db.add(target)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Target for this branch, stage, and unit already exists")
    await db.refresh(target)
    return target


@router.patch("/targets/{target_id}", response_model=KpiTargetOut)
async def update_kpi_target(target_id: uuid.UUID, payload: KpiTargetUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> KpiTarget:
    target = await db.get(KpiTarget, target_id)
    if target is None: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KPI target not found")
    await ensure_branch_manager(target.branch_id, current_user, db)
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items(): setattr(target, field, value)
    await db.commit(); await db.refresh(target)
    return target


@router.get("/production", response_model=ProductionKpiOut)
async def production_kpi(start_date: date = Query(...), end_date: date = Query(...), branch_id: uuid.UUID | None = None, user_id: uuid.UUID | None = None, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> ProductionKpiOut:
    if end_date < start_date: raise HTTPException(status_code=400, detail="End date cannot be before start date")
    if (end_date - start_date).days > 366: raise HTTPException(status_code=400, detail="KPI period cannot exceed 366 days")
    if branch_id is not None: await ensure_branch_accessible(branch_id, current_user, db)
    accessible = await accessible_branch_ids(current_user, db)
    if accessible is not None and not accessible:
        empty = ProductionKpiSummary(period_start=start_date, period_end=end_date, completed_jobs=0, active_jobs=0, total_duration_minutes=0, average_duration_minutes=0.0, employees_count=0, quantity_by_unit={})
        return ProductionKpiOut(summary=empty, employees=[])

    target_stmt = select(KpiTarget).where(KpiTarget.is_active.is_(True))
    if accessible is not None: target_stmt = target_stmt.where(KpiTarget.branch_id.in_(accessible))
    if branch_id is not None: target_stmt = target_stmt.where(KpiTarget.branch_id == branch_id)
    target_result = await db.execute(target_stmt)
    targets_by_branch: dict[uuid.UUID, dict[tuple[str, str], float]] = defaultdict(dict)
    for target in target_result.scalars().all():
        targets_by_branch[target.branch_id][(target.stage, target.unit)] = float(target.daily_target)

    start_dt, end_dt = _utc_bounds(start_date, end_date)
    stmt = select(ProductionJob).options(selectinload(ProductionJob.assigned_user), selectinload(ProductionJob.order).selectinload(Order.items).selectinload(OrderItem.service).selectinload(Service.production_stages)).where(ProductionJob.assigned_user_id.is_not(None), ProductionJob.started_at.is_not(None), ProductionJob.started_at >= start_dt, ProductionJob.started_at < end_dt)
    if accessible is not None: stmt = stmt.where(ProductionJob.branch_id.in_(accessible))
    if branch_id is not None: stmt = stmt.where(ProductionJob.branch_id == branch_id)
    if user_id is not None: stmt = stmt.where(ProductionJob.assigned_user_id == user_id)
    result = await db.execute(stmt)
    jobs = result.scalars().unique().all()

    totals = defaultdict(lambda: {"completed": 0, "active": 0, "duration": 0, "stages": defaultdict(int), "qty": defaultdict(float), "stage_qty": defaultdict(lambda: defaultdict(float)), "active_days_by_branch": defaultdict(set)})
    completed_count = active_count = total_duration = 0
    summary_qty = defaultdict(float)
    for job in jobs:
        uid = job.assigned_user_id
        if uid is None: continue
        data = totals[uid]
        if job.status == "completed":
            completed_count += 1; data["completed"] += 1
            if job.completed_at and job.started_at:
                minutes = max(0, int((job.completed_at - job.started_at).total_seconds() / 60)); data["duration"] += minutes; total_duration += minutes
                data["active_days_by_branch"][job.branch_id].add(job.completed_at.date())
            data["stages"][job.stage] += 1
            for item in job.order.items:
                if job.stage not in {stage.stage for stage in item.service.production_stages}: continue
                unit = item.unit.strip().lower(); qty = float(item.quantity)
                _add_qty(data["qty"], unit, qty); _add_qty(data["stage_qty"][job.stage], unit, qty); summary_qty[unit] += qty
        elif job.status == "in_progress": active_count += 1; data["active"] += 1

    employees = []
    for uid, data in totals.items():
        user = next((j.assigned_user for j in jobs if j.assigned_user_id == uid), None)
        quantity_by_stage = {stage: {unit: round(qty, 2) for unit, qty in quantities.items()} for stage, quantities in data["stage_qty"].items()}
        target_by_stage: dict[str, dict[str, float]] = {}
        for branch_key, branch_days in data["active_days_by_branch"].items():
            for (stage, unit), daily_target in targets_by_branch.get(branch_key, {}).items():
                if data["stages"].get(stage, 0) == 0: continue
                target_by_stage.setdefault(stage, {})[unit] = round(target_by_stage.get(stage, {}).get(unit, 0.0) + daily_target * len(branch_days), 2)
        achievement_by_stage: dict[str, dict[str, float]] = {}
        for stage, units in target_by_stage.items():
            achievement_by_stage[stage] = {}
            for unit, target_total in units.items():
                actual = round(quantity_by_stage.get(stage, {}).get(unit, 0.0), 2)
                achievement_by_stage[stage][unit] = round((actual / target_total) * 100, 1) if target_total else 0.0
        completed = data["completed"]
        employees.append(ProductionKpiEmployee(user_id=uid, employee_name=(user.full_name if user and user.full_name else user.email if user else str(uid)), completed_jobs=completed, active_jobs=data["active"], total_duration_minutes=data["duration"], average_duration_minutes=round(data["duration"] / completed, 1) if completed else 0.0, active_days=len(set().union(*data["active_days_by_branch"].values())) if data["active_days_by_branch"] else 0, quantity_by_unit={unit: round(qty, 2) for unit, qty in data["qty"].items()}, by_stage={stage: data["stages"].get(stage, 0) for stage in STAGES}, quantity_by_stage=quantity_by_stage, target_by_stage=target_by_stage, achievement_by_stage=achievement_by_stage))
    employees.sort(key=lambda e: (-e.completed_jobs, e.average_duration_minutes or 999999, e.employee_name.lower()))
    summary = ProductionKpiSummary(period_start=start_date, period_end=end_date, completed_jobs=completed_count, active_jobs=active_count, total_duration_minutes=total_duration, average_duration_minutes=round(total_duration / completed_count, 1) if completed_count else 0.0, employees_count=len(employees), quantity_by_unit={unit: round(qty, 2) for unit, qty in summary_qty.items()})
    return ProductionKpiOut(summary=summary, employees=employees)
