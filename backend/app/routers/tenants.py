from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_db, require_auth
from app.models import Apartment, Tenant
from app.schemas import TenantEndContract, TenantIn, TenantOut

router = APIRouter(tags=["tenants"], dependencies=[Depends(require_auth)])


def _get_apartment(session: Session, apartment_id: int) -> Apartment:
    apartment = session.get(Apartment, apartment_id)
    if apartment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Apartment not found",
        )
    return apartment


def _get_tenant(session: Session, tenant_id: int) -> Tenant:
    tenant = session.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found",
        )
    return tenant


@router.get(
    "/api/apartments/{apartment_id}/tenants",
    response_model=list[TenantOut],
)
def list_tenants(
    apartment_id: int,
    session: Session = Depends(get_db),
) -> list[Tenant]:
    _get_apartment(session, apartment_id)
    return list(
        session.scalars(
            select(Tenant)
            .where(Tenant.apartment_id == apartment_id)
            .order_by(
                Tenant.contract_end.is_not(None),
                Tenant.contract_start.desc(),
                Tenant.id.desc(),
            )
        ).all()
    )


@router.post(
    "/api/apartments/{apartment_id}/tenants",
    response_model=TenantOut,
    status_code=status.HTTP_201_CREATED,
)
def create_tenant(
    apartment_id: int,
    payload: TenantIn,
    session: Session = Depends(get_db),
) -> Tenant:
    _get_apartment(session, apartment_id)
    active_tenant = session.scalar(
        select(Tenant).where(
            Tenant.apartment_id == apartment_id,
            Tenant.contract_end.is_(None),
        )
    )
    if active_tenant is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Apartment already has an active tenant",
        )

    tenant = Tenant(apartment_id=apartment_id, **payload.model_dump())
    session.add(tenant)
    session.commit()
    return tenant


@router.put("/api/tenants/{tenant_id}", response_model=TenantOut)
def update_tenant(
    tenant_id: int,
    payload: TenantIn,
    session: Session = Depends(get_db),
) -> Tenant:
    tenant = _get_tenant(session, tenant_id)
    if payload.contract_end is None:
        other_active_tenant = session.scalar(
            select(Tenant).where(
                Tenant.apartment_id == tenant.apartment_id,
                Tenant.contract_end.is_(None),
                Tenant.id != tenant.id,
            )
        )
        if other_active_tenant is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Apartment already has an active tenant",
            )
    for field, value in payload.model_dump().items():
        setattr(tenant, field, value)
    session.commit()
    return tenant


@router.post("/api/tenants/{tenant_id}/end-contract", response_model=TenantOut)
def end_contract(
    tenant_id: int,
    payload: TenantEndContract,
    session: Session = Depends(get_db),
) -> Tenant:
    tenant = _get_tenant(session, tenant_id)
    if tenant.contract_end is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Tenant contract is already ended",
        )
    if payload.contract_end < tenant.contract_start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="contract_end must be on or after contract_start",
        )

    tenant.contract_end = payload.contract_end
    session.commit()
    return tenant


@router.delete(
    "/api/tenants/{tenant_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_tenant(
    tenant_id: int,
    session: Session = Depends(get_db),
) -> Response:
    tenant = _get_tenant(session, tenant_id)
    session.delete(tenant)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
