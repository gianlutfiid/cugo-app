"""Schemas for laundry orders/invoices."""
import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class OrderItemCreate(BaseModel):
    service_id: uuid.UUID
    quantity: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    notes: str | None = Field(default=None, max_length=1000)

    @field_validator("quantity")
    @classmethod
    def quantity_positive(cls, value: Decimal) -> Decimal:
        if value <= 0:
            raise ValueError("Quantity must be greater than zero")
        return value


class OrderCreate(BaseModel):
    branch_id: uuid.UUID
    customer_id: uuid.UUID
    received_at: datetime | None = None
    due_at: datetime | None = None
    discount: int = Field(default=0, ge=0)
    paid_amount: int = Field(default=0, ge=0)
    payment_method: str | None = Field(default=None, max_length=30)
    notes: str | None = Field(default=None, max_length=2000)
    items: list[OrderItemCreate] = Field(min_length=1)


class OrderUpdate(BaseModel):
    due_at: datetime | None = None
    discount: int | None = Field(default=None, ge=0)
    paid_amount: int | None = Field(default=None, ge=0)
    payment_method: str | None = Field(default=None, max_length=30)
    notes: str | None = Field(default=None, max_length=2000)
    status: str | None = None


class OrderItemOut(BaseModel):
    id: uuid.UUID
    service_id: uuid.UUID
    line_number: int
    service_name: str
    service_code: str
    unit: str
    quantity: Decimal
    unit_price: int
    subtotal: int
    notes: str | None
    model_config = ConfigDict(from_attributes=True)


class OrderOut(BaseModel):
    id: uuid.UUID
    branch_id: uuid.UUID
    customer_id: uuid.UUID
    customer_name: str
    customer_phone: str | None
    invoice_number: str
    received_at: datetime
    due_at: datetime | None
    status: str
    subtotal: int
    discount: int
    total: int
    paid_amount: int
    payment_status: str
    payment_method: str | None
    notes: str | None
    items: list[OrderItemOut]
    created_at: datetime
    updated_at: datetime


class OrderListOut(BaseModel):
    id: uuid.UUID
    branch_id: uuid.UUID
    customer_id: uuid.UUID
    customer_name: str
    invoice_number: str
    received_at: datetime
    due_at: datetime | None
    status: str
    subtotal: int
    discount: int
    total: int
    paid_amount: int
    payment_status: str
    model_config = ConfigDict(from_attributes=True)


class OrderStatusLogOut(BaseModel):
    id: uuid.UUID
    order_id: uuid.UUID
    branch_id: uuid.UUID
    from_status: str | None
    to_status: str
    changed_by_user_id: uuid.UUID
    changed_by_name: str | None
    changed_at: datetime
    note: str | None
