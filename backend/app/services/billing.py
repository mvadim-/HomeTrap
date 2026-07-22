from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import NotRequired, TypedDict

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session, selectinload

from app.db import get_tariff_for_period
from app.models import (
    Apartment,
    Expense,
    ExpenseCategory,
    Invoice,
    InvoiceLine,
    InvoiceStatus,
    Service,
    ServiceKind,
    Tariff,
)

MONEY_QUANTUM = Decimal("0.01")
ANOMALY_THRESHOLD = Decimal("0.50")
HISTORY_MONTHS = 6
EXPENSE_CATEGORIES = {item.value for item in ExpenseCategory}


class AdjustmentData(TypedDict):
    id: NotRequired[int | None]
    label: str
    amount: Decimal
    record_as_expense: bool
    category: NotRequired[ExpenseCategory | str | None]


class BillingError(RuntimeError):
    """Raised when invoice data cannot produce a valid draft."""


class BillingNotFoundError(BillingError):
    pass


class BillingValidationError(BillingError):
    pass


class BillingConflictError(BillingError):
    pass


class InvoiceChronologyError(BillingConflictError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def money(value: Decimal) -> Decimal:
    return value.quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)


def _tariff_for_period(session: Session, service_id: int, period: date) -> Tariff:
    tariff = get_tariff_for_period(session, service_id, period)
    if tariff is None:
        raise BillingValidationError(
            f"Service {service_id} has no tariff for {period.isoformat()}"
        )
    return tariff


def serialize_invoice_mutations(session: Session, apartment_id: int) -> None:
    """Serialize invoice mutations with a SQLite write reservation."""
    result = session.execute(
        update(Apartment)
        .where(Apartment.id == apartment_id)
        .values(id=Apartment.id)
    )
    if result.rowcount == 0:
        raise BillingNotFoundError("Apartment not found")


def _locked_invoice(session: Session, invoice_id: int) -> Invoice:
    apartment_id = session.scalar(
        select(Invoice.apartment_id).where(Invoice.id == invoice_id)
    )
    if apartment_id is None:
        raise BillingNotFoundError("Invoice not found")
    serialize_invoice_mutations(session, apartment_id)
    invoice = session.scalar(
        select(Invoice)
        .options(selectinload(Invoice.lines).selectinload(InvoiceLine.expense))
        .execution_options(populate_existing=True)
        .where(Invoice.id == invoice_id)
    )
    if invoice is None:
        raise BillingNotFoundError("Invoice not found")
    return invoice


def _previous_readings(
    session: Session,
    apartment_id: int,
    period: date,
) -> dict[int, Decimal | None]:
    rows = session.execute(
        select(InvoiceLine.service_id, InvoiceLine.curr_reading)
        .join(Invoice)
        .where(
            Invoice.apartment_id == apartment_id,
            Invoice.period < period,
            InvoiceLine.curr_reading.is_not(None),
        )
        .order_by(Invoice.period.desc(), InvoiceLine.id.desc())
    ).all()
    previous: dict[int, Decimal | None] = {}
    for service_id, current_reading in rows:
        previous.setdefault(service_id, current_reading)
    return previous


def create_draft(
    session: Session,
    apartment: Apartment,
    period: date,
    exchange_rate: Decimal,
) -> Invoice:
    if period.day != 1:
        raise BillingValidationError("Invoice period must be the first day of a month")
    serialize_invoice_mutations(session, apartment.id)
    validate_invoice_chronology(session, apartment.id, period)

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
                service_kind=service.kind,
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
    adjustments = Decimal("0.00")
    for line in invoice.lines:
        if line.service_kind == ServiceKind.ADJUSTMENT.value:
            adjustments += line.amount
            continue
        if line.service_kind == ServiceKind.METERED.value:
            if line.prev_reading is not None and line.curr_reading is not None:
                line.consumed = line.curr_reading - line.prev_reading
                line.amount = money(line.consumed * line.tariff_value)
            else:
                line.consumed = None
                line.amount = Decimal("0.00")
        utilities += line.amount
    invoice.rent_amount_uah = money(invoice.rent_amount_usd * invoice.exchange_rate)
    invoice.utilities_total = money(utilities)
    invoice.adjustments_total = money(adjustments)
    invoice.grand_total = money(
        invoice.rent_amount_uah
        + invoice.utilities_total
        + invoice.adjustments_total
    )


