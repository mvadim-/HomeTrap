from __future__ import annotations

from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_db, require_auth
from app.models import Apartment, Invoice, InvoiceLine, InvoiceStatus, Service, ServiceKind
from app.schemas import ConsumptionStats, DashboardStats, IncomeStats

router = APIRouter(
    prefix="/api/stats",
    tags=["stats"],
    dependencies=[Depends(require_auth)],
)

ZERO = Decimal("0.00")


def _month_start(value: date) -> date:
    return value.replace(day=1)


def _shift_month(value: date, offset: int) -> date:
    month_index = value.year * 12 + value.month - 1 + offset
    return date(month_index // 12, month_index % 12 + 1, 1)


def _period_start(months: int) -> date:
    return _shift_month(_month_start(date.today()), 1 - months)


def _require_apartment(session: Session, apartment_id: int) -> None:
    if session.get(Apartment, apartment_id) is None:
        raise HTTPException(status_code=404, detail="Apartment not found")


@router.get("/consumption", response_model=ConsumptionStats)
def consumption_stats(
    apartment_id: int,
    months: int = Query(default=12, ge=1, le=120),
    session: Session = Depends(get_db),
) -> dict[str, object]:
    _require_apartment(session, apartment_id)
    rows = session.execute(
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
            Invoice.period >= _period_start(months),
            Invoice.period <= _month_start(date.today()),
            InvoiceLine.consumed.is_not(None),
        )
        .order_by(Service.sort_order, Service.id, Invoice.period)
    ).all()

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
    return {"apartment_id": apartment_id, "months": months, "series": list(series.values())}


@router.get("/income", response_model=IncomeStats)
def income_stats(
    apartment_id: int | None = None,
    months: int = Query(default=12, ge=1, le=120),
    session: Session = Depends(get_db),
) -> dict[str, object]:
    if apartment_id is not None:
        _require_apartment(session, apartment_id)

    query = select(Invoice).where(
        Invoice.period >= _period_start(months),
        Invoice.period <= _month_start(date.today()),
        Invoice.status.in_([InvoiceStatus.ISSUED.value, InvoiceStatus.PAID.value]),
    )
    if apartment_id is not None:
        query = query.where(Invoice.apartment_id == apartment_id)
    invoices = session.scalars(query.order_by(Invoice.period, Invoice.id)).all()

    monthly: dict[date, dict[str, Decimal | date]] = {}
    totals = {"rent": ZERO, "utilities": ZERO, "total": ZERO}
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

    return {
        "scope": "apartment" if apartment_id is not None else "portfolio",
        "apartment_id": apartment_id,
        "months": months,
        "values": list(monthly.values()),
        "totals": totals,
    }


@router.get("/dashboard", response_model=DashboardStats)
def dashboard_stats(session: Session = Depends(get_db)) -> dict[str, object]:
    current_period = _month_start(date.today())
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
