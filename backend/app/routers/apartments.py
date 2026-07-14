from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_db, require_auth
from app.models import Apartment, Invoice
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


def _apartment_response(session: Session, apartment: Apartment) -> dict:
    latest_invoice = session.scalar(
        select(Invoice)
        .where(Invoice.apartment_id == apartment.id)
        .order_by(Invoice.period.desc())
        .limit(1)
    )
    return {
        "id": apartment.id,
        "name": apartment.name,
        "address": apartment.address,
        "rent_amount": apartment.rent_amount,
        "rent_currency": apartment.rent_currency,
        "notes": apartment.notes,
        "is_active": apartment.is_active,
        "latest_invoice": latest_invoice,
    }


@router.get("", response_model=list[ApartmentResponse])
def list_apartments(
    session: Session = Depends(get_db),
) -> list[dict]:
    apartments = session.scalars(select(Apartment).order_by(Apartment.id)).all()
    return [_apartment_response(session, apartment) for apartment in apartments]


@router.post("", response_model=ApartmentResponse, status_code=status.HTTP_201_CREATED)
def create_apartment(
    payload: ApartmentCreate,
    session: Session = Depends(get_db),
) -> dict:
    apartment = Apartment(**payload.model_dump())
    session.add(apartment)
    session.commit()
    return _apartment_response(session, apartment)


@router.get("/{apartment_id}", response_model=ApartmentResponse)
def get_apartment(
    apartment_id: int,
    session: Session = Depends(get_db),
) -> dict:
    return _apartment_response(session, _get_apartment(session, apartment_id))


@router.put("/{apartment_id}", response_model=ApartmentResponse)
def update_apartment(
    apartment_id: int,
    payload: ApartmentUpdate,
    session: Session = Depends(get_db),
) -> dict:
    apartment = _get_apartment(session, apartment_id)
    for field, value in payload.model_dump().items():
        setattr(apartment, field, value)
    session.commit()
    return _apartment_response(session, apartment)


@router.delete("/{apartment_id}", status_code=status.HTTP_204_NO_CONTENT)
def archive_apartment(
    apartment_id: int,
    session: Session = Depends(get_db),
) -> Response:
    apartment = _get_apartment(session, apartment_id)
    apartment.is_active = False
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
