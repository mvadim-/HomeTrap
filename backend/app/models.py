from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class ServiceKind(StrEnum):
    METERED = "metered"
    FIXED = "fixed"


class InvoiceStatus(StrEnum):
    DRAFT = "draft"
    ISSUED = "issued"
    PAID = "paid"


class Apartment(Base):
    __tablename__ = "apartments"

    id: Mapped[int] = mapped_column(primary_key=True)
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


class Service(Base):
    __tablename__ = "services"
    __table_args__ = (
        CheckConstraint("kind IN ('metered', 'fixed')", name="ck_services_kind"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
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
        CheckConstraint("status IN ('draft', 'issued', 'paid')", name="ck_invoices_status"),
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
    grand_total: Mapped[Decimal] = mapped_column(Numeric(12, 2))

    apartment: Mapped[Apartment] = relationship(back_populates="invoices")
    lines: Mapped[list[InvoiceLine]] = relationship(
        back_populates="invoice",
        cascade="all, delete-orphan",
    )


class InvoiceLine(Base):
    __tablename__ = "invoice_lines"

    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(
        ForeignKey("invoices.id", ondelete="CASCADE"),
        index=True,
    )
    service_id: Mapped[int] = mapped_column(
        ForeignKey("services.id", ondelete="RESTRICT"),
        index=True,
    )
    service_name: Mapped[str] = mapped_column(String(200))
    prev_reading: Mapped[Decimal | None] = mapped_column(Numeric(14, 3))
    curr_reading: Mapped[Decimal | None] = mapped_column(Numeric(14, 3))
    consumed: Mapped[Decimal | None] = mapped_column(Numeric(14, 3))
    tariff_value: Mapped[Decimal] = mapped_column(Numeric(12, 5))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))

    invoice: Mapped[Invoice] = relationship(back_populates="lines")
    service: Mapped[Service] = relationship(back_populates="invoice_lines")


class ExchangeRate(Base):
    __tablename__ = "exchange_rates"
    __table_args__ = (
        UniqueConstraint("date", "currency", name="uq_exchange_rates_date_currency"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    currency: Mapped[str] = mapped_column(String(3))
    rate: Mapped[Decimal] = mapped_column(Numeric(12, 6))


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(100), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[Any] = mapped_column(JSON)
