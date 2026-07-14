from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import get_db, require_auth
from app.models import Apartment
from app.schemas import InvoiceCreate, InvoiceResponse, InvoiceUpdate
from app.services.billing import (
    BillingError,
    create_draft,
    get_invoice,
    invoice_response,
    update_draft,
)
from app.services.nbu import NbuRateUnavailable, get_rate

router = APIRouter(tags=["invoices"], dependencies=[Depends(require_auth)])


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
        raise HTTPException(status_code=409, detail=str(error)) from error
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
        raise HTTPException(status_code=404, detail="Invoice not found") from error
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
        raise HTTPException(status_code=422, detail=str(error)) from error
    return invoice_response(session, invoice)
