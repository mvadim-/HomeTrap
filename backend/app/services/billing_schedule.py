from __future__ import annotations

from calendar import monthrange
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select, tuple_
from sqlalchemy.orm import Session

from app.models import Apartment, Invoice, Tenant


@dataclass(frozen=True)
class BillingScheduleEntry:
    apartment: Apartment
    tenant: Tenant
    billing_day: int
    next_billing_date: date
    period: date
    invoice_exists: bool
    invoice_status: str | None


def _date_for_billing_day(year: int, month: int, billing_day: int) -> date:
    last_day = monthrange(year, month)[1]
    return date(year, month, min(billing_day, last_day))


def _next_billing_date(today: date, billing_day: int) -> date:
    candidate = _date_for_billing_day(today.year, today.month, billing_day)
    if candidate >= today:
        return candidate

    if today.month == 12:
        return _date_for_billing_day(today.year + 1, 1, billing_day)
    return _date_for_billing_day(today.year, today.month + 1, billing_day)


def compute_billing_schedule(
    session: Session,
    today: date,
) -> list[BillingScheduleEntry]:
    rows = session.execute(
        select(Apartment, Tenant)
        .join(Tenant, Tenant.apartment_id == Apartment.id)
        .where(
            Apartment.is_active.is_(True),
            Tenant.contract_start <= today,
            (Tenant.contract_end.is_(None) | (Tenant.contract_end >= today)),
        )
        .order_by(
            Apartment.name,
            Apartment.id,
            Tenant.contract_start.desc(),
            Tenant.id.desc(),
        )
    ).all()

    pending: list[tuple[Apartment, Tenant, int, date, date]] = []
    seen_apartments: set[int] = set()
    for apartment, tenant in rows:
        if apartment.id in seen_apartments:
            continue
        seen_apartments.add(apartment.id)
        billing_day = tenant.billing_day or tenant.contract_start.day
        next_billing_date = _next_billing_date(today, billing_day)
        period = next_billing_date.replace(day=1)
        pending.append((apartment, tenant, billing_day, next_billing_date, period))

    invoice_by_apartment_period: dict[tuple[int, date], Invoice] = {}
    invoice_keys = [(apartment.id, period) for apartment, _, _, _, period in pending]
    if invoice_keys:
        invoices = session.scalars(
            select(Invoice).where(
                tuple_(Invoice.apartment_id, Invoice.period).in_(invoice_keys)
            )
        ).all()
        invoice_by_apartment_period = {
            (invoice.apartment_id, invoice.period): invoice for invoice in invoices
        }

    result: list[BillingScheduleEntry] = []
    for apartment, tenant, billing_day, next_billing_date, period in pending:
        invoice = invoice_by_apartment_period.get((apartment.id, period))
        result.append(
            BillingScheduleEntry(
                apartment=apartment,
                tenant=tenant,
                billing_day=billing_day,
                next_billing_date=next_billing_date,
                period=period,
                invoice_exists=invoice is not None,
                invoice_status=invoice.status if invoice is not None else None,
            )
        )
    return result
