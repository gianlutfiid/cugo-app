"""Schemas for finance management and reporting."""
import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

PAYMENT_METHODS = ("cash", "qris", "transfer", "other")
DEFAULT_EXPENSE_CATEGORIES = (
    "Gaji",
    "Sewa",
    "Listrik",
    "Air",
    "Internet",
    "Detergen & Chemical",
    "Transportasi",
    "Perawatan Mesin",
    "Perlengkapan Operasional",
    "Marketing",
    "Pajak & Legal",
    "Lain-lain",
)


class ExpenseCreate(BaseModel):
    branch_id: uuid.UUID
    transaction_date: date
    category: str = Field(min_length=1, max_length=60)
    description: str = Field(min_length=1, max_length=255)
    amount: int = Field(gt=0)
    payment_method: str = Field(default="cash", max_length=30)
    notes: str | None = Field(default=None, max_length=1000)

    @field_validator("category", "description")
    @classmethod
    def strip_required(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Field cannot be blank")
        return value

    @field_validator("payment_method")
    @classmethod
    def validate_payment_method(cls, value: str) -> str:
        value = value.strip().lower()
        if value not in PAYMENT_METHODS:
            raise ValueError("Invalid payment method")
        return value


class ExpenseOut(BaseModel):
    id: uuid.UUID
    branch_id: uuid.UUID
    transaction_date: date
    category: str
    description: str
    amount: int
    payment_method: str
    notes: str | None
    created_by_user_id: uuid.UUID
    created_by_name: str | None = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class FinanceSummary(BaseModel):
    period_start: date
    period_end: date
    revenue: int
    cash_received: int
    receivables: int
    expenses: int
    net_profit: int
    order_count: int
    expense_count: int
    revenue_by_payment_method: dict[str, int] = Field(default_factory=dict)
    expenses_by_category: dict[str, int] = Field(default_factory=dict)
