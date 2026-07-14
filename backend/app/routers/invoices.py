from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import get_db, require_auth
from app.models import Apartment, InvoiceStatus
from app.schemas import InvoiceCreate, InvoiceListItem, InvoiceResponse, InvoiceUpdate
from app.services.billing import (
    BillingError,
    BillingNotFoundError,
    BillingValidationError,
    create_draft,
    delete_draft,
    get_invoice,
    invoice_response,
    list_invoices,
    transition_invoice,
    update_draft,
)
from app.services.nbu import NbuRateUnavailable, get_rate

router = APIRouter(tags=["invoices"], dependencies=[Depends(require_auth)])


def _billing_http_error(error: BillingError) -> HTTPException:
    if isinstance(error, BillingNotFoundError):
        return HTTPException(status_code=404, detail=str(error))
    if isinstance(error, BillingValidationError):
        return HTTPException(status_code=422, detail=str(error))
    return HTTPException(status_code=409, detail=str(error))


@router.post(
    "/api/apartments/{apartment_id}/invoices",
    response_model=InvoiceResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_invoice(
    apartment_id: int,
    payload: InvoiceCreate,
    session: Session = Depends(get_db),
) -> dict[str, object]:
    apartment = session.get(Apartment, apartment_id)
    if apartment is None:
        raise HTTPException(status_code=404, detail="Apartment not found")
    try:
        rate = get_rate(session, payload.period)
        invoice = create_draft(session, apartment, payload.period, rate.rate)
    except NbuRateUnavailable as error:
        raise HTTPException(status_code=503, detail="NBU exchange rate is unavailable") from error
    except BillingError as error:
        raise _billing_http_error(error) from error
    except IntegrityError as error:
        session.rollback()
        raise HTTPException(
            status_code=409,
            detail="Invoice for this apartment and period already exists",
        ) from error
    return invoice_response(session, invoice)


@router.put("/api/invoices/{invoice_id}", response_model=InvoiceResponse)
def update_invoice(
    invoice_id: int,
    payload: InvoiceUpdate,
    session: Session = Depends(get_db),
) -> dict[str, object]:
    try:
        invoice = get_invoice(session, invoice_id)
    except BillingError as error:
        raise _billing_http_error(error) from error
    if invoice.status != "draft":
        raise HTTPException(status_code=409, detail="Only draft invoices can be edited")
    try:
        invoice = update_draft(
            session,
            invoice,
            payload.exchange_rate,
            {line.id: line.curr_reading for line in payload.lines},
        )
    except BillingError as error:
        raise _billing_http_error(error) from error
    return invoice_response(session, invoice)


@router.delete("/api/invoices/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_invoice(
    invoice_id: int,
    session: Session = Depends(get_db),
) -> None:
    try:
        delete_draft(session, get_invoice(session, invoice_id))
    except BillingError as error:
        raise _billing_http_error(error) from error


@router.get("/api/invoices", response_model=list[InvoiceListItem])
def invoice_list(
    apartment_id: int | None = None,
    invoice_status: InvoiceStatus | None = Query(default=None, alias="status"),
    period: date | None = None,
    session: Session = Depends(get_db),
) -> list[InvoiceListItem]:
    return list_invoices(session, apartment_id, invoice_status, period)


@router.get("/api/invoices/{invoice_id}", response_model=InvoiceResponse)
def invoice_detail(
    invoice_id: int,
    session: Session = Depends(get_db),
) -> dict[str, object]:
    try:
        invoice = get_invoice(session, invoice_id)
    except BillingError as error:
        raise _billing_http_error(error) from error
    return invoice_response(session, invoice)


@router.post("/api/invoices/{invoice_id}/{action}", response_model=InvoiceResponse)
def change_invoice_status(
    invoice_id: int,
    action: str,
    session: Session = Depends(get_db),
) -> dict[str, object]:
    if action not in {"issue", "revert-to-draft", "mark-paid", "unmark-paid"}:
        raise HTTPException(status_code=404, detail="Invoice action not found")
    try:
        invoice = transition_invoice(session, get_invoice(session, invoice_id), action)
    except BillingError as error:
        raise _billing_http_error(error) from error
    return invoice_response(session, invoice)
