"""Finance summaries and operating expense endpoints."""
import uuid
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.authz import accessible_branch_ids, ensure_branch_accessible, ensure_branch_manager
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.customer import Customer
from app.models.expense import Expense
from app.models.order import Order
from app.models.user import User
from app.schemas.finance import ExpenseCreate, ExpenseOut, FinanceSummary

router = APIRouter(prefix="/finance", tags=["finance"])


def _utc_bounds(start: date, end: date) -> tuple[datetime, datetime]:
    return datetime.combine(start, time.min, tzinfo=timezone.utc), datetime.combine(end + timedelta(days=1), time.min, tzinfo=timezone.utc)


async def _accessible_filter(current_user: User, branch_id: uuid.UUID | None, db: AsyncSession):
    accessible = await accessible_branch_ids(current_user, db)
    if branch_id is not None:
        await ensure_branch_accessible(branch_id, current_user, db)
    return accessible


@router.get("/expenses", response_model=list[ExpenseOut])
async def list_expenses(
    start_date: date | None = None,
    end_date: date | None = None,
    branch_id: uuid.UUID | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ExpenseOut]:
    accessible = await _accessible_filter(current_user, branch_id, db)
    stmt = select(Expense).options(selectinload(Expense.created_by)).order_by(Expense.transaction_date.desc(), Expense.created_at.desc())
    if accessible is not None:
        if not accessible:
            return []
        stmt = stmt.where(Expense.branch_id.in_(accessible))
    if branch_id is not None:
        stmt = stmt.where(Expense.branch_id == branch_id)
    if start_date is not None:
        stmt = stmt.where(Expense.transaction_date >= start_date)
    if end_date is not None:
        stmt = stmt.where(Expense.transaction_date <= end_date)
    result = await db.execute(stmt)
    return [ExpenseOut(
        id=e.id, branch_id=e.branch_id, transaction_date=e.transaction_date, category=e.category,
        description=e.description, amount=e.amount, payment_method=e.payment_method, notes=e.notes,
        created_by_user_id=e.created_by_user_id, created_by_name=e.created_by.full_name if e.created_by else None,
        created_at=e.created_at,
    ) for e in result.scalars().all()]


@router.post("/expenses", response_model=ExpenseOut, status_code=status.HTTP_201_CREATED)
async def create_expense(
    payload: ExpenseCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ExpenseOut:
    await ensure_branch_manager(payload.branch_id, current_user, db)
    expense = Expense(
        branch_id=payload.branch_id,
        transaction_date=payload.transaction_date,
        category=payload.category,
        description=payload.description,
        amount=payload.amount,
        payment_method=payload.payment_method,
        notes=payload.notes,
        created_by_user_id=current_user.id,
    )
    db.add(expense)
    await db.commit()
    result = await db.execute(select(Expense).options(selectinload(Expense.created_by)).where(Expense.id == expense.id))
    e = result.scalar_one()
    return ExpenseOut(
        id=e.id, branch_id=e.branch_id, transaction_date=e.transaction_date, category=e.category,
        description=e.description, amount=e.amount, payment_method=e.payment_method, notes=e.notes,
        created_by_user_id=e.created_by_user_id, created_by_name=e.created_by.full_name if e.created_by else None,
        created_at=e.created_at,
    )


@router.get("/summary", response_model=FinanceSummary)
async def finance_summary(
    start_date: date = Query(...),
    end_date: date = Query(...),
    branch_id: uuid.UUID | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FinanceSummary:
    if end_date < start_date:
        raise HTTPException(status_code=400, detail="End date cannot be before start date")
    if (end_date - start_date).days > 366:
        raise HTTPException(status_code=400, detail="Finance period cannot exceed 366 days")
    accessible = await _accessible_filter(current_user, branch_id, db)
    start_dt, end_dt = _utc_bounds(start_date, end_date)

    order_stmt = select(Order).where(
        Order.received_at >= start_dt,
        Order.received_at < end_dt,
        Order.status != "cancelled",
    )
    if accessible is not None:
        if not accessible:
            order_stmt = order_stmt.where(False)
        else:
            order_stmt = order_stmt.where(Order.branch_id.in_(accessible))
    if branch_id is not None:
        order_stmt = order_stmt.where(Order.branch_id == branch_id)
    orders = (await db.execute(order_stmt)).scalars().all()

    expense_stmt = select(Expense).where(Expense.transaction_date >= start_date, Expense.transaction_date <= end_date)
    if accessible is not None:
        if not accessible:
            expense_stmt = expense_stmt.where(False)
        else:
            expense_stmt = expense_stmt.where(Expense.branch_id.in_(accessible))
    if branch_id is not None:
        expense_stmt = expense_stmt.where(Expense.branch_id == branch_id)
    expenses = (await db.execute(expense_stmt)).scalars().all()

    revenue = sum(o.total for o in orders)
    cash_received = sum(o.paid_amount for o in orders)
    expenses_total = sum(e.amount for e in expenses)
    revenue_by_payment_method = defaultdict(int)
    for order in orders:
        if order.paid_amount > 0 and order.payment_method:
            revenue_by_payment_method[order.payment_method] += order.paid_amount
    expenses_by_category = defaultdict(int)
    for expense in expenses:
        expenses_by_category[expense.category] += expense.amount

    return FinanceSummary(
        period_start=start_date,
        period_end=end_date,
        revenue=revenue,
        cash_received=cash_received,
        receivables=max(0, revenue - cash_received),
        expenses=expenses_total,
        net_profit=revenue - expenses_total,
        order_count=len(orders),
        expense_count=len(expenses),
        revenue_by_payment_method=dict(revenue_by_payment_method),
        expenses_by_category=dict(expenses_by_category),
    )
