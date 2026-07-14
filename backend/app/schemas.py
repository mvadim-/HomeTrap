from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator

from app.models import ServiceKind


class ApiSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    @field_serializer("*", check_fields=False, when_used="json")
    def serialize_api_values(self, value: object) -> object:
        if isinstance(value, Decimal):
            return str(value)
        if isinstance(value, datetime):
            normalized = value if value.tzinfo is not None else value.replace(tzinfo=UTC)
            return normalized.isoformat().replace("+00:00", "Z")
        return value


class LatestInvoiceSummary(ApiSchema):
    id: int
    period: date
    status: str
    grand_total: Decimal


class ApartmentBase(ApiSchema):
    name: str = Field(min_length=1, max_length=200)
    address: str = Field(min_length=1, max_length=500)
    rent_amount: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    rent_currency: str = Field(default="USD", min_length=3, max_length=3)
    notes: str | None = None


class ApartmentCreate(ApartmentBase):
    pass


class ApartmentUpdate(ApartmentBase):
    is_active: bool = True


class ApartmentResponse(ApartmentBase):
    id: int
    is_active: bool
    latest_invoice: LatestInvoiceSummary | None = None


class ServiceBase(ApiSchema):
    name: str = Field(min_length=1, max_length=200)
    kind: ServiceKind
    unit: str | None = Field(default=None, max_length=50)
    provider_account: str | None = Field(default=None, max_length=100)
    sort_order: int = 0


class ServiceCreate(ServiceBase):
    pass


class ServiceUpdate(ServiceBase):
    is_active: bool = True


class ServiceResponse(ServiceBase):
    id: int
    apartment_id: int
    is_active: bool


class TariffCreate(ApiSchema):
    value: Decimal = Field(gt=0, max_digits=12, decimal_places=5)
    valid_from: date


class TariffResponse(TariffCreate):
    id: int
    service_id: int


class ExchangeRateResponse(ApiSchema):
    requested_date: date
    rate_date: date
    currency: str
    rate: Decimal
    is_fallback: bool


class InvoiceCreate(ApiSchema):
    period: date

    @field_validator("period")
    @classmethod
    def period_must_start_month(cls, value: date) -> date:
        if value.day != 1:
            raise ValueError("period must be the first day of a month")
        return value


class InvoiceLineUpdate(ApiSchema):
    id: int
    curr_reading: Decimal | None = Field(
        default=None,
        max_digits=14,
        decimal_places=3,
    )


class InvoiceUpdate(ApiSchema):
    exchange_rate: Decimal | None = Field(
        default=None,
        gt=0,
        max_digits=12,
        decimal_places=6,
    )
    lines: list[InvoiceLineUpdate] = Field(default_factory=list)


class InvoiceLineResponse(ApiSchema):
    id: int
    service_id: int
    service_name: str
    prev_reading: Decimal | None
    curr_reading: Decimal | None
    consumed: Decimal | None
    tariff_value: Decimal
    amount: Decimal


class InvoiceWarning(ApiSchema):
    code: str
    service_id: int
    message: str


class InvoiceResponse(ApiSchema):
    id: int
    apartment_id: int
    period: date
    status: str
    issued_at: datetime | None
    paid_at: datetime | None
    exchange_rate: Decimal
    rent_amount_usd: Decimal
    rent_amount_uah: Decimal
    utilities_total: Decimal
    grand_total: Decimal
    lines: list[InvoiceLineResponse]
    warnings: list[InvoiceWarning]


class InvoiceListItem(ApiSchema):
    id: int
    apartment_id: int
    period: date
    status: str
    issued_at: datetime | None
    paid_at: datetime | None
    exchange_rate: Decimal
    rent_amount_usd: Decimal
    rent_amount_uah: Decimal
    utilities_total: Decimal
    grand_total: Decimal


class ConsumptionPoint(ApiSchema):
    period: date
    consumed: Decimal


class ConsumptionSeries(ApiSchema):
    service_id: int
    service_name: str
    unit: str | None
    values: list[ConsumptionPoint]


class ConsumptionStats(ApiSchema):
    apartment_id: int
    months: int
    series: list[ConsumptionSeries]


class IncomePoint(ApiSchema):
    period: date
    rent: Decimal
    utilities: Decimal
    total: Decimal


class IncomeTotals(ApiSchema):
    rent: Decimal
    utilities: Decimal
    total: Decimal


class IncomeStats(ApiSchema):
    scope: str
    apartment_id: int | None
    months: int
    values: list[IncomePoint]
    totals: IncomeTotals


class DashboardAttentionItem(ApiSchema):
    invoice_id: int
    apartment_id: int
    apartment_name: str
    period: date
    status: str
    grand_total: Decimal
    reason: str


class DashboardStats(ApiSchema):
    period: date
    charged: Decimal
    paid: Decimal
    outstanding: Decimal
    needs_attention: list[DashboardAttentionItem]
