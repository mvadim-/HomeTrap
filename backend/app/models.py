from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from enum import StrEnum
from typing import Any
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class ServiceKind(StrEnum):
    METERED = "metered"
    FIXED = "fixed"


class InvoiceLineKind(StrEnum):
    METERED = "metered"
    FIXED = "fixed"
    ADJUSTMENT = "adjustment"


class InvoiceStatus(StrEnum):
    DRAFT = "draft"
    ISSUED = "issued"
    PAID = "paid"


class ExpenseCategory(StrEnum):
    REPAIR = "repair"
    TAX = "tax"
    INSURANCE = "insurance"
    COMMISSION = "commission"
    OTHER = "other"


class Apartment(Base):
    __tablename__ = "apartments"
    __table_args__ = (
        UniqueConstraint("restore_key", name="uq_apartments_restore_key"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    restore_key: Mapped[str] = mapped_column(String(32), default=lambda: uuid4().hex)
    name: Mapped[str] = mapped_column(String(200))
    address: Mapped[str] = mapped_column(String(500))
    rent_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    rent_currency: Mapped[str] = mapped_column(String(3), default="USD")
    notes: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    services: Mapped[list[Service]] = relationship(
        back_populates="apartment",
        cascade="all, delete-orphan",
    )
    invoices: Mapped[list[Invoice]] = relationship(
        back_populates="apartment",
        cascade="all, delete-orphan",
    )
    tenants: Mapped[list[Tenant]] = relationship(
        back_populates="apartment",
        cascade="all, delete-orphan",
    )
    expenses: Mapped[list[Expense]] = relationship(
        back_populates="apartment",
        cascade="all, delete-orphan",
    )


class Tenant(Base):
    __tablename__ = "tenants"
    __table_args__ = (
        CheckConstraint(
            "billing_day IS NULL OR billing_day BETWEEN 1 AND 31",
            name="ck_tenants_billing_day",
        ),
        Index("ix_tenants_apartment_id_contract_end", "apartment_id", "contract_end"),
        Index(
            "uq_tenants_active_apartment",
            "apartment_id",
            unique=True,
            sqlite_where=text("contract_end IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    apartment_id: Mapped[int] = mapped_column(
        ForeignKey("apartments.id", ondelete="CASCADE"),
        index=True,
    )
    full_name: Mapped[str] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(50))
    email: Mapped[str | None] = mapped_column(String(320))
    contract_start: Mapped[date] = mapped_column(Date)
    contract_end: Mapped[date | None] = mapped_column(Date)
    billing_day: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)

    apartment: Mapped[Apartment] = relationship(back_populates="tenants")
    attachments: Mapped[list[TenantAttachment]] = relationship(
        back_populates="tenant",
        cascade="all, delete-orphan",
    )


class TenantAttachment(Base):
    __tablename__ = "tenant_attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        index=True,
    )
    original_name: Mapped[str] = mapped_column(String(500))
    stored_name: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
    )

    tenant: Mapped[Tenant] = relationship(back_populates="attachments")


