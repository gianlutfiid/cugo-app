"""Laundry order/nota endpoints with branch-scoped authorization."""
import uuid
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.authz import accessible_branch_ids, ensure_branch_accessible, ensure_transaction_editor
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.customer import Customer
from app.models.order import Order, OrderItem
from app.models.order_status_log import OrderStatusLog
from app.models.service import Service
from app.models.user import User
from app.schemas.order import OrderCreate, OrderItemOut, OrderListOut, OrderOut, OrderStatusLogOut, OrderUpdate

router = APIRouter(prefix="/orders", tags=["orders"])

ALLOWED_STATUSES = {"received", "washing", "ironing", "folding", "packing", "completed", "picked_up", "cancelled"}
ALLOWED_PAYMENT_METHODS = {"cash", "qris", "transfer", "other"}
STATUS_TRANSITIONS = {
    "received": {"washing", "cancelled"},
    "washing": {"ironing", "cancelled"},
    "ironing": {"folding", "cancelled"},
    "folding": {"packing", "cancelled"},
    "packing": {"completed", "cancelled"},
    "completed": {"picked_up"},
    "picked_up": set(),
    "cancelled": set(),
}


def _money(value: Decimal) -> int:
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _payment_status(total: int, paid: int) -> str:
    if paid <= 0:
        return "unpaid"
    if paid >= total:
        return "paid"
    return "partial"


def _order_out(order: Order) -> OrderOut:
    return OrderOut(
        id=order.id,
        branch_id=order.branch_id,
        customer_id=order.customer_id,
        customer_name=order.customer.name,
        customer_phone=order.customer.phone,
        invoice_number=order.invoice_number,
        received_at=order.received_at,
        due_at=order.due_at,
        status=order.status,
        subtotal=order.subtotal,
        discount=order.discount,
        total=order.total,
        paid_amount=order.paid_amount,
        payment_status=order.payment_status,
        payment_method=order.payment_method,
        notes=order.notes,
        items=[
            OrderItemOut(
                id=i.id, service_id=i.service_id, line_number=i.line_number,
                service_name=i.service_name, service_code=i.service_code, unit=i.unit,
                quantity=i.quantity, unit_price=i.unit_price, subtotal=i.subtotal, notes=i.notes,
            ) for i in order.items
        ],
        created_at=order.created_at,
        updated_at=order.updated_at,
    )


async def _load_order(db: AsyncSession, order_id: uuid.UUID) -> Order:
    result = await db.execute(
        select(Order)
        .options(selectinload(Order.customer), selectinload(Order.items))
        .where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    return order


async def _next_invoice(db: AsyncSession, branch_id: uuid.UUID) -> str:
    # Timestamp + random UUID suffix avoids race-prone daily counters while remaining human-readable.
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    suffix = uuid.uuid4().hex[:4].upper()
    return f"CUGO-{stamp}-{suffix}"


async def _load_services_for_items(db: AsyncSession, branch_id: uuid.UUID, service_ids: list[uuid.UUID]) -> dict[uuid.UUID, Service]:
    result = await db.execute(
        select(Service).where(Service.branch_id == branch_id, Service.id.in_(service_ids), Service.is_active.is_(True))
    )
    services = {s.id: s for s in result.scalars().all()}
    missing = [sid for sid in service_ids if sid not in services]
    if missing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="One or more services are invalid, inactive, or belong to another branch")
    return services