def _sync_adjustment_expense(
    session: Session,
    invoice: Invoice,
    line: InvoiceLine,
    *,
    record_as_expense: bool,
    category: str | None,
) -> None:
    if not record_as_expense:
        if line.expense is not None:
            session.delete(line.expense)
        return

    if category is None:
        raise BillingValidationError("Expense category is required")

    if line.expense is None:
        session.flush()
        line.expense = Expense(
            apartment_id=invoice.apartment_id,
            invoice_line_id=line.id,
            date=invoice.period,
            category=category,
            amount=money(abs(line.amount)),
            currency="UAH",
        )
        return

    line.expense.apartment_id = invoice.apartment_id
    line.expense.date = invoice.period
    line.expense.category = category
    line.expense.amount = money(abs(line.amount))
    line.expense.currency = "UAH"


def _sync_adjustments(
    session: Session,
    invoice: Invoice,
    adjustments: list[AdjustmentData],
) -> None:
    existing = {
        line.id: line
        for line in invoice.lines
        if line.service_kind == ServiceKind.ADJUSTMENT.value
    }
    normalized: list[tuple[int | None, str, Decimal, bool, str | None]] = []
    for item in adjustments:
        label = item["label"].strip()
        if not label:
            raise BillingValidationError("Adjustment label is required")
        amount = money(item["amount"])
        category_value = item.get("category")
        category = (
            category_value.value
            if isinstance(category_value, ExpenseCategory)
            else category_value
        )
        record_as_expense = item["record_as_expense"]
        if record_as_expense and amount >= 0:
            raise BillingValidationError(
                "Only a negative adjustment can be recorded as an expense"
            )
        if record_as_expense and category is None:
            raise BillingValidationError("Expense category is required")
        if category is not None and category not in EXPENSE_CATEGORIES:
            raise BillingValidationError(f"Invalid expense category: {category}")
        normalized.append(
            (item.get("id"), label, amount, record_as_expense, category)
        )

    requested_ids = [line_id for line_id, *_ in normalized if line_id is not None]
    if len(requested_ids) != len(set(requested_ids)):
        raise BillingValidationError("Adjustment line ids must be unique")
    unknown_ids = set(requested_ids) - existing.keys()
    if unknown_ids:
        raise BillingValidationError(
            f"Adjustment line {min(unknown_ids)} was not found"
        )

    for line_id, label, amount, record_as_expense, category in normalized:
        if line_id is None:
            line = InvoiceLine(
                service_id=None,
                service_name=label,
                service_kind=ServiceKind.ADJUSTMENT.value,
                prev_reading=None,
                curr_reading=None,
                consumed=None,
                tariff_value=Decimal("0"),
                amount=amount,
            )
            invoice.lines.append(line)
        else:
            line = existing[line_id]
            line.service_name = label
            line.amount = amount
        _sync_adjustment_expense(
            session,
            invoice,
            line,
            record_as_expense=record_as_expense,
            category=category,
        )

    retained_ids = set(requested_ids)
    for line_id, line in existing.items():
        if line_id not in retained_ids:
            invoice.lines.remove(line)


def update_draft(
    session: Session,
    invoice_id: int,
    exchange_rate: Decimal | None,
    readings: dict[int, Decimal | None],
    adjustments: list[AdjustmentData] | None = None,
) -> Invoice:
    invoice = _locked_invoice(session, invoice_id)
    if invoice.status != "draft":
        raise BillingConflictError("Only draft invoices can be edited")
    validate_invoice_chronology(
        session,
        invoice.apartment_id,
        invoice.period,
        reject_earlier_draft=False,
    )
    lines_by_id = {line.id: line for line in invoice.lines}
    unknown_ids = readings.keys() - lines_by_id.keys()
    if unknown_ids:
        raise BillingValidationError(f"Invoice line {min(unknown_ids)} was not found")

    if exchange_rate is not None:
        invoice.exchange_rate = exchange_rate
    for line_id, current in readings.items():
        line = lines_by_id[line_id]
        if line.service_kind != ServiceKind.METERED.value:
            raise BillingValidationError(f"Invoice line {line_id} is not metered")
        line.curr_reading = current
    if adjustments is not None:
        _sync_adjustments(session, invoice, adjustments)
    recalculate(invoice)
    session.commit()
    return get_invoice(session, invoice.id)


def delete_draft(session: Session, invoice_id: int) -> None:
    invoice = _locked_invoice(session, invoice_id)
    if invoice.status != InvoiceStatus.DRAFT.value:
        raise BillingConflictError("Only draft invoices can be deleted")
    session.execute(
        delete(Invoice).where(
            Invoice.id == invoice.id,
            Invoice.status == InvoiceStatus.DRAFT.value,
        )
    )
    session.commit()


