from __future__ import annotations

import re
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_serializer,
    field_validator,
    model_validator,
)

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
    rent_currency: Literal["USD"] = "USD"
    notes: str | None = None


class ApartmentCreate(ApartmentBase):
    pass


class ApartmentUpdate(ApartmentBase):
    is_active: bool = True


class ApartmentResponse(ApartmentBase):
    id: int
    is_active: bool
    latest_invoice: LatestInvoiceSummary | None = None
    current_tenant_name: str | None = None


class TenantIn(ApiSchema):
    full_name: str = Field(min_length=1, max_length=200)
    phone: str | None = Field(default=None, max_length=50)
    email: str | None = Field(default=None, max_length=320)
    contract_start: date
    contract_end: date | None = None
    notes: str | None = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str | None) -> str | None:
        if value is not None and re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value) is None:
            raise ValueError("invalid email address")
        return value

    @model_validator(mode="after")
    def validate_contract_dates(self):
        if self.contract_end is not None and self.contract_end < self.contract_start:
            raise ValueError("contract_end must be on or after contract_start")
        return self


class TenantOut(TenantIn):
    id: int
    apartment_id: int


class TenantEndContract(ApiSchema):
    contract_end: date


class TenantAttachmentOut(ApiSchema):
    id: int
    tenant_id: int
    original_name: str
    content_type: str
    size_bytes: int
    uploaded_at: datetime


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
    service_kind: ServiceKind
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
    months: int | None
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


class TopServiceStats(ApiSchema):
    name: str
    share_percent: Decimal
    peak_period: date


class IncomeStats(ApiSchema):
    scope: str
    apartment_id: int | None
    months: int | None
    values: list[IncomePoint]
    totals: IncomeTotals
    top_service: TopServiceStats | None


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


class ImportReportResponse(ApiSchema):
    invoices_created: int
    invoices_skipped: int
    services_created: int
    tariffs_created: int
    warnings: list[str]


class TelegramNotificationSettings(ApiSchema):
    enabled: bool = False
    token: str = ""
    chat_id: str = ""

    @field_validator("token", "chat_id")
    @classmethod
    def strip_fields(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="after")
    def require_enabled_fields(self):
        if self.enabled and (not self.token or not self.chat_id):
            raise ValueError("enabled Telegram requires token and chat_id")
        return self


class EmailNotificationSettings(ApiSchema):
    enabled: bool = False
    smtp_host: str = ""
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_username: str = ""
    smtp_password: str = ""
    from_address: str = ""
    to_address: str = ""
    use_tls: bool = True

    @model_validator(mode="after")
    def require_enabled_fields(self):
        if self.enabled and not all(
            (self.smtp_host, self.from_address, self.to_address)
        ):
            raise ValueError(
                "enabled email requires smtp_host, from_address and to_address"
            )
        return self


class BillingReminderSettings(ApiSchema):
    enabled: bool = False
    days_before: int = Field(default=3, ge=0)
    repeat_every_days: int = Field(default=1, ge=1)
    auto_draft: bool = True


class PushSettings(ApiSchema):
    enabled: bool = False


class NotificationSettings(ApiSchema):
    telegram: TelegramNotificationSettings = Field(
        default_factory=TelegramNotificationSettings
    )
    email: EmailNotificationSettings = Field(default_factory=EmailNotificationSettings)
    billing_reminder: BillingReminderSettings = Field(
        default_factory=BillingReminderSettings
    )
    push: PushSettings = Field(default_factory=PushSettings)
    readings_day: int = Field(default=20, ge=1, le=28)
    overdue_after_days: int = Field(default=3, ge=1, le=365)
    repeat_every_days: int = Field(default=3, ge=1, le=365)


class NotificationTestResponse(ApiSchema):
    deliveries: int
    errors: list[str]
