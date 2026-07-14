from __future__ import annotations

from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Apartment, Invoice, InvoiceLine, Service, ServiceKind, Tariff

MONEY_QUANTUM = Decimal("0.01")
ANOMALY_THRESHOLD = Decimal("0.50")
HISTORY_MONTHS = 6


class BillingError(RuntimeError):
    """Raised when invoice data cannot produce a valid draft."""


def money(value: Decimal) -> Decimal:
    return value.quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)


def _tariff_for_period(session: Session, service_id: int, period: date) -> Tariff:
    tariff = session.scalar(
        select(Tariff)
        .where(Tariff.service_id == service_id, Tariff.valid_from <= period)
        .order_by(Tariff.valid_from.desc())
        .limit(1)
    )
    if tariff is None:
        raise BillingError(f"Service {service_id} has no tariff for {period.isoformat()}")
    return tariff


def _previous_readings(
    session: Session,
    apartment_id: int,
    period: date,
) -> dict[int, Decimal | None]:
    previous_invoice = session.scalar(
        select(Invoice)
        .options(selectinload(Invoice.lines))
        .where(Invoice.apartment_id == apartment_id, Invoice.period < period)
        .order_by(Invoice.period.desc())
        .limit(1)
    )
    if previous_invoice is None:
        return {}
    return {line.service_id: line.curr_reading for line in previous_invoice.lines}


def create_draft(
    session: Session,
    apartment: Apartment,
    period: date,
    exchange_rate: Decimal,
) -> Invoice:
    if period.day != 1:
        raise BillingError("Invoice period must be the first day of a month")

    previous = _previous_readings(session, apartment.id, period)
    services = session.scalars(
        select(Service)
        .where(Service.apartment_id == apartment.id, Service.is_active.is_(True))
        .order_by(Service.sort_order, Service.id)
    ).all()
    invoice = Invoice(
        apartment_id=apartment.id,
        period=period,
        exchange_rate=exchange_rate,
        rent_amount_usd=apartment.rent_amount,
        rent_amount_uah=money(apartment.rent_amount * exchange_rate),
        utilities_total=Decimal("0.00"),
        grand_total=Decimal("0.00"),
    )
    session.add(invoice)
    for service in services:
        tariff = _tariff_for_period(session, service.id, period)
        is_metered = service.kind == ServiceKind.METERED.value
        invoice.lines.append(
            InvoiceLine(
                service=service,
                service_name=service.name,
                prev_reading=previous.get(service.id) if is_metered else None,
                curr_reading=None,
                consumed=None,
                tariff_value=tariff.value,
                amount=Decimal("0.00") if is_metered else money(tariff.value),
            )
        )
    recalculate(invoice)
    session.commit()
    return get_invoice(session, invoice.id)


def recalculate(invoice: Invoice) -> None:
    utilities = Decimal("0.00")
    for line in invoice.lines:
        if line.service.kind == ServiceKind.METERED.value:
            if line.prev_reading is not None and line.curr_reading is not None:
                line.consumed = line.curr_reading - line.prev_reading
                line.amount = money(line.consumed * line.tariff_value)
            else:
                line.consumed = None
                line.amount = Decimal("0.00")
        utilities += line.amount
    invoice.rent_amount_uah = money(invoice.rent_amount_usd * invoice.exchange_rate)
    invoice.utilities_total = money(utilities)
    invoice.grand_total = money(invoice.rent_amount_uah + invoice.utilities_total)


def update_draft(
    session: Session,
    invoice: Invoice,
    exchange_rate: Decimal | None,
    readings: dict[int, Decimal | None],
) -> Invoice:
    if invoice.status != "draft":
        raise BillingError("Only draft invoices can be edited")
    lines_by_id = {line.id: line for line in invoice.lines}
    unknown_ids = readings.keys() - lines_by_id.keys()
    if unknown_ids:
        raise BillingError(f"Invoice line {min(unknown_ids)} was not found")

    if exchange_rate is not None:
        invoice.exchange_rate = exchange_rate
    for line_id, current in readings.items():
        line = lines_by_id[line_id]
        if line.service.kind != ServiceKind.METERED.value:
            raise BillingError(f"Invoice line {line_id} is not metered")
        line.curr_reading = current
    recalculate(invoice)
    session.commit()
    return get_invoice(session, invoice.id)


def get_invoice(session: Session, invoice_id: int) -> Invoice:
    invoice = session.scalar(
        select(Invoice)
        .options(selectinload(Invoice.lines))
        .where(Invoice.id == invoice_id)
    )
    if invoice is None:
        raise BillingError("Invoice not found")
    return invoice


def warnings_for(session: Session, invoice: Invoice) -> list[dict[str, object]]:
    warnings: list[dict[str, object]] = []
    for line in invoice.lines:
        if line.curr_reading is None or line.prev_reading is None:
            continue
        if line.curr_reading < line.prev_reading:
            warnings.append(
                {
                    "code": "reading_decreased",
                    "service_id": line.service_id,
                    "message": f"{line.service_name}: current reading is below previous",
                }
            )

        history = session.scalars(
            select(InvoiceLine)
            .join(Invoice)
            .where(
                InvoiceLine.service_id == line.service_id,
                Invoice.period < invoice.period,
                InvoiceLine.consumed.is_not(None),
            )
            .order_by(Invoice.period.desc())
            .limit(HISTORY_MONTHS)
        ).all()
        values = [item.consumed for item in history if item.consumed is not None]
        if not values:
            continue
        average = sum(values, Decimal("0")) / len(values)
        if average > 0 and abs(line.consumed - average) / average > ANOMALY_THRESHOLD:
            warnings.append(
                {
                    "code": "consumption_anomaly",
                    "service_id": line.service_id,
                    "message": (
                        f"{line.service_name}: consumption differs from the "
                        "six-month average by more than 50%"
                    ),
                }
            )
    return warnings


def invoice_response(session: Session, invoice: Invoice) -> dict[str, object]:
    return {
        "id": invoice.id,
        "apartment_id": invoice.apartment_id,
        "period": invoice.period,
        "status": invoice.status,
        "exchange_rate": invoice.exchange_rate,
        "rent_amount_usd": invoice.rent_amount_usd,
        "rent_amount_uah": invoice.rent_amount_uah,
        "utilities_total": invoice.utilities_total,
        "grand_total": invoice.grand_total,
        "lines": invoice.lines,
        "warnings": warnings_for(session, invoice),
    }