def get_invoice(session: Session, invoice_id: int) -> Invoice:
    invoice = session.scalar(
        select(Invoice)
        .options(selectinload(Invoice.lines).selectinload(InvoiceLine.expense))
        .where(Invoice.id == invoice_id)
    )
    if invoice is None:
        raise BillingNotFoundError("Invoice not found")
    return invoice


def list_invoices(
    session: Session,
    apartment_id: int | None = None,
    invoice_status: InvoiceStatus | None = None,
    period: date | None = None,
) -> list[Invoice]:
    query = select(Invoice)
    if apartment_id is not None:
        query = query.where(Invoice.apartment_id == apartment_id)
    if invoice_status is not None:
        query = query.where(Invoice.status == invoice_status.value)
    if period is not None:
        query = query.where(Invoice.period == period)
    return list(session.scalars(query.order_by(Invoice.period.desc(), Invoice.id.desc())))


def transition_invoice(session: Session, invoice_id: int, action: str) -> Invoice:
    invoice = _locked_invoice(session, invoice_id)
    now = datetime.now(UTC)
    if action == "issue" and invoice.status == InvoiceStatus.DRAFT.value:
        missing_reading = next(
            (
                line
                for line in invoice.lines
                if line.service_kind == ServiceKind.METERED.value
                and line.curr_reading is None
            ),
            None,
        )
        if missing_reading is not None:
            raise BillingConflictError(
                f"Current reading is required for {missing_reading.service_name} before issue"
            )
        recalculate(invoice)
        invoice.status = InvoiceStatus.ISSUED.value
        invoice.issued_at = now
    elif action == "revert-to-draft" and invoice.status == InvoiceStatus.ISSUED.value:
        validate_invoice_chronology(
            session,
            invoice.apartment_id,
            invoice.period,
            reject_earlier_draft=False,
        )
        invoice.status = InvoiceStatus.DRAFT.value
        invoice.issued_at = None
    elif action == "mark-paid" and invoice.status == InvoiceStatus.ISSUED.value:
        invoice.status = InvoiceStatus.PAID.value
        invoice.paid_at = now
    elif action == "unmark-paid" and invoice.status == InvoiceStatus.PAID.value:
        invoice.status = InvoiceStatus.ISSUED.value
        invoice.paid_at = None
    else:
        raise BillingConflictError(
            f"Cannot {action} invoice with status {invoice.status}"
        )
    session.commit()
    return get_invoice(session, invoice.id)


def validate_invoice_chronology(
    session: Session,
    apartment_id: int,
    period: date,
    *,
    reject_later: bool = True,
    reject_earlier_draft: bool = True,
) -> None:
    if reject_later:
        later_id = session.scalar(
            select(Invoice.id)
            .where(
                Invoice.apartment_id == apartment_id,
                Invoice.period > period,
            )
            .limit(1)
        )
        if later_id is not None:
            raise InvoiceChronologyError(
                "later_invoice",
                "An older invoice cannot be changed after a later invoice exists",
            )
    if reject_earlier_draft:
        earlier_draft_id = session.scalar(
            select(Invoice.id)
            .where(
                Invoice.apartment_id == apartment_id,
                Invoice.period < period,
                Invoice.status == InvoiceStatus.DRAFT.value,
            )
            .limit(1)
        )
        if earlier_draft_id is not None:
            raise InvoiceChronologyError(
                "earlier_draft",
                "An earlier draft invoice must be completed before creating a later invoice",
            )


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
    lines = [
        {
            "id": line.id,
            "service_id": line.service_id,
            "service_name": line.service_name,
            "kind": line.service_kind,
            "service_kind": line.service_kind,
            "prev_reading": line.prev_reading,
            "curr_reading": line.curr_reading,
            "consumed": line.consumed,
            "tariff_value": line.tariff_value,
            "amount": line.amount,
            "expense": (
                {"id": line.expense.id, "category": line.expense.category}
                if line.expense is not None
                else None
            ),
        }
        for line in invoice.lines
    ]
    return {
        "id": invoice.id,
        "apartment_id": invoice.apartment_id,
        "period": invoice.period,
        "status": invoice.status,
        "issued_at": invoice.issued_at,
        "paid_at": invoice.paid_at,
        "exchange_rate": invoice.exchange_rate,
        "rent_amount_usd": invoice.rent_amount_usd,
        "rent_amount_uah": invoice.rent_amount_uah,
        "utilities_total": invoice.utilities_total,
        "adjustments_total": invoice.adjustments_total,
        "grand_total": invoice.grand_total,
        "lines": lines,
        "warnings": warnings_for(session, invoice),
    }
