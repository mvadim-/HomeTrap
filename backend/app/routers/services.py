from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import get_db, get_write_db, require_auth
from app.models import Apartment, InvoiceLine, RestoreAlias, Service, Tariff
from app.schemas import (
    ServiceCreate,
    ServiceResponse,
    ServiceUpdate,
    TariffCreate,
    TariffResponse,
)

router = APIRouter(tags=["services"], dependencies=[Depends(require_auth)])


def _get_apartment(session: Session, apartment_id: int) -> Apartment:
    apartment = session.get(Apartment, apartment_id)
    if apartment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Apartment not found",
        )
    return apartment


def _get_service(session: Session, service_id: int) -> Service:
    service = session.get(Service, service_id)
    if service is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Service not found",
        )
    return service


def _get_apartment_service(
    session: Session,
    apartment_id: int,
    service_id: int,
) -> Service:
    service = _get_service(session, service_id)
    if service.apartment_id != apartment_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Service not found",
        )
    return service


@router.get(
    "/api/apartments/{apartment_id}/services",
    response_model=list[ServiceResponse],
)
def list_services(
    apartment_id: int,
    session: Session = Depends(get_db),
) -> list[Service]:
    _get_apartment(session, apartment_id)
    return list(
        session.scalars(
            select(Service)
            .where(Service.apartment_id == apartment_id)
            .order_by(Service.sort_order, Service.id)
        ).all()
    )


@router.post(
    "/api/apartments/{apartment_id}/services",
    response_model=ServiceResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_service(
    apartment_id: int,
    payload: ServiceCreate,
    session: Session = Depends(get_write_db),
) -> Service:
    _get_apartment(session, apartment_id)
    service = Service(apartment_id=apartment_id, **payload.model_dump(mode="json"))
    session.add(service)
    session.commit()
    return service


@router.get(
    "/api/apartments/{apartment_id}/services/{service_id}",
    response_model=ServiceResponse,
)
def get_service(
    apartment_id: int,
    service_id: int,
    session: Session = Depends(get_db),
) -> Service:
    return _get_apartment_service(session, apartment_id, service_id)


@router.put(
    "/api/apartments/{apartment_id}/services/{service_id}",
    response_model=ServiceResponse,
)
def update_service(
    apartment_id: int,
    service_id: int,
    payload: ServiceUpdate,
    session: Session = Depends(get_write_db),
) -> Service:
    service = _get_apartment_service(session, apartment_id, service_id)
    for field, value in payload.model_dump(mode="json").items():
        setattr(service, field, value)
    session.commit()
    return service


@router.delete(
    "/api/apartments/{apartment_id}/services/{service_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_service(
    apartment_id: int,
    service_id: int,
    session: Session = Depends(get_write_db),
) -> Response:
    service = _get_apartment_service(session, apartment_id, service_id)
    line_count = session.scalar(
        select(func.count())
        .select_from(InvoiceLine)
        .where(InvoiceLine.service_id == service_id)
    )
    if line_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Service is used by invoices and can only be deactivated",
        )
    session.execute(
        delete(RestoreAlias).where(
            RestoreAlias.entity_type == "service",
            RestoreAlias.target_restore_key == service.restore_key,
        )
    )
    session.delete(service)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/api/services/{service_id}/tariffs",
    response_model=list[TariffResponse],
)
def list_tariffs(
    service_id: int,
    session: Session = Depends(get_db),
) -> list[Tariff]:
    _get_service(session, service_id)
    return list(
        session.scalars(
            select(Tariff)
            .where(Tariff.service_id == service_id)
            .order_by(Tariff.valid_from)
        ).all()
    )


@router.post(
    "/api/services/{service_id}/tariffs",
    response_model=TariffResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_tariff(
    service_id: int,
    payload: TariffCreate,
    session: Session = Depends(get_write_db),
) -> Tariff:
    _get_service(session, service_id)
    tariff = Tariff(service_id=service_id, **payload.model_dump())
    session.add(tariff)
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A tariff already exists for this date",
        ) from error
    return tariff
