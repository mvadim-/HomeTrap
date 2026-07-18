from __future__ import annotations

from calendar import monthrange
from dataclasses import dataclass
from datetime import date, timedelta
import logging
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Apartment, Invoice, Tenant

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from app.services.notify import NotificationResult, NotificationSender


@dataclass(frozen=True)
class BillingScheduleEntry:
    apartment: Apartment
    tenant: Tenant
    billing_day: int
    billing_date: date
    period: date
    invoice_exists: bool
    invoice_status: str | None
    is_overdue: bool


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


def _next_month(period: date) -> date:
    if period.month == 12:
        return date(period.year + 1, 1, 1)
    return date(period.year, period.month + 1, 1)


def _billing_dates(
    tenant: Tenant,
    billing_day: int,
    last_date: date,
) -> list[date]:
    period = tenant.contract_start.replace(day=1)
    dates: list[date] = []
    while period <= last_date.replace(day=1):
        billing_date = _date_for_billing_day(period.year, period.month, billing_day)
        if billing_date >= tenant.contract_start:
            dates.append(billing_date)
        period = _next_month(period)
    return dates


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

    pending: list[tuple[Apartment, Tenant, int, list[date], date]] = []
    seen_apartments: set[int] = set()
    for apartment, tenant in rows:
        if apartment.id in seen_apartments:
            continue
        seen_apartments.add(apartment.id)
        billing_day = tenant.billing_day or tenant.contract_start.day
        next_billing_date = _next_billing_date(today, billing_day)
        billing_dates = _billing_dates(tenant, billing_day, next_billing_date)
        pending.append(
            (apartment, tenant, billing_day, billing_dates, next_billing_date)
        )

    invoice_by_apartment_period: dict[tuple[int, date], Invoice] = {}
    invoice_keys: set[tuple[int, date]] = set()
    for apartment, _, _, billing_dates, _ in pending:
        invoice_keys.update(
            (apartment.id, billing_date.replace(day=1))
            for billing_date in billing_dates
        )
    if invoice_keys:
        apartment_ids = {apartment_id for apartment_id, _ in invoice_keys}
        periods = {period for _, period in invoice_keys}
        invoices = session.scalars(
            select(Invoice).where(
                Invoice.apartment_id.in_(apartment_ids),
                Invoice.period >= min(periods),
                Invoice.period <= max(periods),
            )
        ).all()
        invoice_by_apartment_period = {
            (invoice.apartment_id, invoice.period): invoice
            for invoice in invoices
            if (invoice.apartment_id, invoice.period) in invoice_keys
        }

    result: list[BillingScheduleEntry] = []
    for apartment, tenant, billing_day, billing_dates, next_billing_date in pending:
        for billing_date in billing_dates:
            period = billing_date.replace(day=1)
            invoice = invoice_by_apartment_period.get((apartment.id, period))
            is_overdue = billing_date < today and invoice is None
            if not is_overdue and billing_date != next_billing_date:
                continue
            result.append(
                BillingScheduleEntry(
                    apartment=apartment,
                    tenant=tenant,
                    billing_day=billing_day,
                    billing_date=billing_date,
                    period=period,
                    invoice_exists=invoice is not None,
                    invoice_status=invoice.status if invoice is not None else None,
                    is_overdue=is_overdue,
                )
            )
    return result


def send_billing_reminders(
    session: Session,
    today: date,
    settings: dict,
    senders: list[NotificationSender],
    history: dict[str, str],
) -> NotificationResult:
    from app.services.notify import NotificationResult

    result = NotificationResult()
    window_delta = timedelta(days=settings["days_before"])
    repeat_every_days = settings["repeat_every_days"]

    for entry in compute_billing_schedule(session, today):
        if entry.invoice_exists:
            continue
        if today == entry.billing_date:
            if settings["auto_draft"]:
                _create_draft_and_notify(
                    session,
                    today,
                    entry,
                    senders,
                    history,
                    result,
                )
            else:
                _send_manual_billing_reminder(entry, senders, history, today, result)
            continue
        if not entry.billing_date - window_delta <= today < entry.billing_date:
            continue

        key = f"billing:{entry.apartment.id}:{entry.period}"
        last_delivery = history.get(key)
        if last_delivery is not None:
            days_since_delivery = (today - date.fromisoformat(last_delivery)).days
            if days_since_delivery < repeat_every_days:
                continue

        _send_manual_billing_reminder(entry, senders, history, today, result)

    return result


def _create_draft_and_notify(
    session: Session,
    today: date,
    entry: BillingScheduleEntry,
    senders: list[NotificationSender],
    history: dict[str, str],
    result: NotificationResult,
) -> None:
    from app.services import billing, nbu
    from app.services.billing import BillingValidationError, InvoiceChronologyError
    from app.services.nbu import NbuRateUnavailable
    from app.services.notify import send_notification

    key = f"billing_draft:{entry.apartment.id}:{entry.period}"
    if key in history:
        return

    try:
        rate = nbu.get_rate(session, today).rate
        billing.create_draft(session, entry.apartment, entry.period, rate)
    except (BillingValidationError, InvoiceChronologyError, NbuRateUnavailable) as error:
        session.rollback()
        logger.warning(
            "Automatic billing draft failed for apartment %s and period %s: %s",
            entry.apartment.id,
            entry.period,
            error,
        )
        subject = "Не вдалося створити чернетку рахунка"
        message = (
            f"Створіть рахунок вручну для квартири «{entry.apartment.name}» "
            f"за {entry.period:%m.%Y}: {error}."
        )
    else:
        history[key] = today.isoformat()
        subject = "Чернетку рахунка створено"
        message = (
            f"Чернетку рахунка для квартири «{entry.apartment.name}» "
            f"за {entry.period:%m.%Y} створено автоматично."
        )

    delivery = send_notification(senders, subject, message)
    result.notifications += delivery.notifications
    result.deliveries += delivery.deliveries
    result.errors.extend(delivery.errors)


def _send_manual_billing_reminder(
    entry: BillingScheduleEntry,
    senders: list[NotificationSender],
    history: dict[str, str],
    today: date,
    result: NotificationResult,
) -> None:
    from app.services.notify import send_notification

    delivery = send_notification(
        senders,
        "Нагадування про виставлення рахунка",
        (
            f"Виставте рахунок для квартири «{entry.apartment.name}» "
            f"за {entry.period:%m.%Y} до {entry.billing_date:%d.%m.%Y}."
        ),
    )
    result.notifications += delivery.notifications
    result.deliveries += delivery.deliveries
    result.errors.extend(delivery.errors)
    if delivery.deliveries:
        history[f"billing:{entry.apartment.id}:{entry.period}"] = today.isoformat()