@router.get("", response_model=list[OrderListOut])
async def list_orders(
    branch_id: uuid.UUID | None = None,
    q: str | None = Query(default=None, max_length=100),
    order_status: str | None = None,
    payment_status: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[OrderListOut]:
    accessible_ids = await accessible_branch_ids(current_user, db)
    if branch_id is not None:
        await ensure_branch_accessible(branch_id, current_user, db)
    if order_status is not None and order_status not in ALLOWED_STATUSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid order status")
    if payment_status is not None and payment_status not in {"unpaid", "partial", "paid"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid payment status")

    stmt = select(Order).join(Customer)
    if accessible_ids is not None:
        if not accessible_ids:
            return []
        stmt = stmt.where(Order.branch_id.in_(accessible_ids))
    if branch_id is not None:
        stmt = stmt.where(Order.branch_id == branch_id)
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(or_(Order.invoice_number.ilike(pattern), Customer.name.ilike(pattern), Customer.phone.ilike(pattern)))
    if order_status:
        stmt = stmt.where(Order.status == order_status)
    if payment_status:
        stmt = stmt.where(Order.payment_status == payment_status)
    stmt = stmt.order_by(Order.received_at.desc())
    result = await db.execute(stmt)
    return [
        OrderListOut(
            id=o.id, branch_id=o.branch_id, customer_id=o.customer_id,
            customer_name=o.customer.name, invoice_number=o.invoice_number,
            received_at=o.received_at, due_at=o.due_at, status=o.status,
            subtotal=o.subtotal, discount=o.discount, total=o.total,
            paid_amount=o.paid_amount, payment_status=o.payment_status,
        ) for o in result.scalars().all()
    ]


@router.get("/{order_id}/history", response_model=list[OrderStatusLogOut])
async def get_order_history(
    order_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[OrderStatusLogOut]:
    order = await _load_order(db, order_id)
    await ensure_branch_accessible(order.branch_id, current_user, db)
    result = await db.execute(
        select(OrderStatusLog)
        .options(selectinload(OrderStatusLog.changed_by))
        .where(OrderStatusLog.order_id == order_id)
        .order_by(OrderStatusLog.changed_at.asc())
    )
    return [
        OrderStatusLogOut(
            id=log.id,
            order_id=log.order_id,
            branch_id=log.branch_id,
            from_status=log.from_status,
            to_status=log.to_status,
            changed_by_user_id=log.changed_by_user_id,
            changed_by_name=log.changed_by.full_name if log.changed_by else None,
            changed_at=log.changed_at,
            note=log.note,
        )
        for log in result.scalars().all()
    ]


@router.get("/{order_id}", response_model=OrderOut)
async def get_order(order_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> OrderOut:
    order = await _load_order(db, order_id)
    await ensure_branch_accessible(order.branch_id, current_user, db)
    return _order_out(order)


@router.post("", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
async def create_order(payload: OrderCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> OrderOut:
    await ensure_transaction_editor(payload.branch_id, current_user, db)
    customer = await db.get(Customer, payload.customer_id)
    if customer is None or customer.branch_id != payload.branch_id or not customer.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer is invalid, inactive, or belongs to another branch")
    if payload.due_at is not None and payload.received_at is not None and payload.due_at < payload.received_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Due date cannot be before received date")
    if payload.paid_amount > 0 and not payload.payment_method:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payment method is required when paid amount is greater than zero")
    if payload.payment_method and payload.payment_method not in ALLOWED_PAYMENT_METHODS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid payment method")

    service_ids = [item.service_id for item in payload.items]
    if len(service_ids) != len(set(service_ids)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Each service may appear only once per order")
    services = await _load_services_for_items(db, payload.branch_id, service_ids)

    subtotal = 0
    item_models: list[OrderItem] = []
    for idx, item in enumerate(payload.items, start=1):
        service = services[item.service_id]
        line_subtotal = _money(item.quantity * Decimal(service.price))
        subtotal += line_subtotal
        item_models.append(OrderItem(
            service_id=service.id, line_number=idx, service_name=service.name,
            service_code=service.code, unit=service.unit, quantity=item.quantity,
            unit_price=service.price, subtotal=line_subtotal, notes=item.notes,
        ))

    if payload.discount > subtotal:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Discount cannot exceed subtotal")
    total = subtotal - payload.discount
    if payload.paid_amount > total:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Paid amount cannot exceed total")

    received_at = payload.received_at or datetime.now(timezone.utc)
    order = Order(
        branch_id=payload.branch_id, customer_id=customer.id,
        invoice_number=await _next_invoice(db, payload.branch_id),
        received_at=received_at,
        due_at=payload.due_at, status="received", subtotal=subtotal,
        discount=payload.discount, total=total, paid_amount=payload.paid_amount,
        payment_status=_payment_status(total, payload.paid_amount),
        payment_method=payload.payment_method, notes=payload.notes,
        items=item_models,
    )
    db.add(order)
    db.add(OrderStatusLog(
        order_id=order.id,
        branch_id=order.branch_id,
        from_status=None,
        to_status="received",
        changed_by_user_id=current_user.id,
        changed_at=received_at,
        note="Nota dibuat",
    ))
    await db.commit()
    order = await _load_order(db, order.id)
    return _order_out(order)


@router.patch("/{order_id}", response_model=OrderOut)
async def update_order(order_id: uuid.UUID, payload: OrderUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> OrderOut:
    order = await _load_order(db, order_id)
    await ensure_transaction_editor(order.branch_id, current_user, db)

    data = payload.model_dump(exclude_unset=True)
    if order.status in {"picked_up", "cancelled"} and data:
        if any(field in data for field in {"due_at", "discount", "paid_amount", "payment_method", "notes"}):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Closed order cannot be edited")

    status_changed = False
    old_status = order.status
    if "status" in data:
        new_status = data["status"]
        if new_status not in ALLOWED_STATUSES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid order status")
        if new_status != order.status and new_status not in STATUS_TRANSITIONS[order.status]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status transition: {order.status} -> {new_status}",
            )
        status_changed = new_status != order.status

    if "due_at" in data and data["due_at"] is not None and data["due_at"] < order.received_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Due date cannot be before received date")
    if "payment_method" in data and data["payment_method"] is not None and data["payment_method"] not in ALLOWED_PAYMENT_METHODS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid payment method")

    discount = data.get("discount", order.discount)
    paid_amount = data.get("paid_amount", order.paid_amount)
    effective_payment_method = data.get("payment_method", order.payment_method)
    if discount > order.subtotal:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Discount cannot exceed subtotal")
    total = order.subtotal - discount
    if paid_amount > total:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Paid amount cannot exceed total")
    if paid_amount > 0 and effective_payment_method is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payment method is required when paid amount is greater than zero")

    for field, value in data.items():
        if field in {"discount", "paid_amount", "payment_method"}:
            continue
        setattr(order, field, value)
    order.discount = discount
    order.total = total
    order.paid_amount = paid_amount
    order.payment_method = effective_payment_method
    order.payment_status = _payment_status(total, paid_amount)

    if status_changed:
        db.add(OrderStatusLog(
            order_id=order.id,
            branch_id=order.branch_id,
            from_status=old_status,
            to_status=order.status,
            changed_by_user_id=current_user.id,
            changed_at=datetime.now(timezone.utc),
            note=None,
        ))

    await db.commit()
    return _order_out(await _load_order(db, order.id))
