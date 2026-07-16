from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.auth import get_db, require_auth
from app.models import Apartment, Invoice, InvoiceLine, InvoiceStatus, Service, ServiceKind
from app.schemas import ConsumptionStats, DashboardStats, IncomeStats

router = APIRouter(
    prefix="/api/stats",
    tags=["stats"],
    dependencies=[Depends(require_auth)],
)

ZERO = Decimal("0.00")
KYIV_TIMEZONE = ZoneInfo("Europe/Kyiv")


def _today() -> date:
    return datetime.now(KYIV_TIMEZONE).date()


def _month_start(value: date) -> date:
    return value.replace(day=1)


def _shift_month(value: date, offset: int) -> date:
    month_index = value.year * 12 + value.month - 1 + offset
    return date(month_index // 12, month_index % 12 + 1, 1)


def _period_start(months: int) -> date:
    return _shift_month(_month_start(_today()), 1 - months)


def _resolve_period(
    months: int | None,
    date_from: date | None,
    date_to: date | None,
    all_time: bool,
) -> tuple[date | None, date, int | None]:
    has_dates = date_from is not None or date_to is not None
    if months is not None and (has_dates or all_time):
        raise HTTPException(status_code=422, detail="Period modes cannot be combined")
    if all_time and has_dates:
        raise HTTPException(status_code=422, detail="Period modes cannot be combined")
    if (date_from is None) != (date_to is None):
        raise HTTPException(
            status_code=422,
            detail="date_from and date_to must be provided together",
        )
    if date_from is not None and (
        date_from.day != 1 or date_to is None or date_to.day != 1
    ):
        raise HTTPException(
            status_code=422,
            detail="date_from and date_to must be the first day of a month",
        )
    if date_from is not None and date_to is not None and date_from > date_to:
        raise HTTPException(status_code=422, detail="date_from must not exceed date_to")

    if all_time:
        return None, _month_start(_today()), None
    if date_from is not None and date_to is not None:
        return date_from, date_to, None

    effective_months = months if months is not None else 12
    return _period_start(effective_months), _month_start(_today()), effective_months


def _require_apartment(session: Session, apartment_id: int) -> None:
    if session.get(Apartment, apartment_id) is None:
        raise HTTPException(status_code=404, detail="Apartment not found")


@router.get("/consumption", response_model=ConsumptionStats)
def consumption_stats(
    apartment_id: int,
    months: int | None = Query(default=None, ge=1, le=120),
    date_from: date | None = None,
    date_to: date | None = None,
    all_time: bool = False,
    session: Session = Depends(get_db),
) -> dict[str, object]:
    _require_apartment(session, apartment_id)
    period_start, period_end, response_months = _resolve_period(
        months, date_from, date_to, all_time
    )
    query = (
        select(
            Service.id,
            Service.name,
            Service.unit,
            Invoice.period,
            InvoiceLine.consumed,
        )
        .join(InvoiceLine, InvoiceLine.service_id == Service.id)
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .where(
            Service.apartment_id == apartment_id,
            InvoiceLine.service_kind == ServiceKind.METERED.value,
            Invoice.status.in_([InvoiceStatus.ISSUED.value, InvoiceStatus.PAID.value]),
            Invoice.period <= period_end,
            InvoiceLine.consumed.is_not(None),
        )
        .order_by(Service.sort_order, Service.id, Invoice.period)
    )
    if period_start is not None:
        query = query.where(Invoice.period >= period_start)
    rows = session.execute(query).all()

    series: dict[int, dict[str, object]] = {}
    for service_id, name, unit, period, consumed in rows:
        item = series.setdefault(
            service_id,
            {
                "service_id": service_id,
                "service_name": name,
                "unit": unit,
                "values": [],
            },
        )
        item["values"].append({"period": period, "consumed": consumed})
    return {
        "apartment_id": apartment_id,
        "months": response_months,
        "series": list(series.values()),
    }


@router.get("/income", response_model=IncomeStats)
def income_stats(
    apartment_id: int | None = None,
    months: int | None = Query(default=None, ge=1, le=120),
    date_from: date | None = None,
    date_to: date | None = None,
    all_time: bool = False,
    session: Session = Depends(get_db),
) -> dict[str, object]:
    if apartment_id is not None:
        _require_apartment(session, apartment_id)

    period_start, period_end, response_months = _resolve_period(
        months, date_from, date_to, all_time
    )
    query = select(Invoice).options(selectinload(Invoice.lines)).where(
        Invoice.period <= _month_start(_today()),
        Invoice.status.in_([InvoiceStatus.ISSUED.value, InvoiceStatus.PAID.value]),
    )
    query = query.where(Invoice.period <= period_end)
    if period_start is not None:
        query = query.where(Invoice.period >= period_start)
    if apartment_id is not None:
        query = query.where(Invoice.apartment_id == apartment_id)
    invoices = session.scalars(query.order_by(Invoice.period, Invoice.id)).all()

    monthly: dict[date, dict[str, Decimal | date]] = {}
    totals = {"rent": ZERO, "utilities": ZERO, "total": ZERO}
    service_totals: dict[str, Decimal] = {}
    service_monthly: dict[str, dict[date, Decimal]] = {}
    for invoice in invoices:
        point = monthly.setdefault(
            invoice.period,
            {"period": invoice.period, "rent": ZERO, "utilities": ZERO, "total": ZERO},
        )
        point["rent"] += invoice.rent_amount_uah
        point["utilities"] += invoice.utilities_total
        point["total"] += invoice.grand_total
        totals["rent"] += invoice.rent_amount_uah
        totals["utilities"] += invoice.utilities_total
        totals["total"] += invoice.grand_total
        for line in invoice.lines:
            service_totals[line.service_name] = (
                service_totals.get(line.service_name, ZERO) + line.amount
            )
            monthly_amounts = service_monthly.setdefault(line.service_name, {})
            monthly_amounts[invoice.period] = (
                monthly_amounts.get(invoice.period, ZERO) + line.amount
            )

    top_service = None
    if totals["utilities"] > ZERO and service_totals:
        top_name, top_amount = sorted(
            service_totals.items(), key=lambda item: (-item[1], item[0])
        )[0]
        peak_period = sorted(
            service_monthly[top_name].items(), key=lambda item: (-item[1], item[0])
        )[0][0]
        top_service = {
            "name": top_name,
            "share_percent": (top_amount * 100 / totals["utilities"]).quantize(
                Decimal("0.01")
            ),
            "peak_period": peak_period,
        }

    return {
        "scope": "apartment" if apartment_id is not None else "portfolio",
        "apartment_id": apartment_id,
        "months": response_months,
        "values": list(monthly.values()),
        "totals": totals,
        "top_service": top_service,
    }


@router.get("/dashboard", response_model=DashboardStats)
def dashboard_stats(session: Session = Depends(get_db)) -> dict[str, object]:
    current_period = _month_start(_today())
    invoices = session.scalars(
        select(Invoice).order_by(Invoice.period, Invoice.id)
    ).all()
    charged = sum(
        (
            item.grand_total
            for item in invoices
            if item.period == current_period
            and item.status in {InvoiceStatus.ISSUED.value, InvoiceStatus.PAID.value}
        ),
        ZERO,
    )
    paid = sum(
        (
            item.grand_total
            for item in invoices
            if item.period == current_period and item.status == InvoiceStatus.PAID.value
        ),
        ZERO,
    )
    outstanding = sum(
        (
            item.grand_total
            for item in invoices
            if item.status == InvoiceStatus.ISSUED.value
        ),
        ZERO,
    )

    attention = []
    for invoice in invoices:
        if invoice.status == InvoiceStatus.ISSUED.value:
            reason = "unpaid"
        elif invoice.status == InvoiceStatus.DRAFT.value and invoice.period <= current_period:
            reason = "draft"
        else:
            continue
        attention.append(
            {
                "invoice_id": invoice.id,
                "apartment_id": invoice.apartment_id,
                "apartment_name": invoice.apartment.name,
                "period": invoice.period,
                "status": invoice.status,
                "grand_total": invoice.grand_total,
                "reason": reason,
            }
        )

    return {
        "period": current_period,
        "charged": charged,
        "paid": paid,
        "outstanding": outstanding,
        "needs_attention": attention,
    }
