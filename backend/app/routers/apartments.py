from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import get_db, get_write_db, require_auth
from app.models import Apartment, Invoice, Tenant
from app.schemas import ApartmentCreate, ApartmentResponse, ApartmentUpdate

router = APIRouter(
    prefix="/api/apartments",
    tags=["apartments"],
    dependencies=[Depends(require_auth)],
)


def _get_apartment(session: Session, apartment_id: int) -> Apartment:
    apartment = session.get(Apartment, apartment_id)
    if apartment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Apartment not found",
        )
    return apartment


def _latest_invoices(session: Session, apartment_ids: list[int]) -> dict[int, Invoice]:
    if not apartment_ids:
        return {}
    latest_periods = (
        select(
            Invoice.apartment_id,
            func.max(Invoice.period).label("latest_period"),
        )
        .where(Invoice.apartment_id.in_(apartment_ids))
        .group_by(Invoice.apartment_id)
        .subquery()
    )
    invoices = session.scalars(
        select(Invoice).join(
            latest_periods,
            (Invoice.apartment_id == latest_periods.c.apartment_id)
            & (Invoice.period == latest_periods.c.latest_period),
        )
    ).all()
    return {invoice.apartment_id: invoice for invoice in invoices}


def _current_tenant_names(
    session: Session,
    apartment_ids: list[int],
) -> dict[int, str]:
    if not apartment_ids:
        return {}
    rows = session.execute(
        select(Tenant.apartment_id, Tenant.full_name).where(
            Tenant.apartment_id.in_(apartment_ids),
            Tenant.contract_end.is_(None),
        )
    ).all()
    return {apartment_id: full_name for apartment_id, full_name in rows}


def _apartment_response(
    apartment: Apartment,
    latest_invoice: Invoice | None,
    current_tenant_name: str | None = None,
) -> dict:
    return {
        "id": apartment.id,
        "name": apartment.name,
        "address": apartment.address,
        "rent_amount": apartment.rent_amount,
        "rent_currency": apartment.rent_currency,
        "notes": apartment.notes,
        "is_active": apartment.is_active,
        "latest_invoice": latest_invoice,
        "current_tenant_name": current_tenant_name,
    }


@router.get("", response_model=list[ApartmentResponse])
def list_apartments(
    session: Session = Depends(get_db),
) -> list[dict]:
    apartments = session.scalars(select(Apartment).order_by(Apartment.id)).all()
    apartment_ids = [apartment.id for apartment in apartments]
    latest = _latest_invoices(session, apartment_ids)
    tenant_names = _current_tenant_names(session, apartment_ids)
    return [
        _apartment_response(
            apartment,
            latest.get(apartment.id),
            tenant_names.get(apartment.id),
        )
        for apartment in apartments
    ]


@router.post("", response_model=ApartmentResponse, status_code=status.HTTP_201_CREATED)
def create_apartment(
    payload: ApartmentCreate,
    session: Session = Depends(get_write_db),
) -> dict:
    apartment = Apartment(**payload.model_dump())
    session.add(apartment)
    session.commit()
    return _apartment_response(apartment, None)


@router.get("/{apartment_id}", response_model=ApartmentResponse)
def get_apartment(
    apartment_id: int,
    session: Session = Depends(get_db),
) -> dict:
    apartment = _get_apartment(session, apartment_id)
    return _apartment_response(
        apartment,
        _latest_invoices(session, [apartment.id]).get(apartment.id),
        _current_tenant_names(session, [apartment.id]).get(apartment.id),
    )


@router.put("/{apartment_id}", response_model=ApartmentResponse)
def update_apartment(
    apartment_id: int,
    payload: ApartmentUpdate,
    session: Session = Depends(get_write_db),
) -> dict:
    apartment = _get_apartment(session, apartment_id)
    for field, value in payload.model_dump().items():
        setattr(apartment, field, value)
    session.commit()
    return _apartment_response(
        apartment,
        _latest_invoices(session, [apartment.id]).get(apartment.id),
        _current_tenant_names(session, [apartment.id]).get(apartment.id),
    )


@router.delete("/{apartment_id}", status_code=status.HTTP_204_NO_CONTENT)
def archive_apartment(
    apartment_id: int,
    session: Session = Depends(get_write_db),
) -> Response:
    apartment = _get_apartment(session, apartment_id)
    apartment.is_active = False
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