class Service(Base):
    __tablename__ = "services"
    __table_args__ = (
        CheckConstraint("kind IN ('metered', 'fixed')", name="ck_services_kind"),
        UniqueConstraint("restore_key", name="uq_services_restore_key"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    restore_key: Mapped[str] = mapped_column(String(32), default=lambda: uuid4().hex)
    apartment_id: Mapped[int] = mapped_column(
        ForeignKey("apartments.id", ondelete="CASCADE"),
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(20))
    unit: Mapped[str | None] = mapped_column(String(50))
    provider_account: Mapped[str | None] = mapped_column(String(100))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    apartment: Mapped[Apartment] = relationship(back_populates="services")
    tariffs: Mapped[list[Tariff]] = relationship(
        back_populates="service",
        cascade="all, delete-orphan",
        order_by="Tariff.valid_from",
    )
    invoice_lines: Mapped[list[InvoiceLine]] = relationship(back_populates="service")


class Tariff(Base):
    __tablename__ = "tariffs"
    __table_args__ = (
        UniqueConstraint("service_id", "valid_from", name="uq_tariffs_service_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    service_id: Mapped[int] = mapped_column(
        ForeignKey("services.id", ondelete="CASCADE"),
        index=True,
    )
    value: Mapped[Decimal] = mapped_column(Numeric(12, 5))
    valid_from: Mapped[date] = mapped_column(Date)

    service: Mapped[Service] = relationship(back_populates="tariffs")


class Invoice(Base):
    __tablename__ = "invoices"
    __table_args__ = (
        UniqueConstraint("apartment_id", "period", name="uq_invoices_apartment_period"),
        CheckConstraint(
            "status IN ('draft', 'issued', 'paid')", name="ck_invoices_status"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    apartment_id: Mapped[int] = mapped_column(
        ForeignKey("apartments.id", ondelete="CASCADE"),
        index=True,
    )
    period: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default=InvoiceStatus.DRAFT.value)
    issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    exchange_rate: Mapped[Decimal] = mapped_column(Numeric(12, 6))
    rent_amount_usd: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    rent_amount_uah: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    utilities_total: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    adjustments_total: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        default=Decimal("0.00"),
        server_default=text("0.00"),
    )
    grand_total: Mapped[Decimal] = mapped_column(Numeric(12, 2))

    apartment: Mapped[Apartment] = relationship(back_populates="invoices")
    lines: Mapped[list[InvoiceLine]] = relationship(
        back_populates="invoice",
        cascade="all, delete-orphan",
        order_by="InvoiceLine.id",
    )


class InvoiceLine(Base):
    __tablename__ = "invoice_lines"
    __table_args__ = (
        CheckConstraint(
            "service_kind IN ('metered', 'fixed', 'adjustment')",
            name="ck_invoice_lines_service_kind",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(
        ForeignKey("invoices.id", ondelete="CASCADE"),
        index=True,
    )
    service_id: Mapped[int | None] = mapped_column(
        ForeignKey("services.id", ondelete="RESTRICT"),
        index=True,
    )
    service_name: Mapped[str] = mapped_column(String(200))
    service_kind: Mapped[str] = mapped_column(String(20))
    prev_reading: Mapped[Decimal | None] = mapped_column(Numeric(14, 3))
    curr_reading: Mapped[Decimal | None] = mapped_column(Numeric(14, 3))
    consumed: Mapped[Decimal | None] = mapped_column(Numeric(14, 3))
    tariff_value: Mapped[Decimal] = mapped_column(Numeric(12, 5))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))

    invoice: Mapped[Invoice] = relationship(back_populates="lines")
    service: Mapped[Service | None] = relationship(back_populates="invoice_lines")
    expense: Mapped[Expense | None] = relationship(
        back_populates="invoice_line",
        passive_deletes="all",
        uselist=False,
    )


class ExchangeRate(Base):
    __tablename__ = "exchange_rates"
    __table_args__ = (
        UniqueConstraint("date", "currency", name="uq_exchange_rates_date_currency"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    currency: Mapped[str] = mapped_column(String(3))
    rate: Mapped[Decimal] = mapped_column(Numeric(12, 6))


class Expense(Base):
    __tablename__ = "expenses"
    __table_args__ = (
        CheckConstraint(
            "category IN ('repair', 'tax', 'insurance', 'commission', 'other')",
            name="ck_expenses_category",
        ),
        UniqueConstraint("restore_key", name="uq_expenses_restore_key"),
        Index("ix_expenses_invoice_line_id", "invoice_line_id", unique=True),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    restore_key: Mapped[str] = mapped_column(String(32), default=lambda: uuid4().hex)
    apartment_id: Mapped[int | None] = mapped_column(
        ForeignKey("apartments.id", ondelete="CASCADE"),
        index=True,
    )
    invoice_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("invoice_lines.id", ondelete="CASCADE"),
    )
    date: Mapped[date] = mapped_column(Date)
    category: Mapped[str] = mapped_column(String(20))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3), default="UAH")
    notes: Mapped[str | None] = mapped_column(Text)

    apartment: Mapped[Apartment | None] = relationship(back_populates="expenses")
    invoice_line: Mapped[InvoiceLine | None] = relationship(back_populates="expense")


class RestoreAlias(Base):
    __tablename__ = "restore_aliases"
    __table_args__ = (
        UniqueConstraint("entity_type", "restore_key", name="uq_restore_alias_key"),
        CheckConstraint(
            "entity_type IN ('apartment', 'service')",
            name="ck_restore_alias_entity_type",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(20))
    restore_key: Mapped[str] = mapped_column(String(32))
    target_restore_key: Mapped[str] = mapped_column(String(32))


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(100), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[Any] = mapped_column(JSON)


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    endpoint: Mapped[str] = mapped_column(Text, unique=True)
    p256dh: Mapped[str] = mapped_column(Text)
    auth: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
    )
