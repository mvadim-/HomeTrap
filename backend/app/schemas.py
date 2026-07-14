from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_serializer

from app.models import ServiceKind


class ApiSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    @field_serializer("*", check_fields=False, when_used="json")
    def serialize_decimal(self, value: object) -> object:
        return str(value) if isinstance(value, Decimal) else value


class LatestInvoiceSummary(ApiSchema):
    id: int
    period: date
    status: str
    grand_total: Decimal


class ApartmentBase(ApiSchema):
    name: str = Field(min_length=1, max_length=200)
    address: str = Field(min_length=1, max_length=500)
    rent_amount: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    rent_currency: str = Field(default="USD", min_length=3, max_length=3)
    notes: str | None = None


class ApartmentCreate(ApartmentBase):
    pass


class ApartmentUpdate(ApartmentBase):
    is_active: bool = True


class ApartmentResponse(ApartmentBase):
    id: int
    is_active: bool
    latest_invoice: LatestInvoiceSummary | None = None


class ServiceBase(ApiSchema):
    name: str = Field(min_length=1, max_length=200)
    kind: ServiceKind
    unit: str | None = Field(default=None, max_length=50)
    provider_account: str | None = Field(default=None, max_length=100)
    sort_order: int = 0


class ServiceCreate(ServiceBase):
    pass


class ServiceUpdate(ServiceBase):
    is_active: bool = True


class ServiceResponse(ServiceBase):
    id: int
    apartment_id: int
    is_active: bool


class TariffCreate(ApiSchema):
    value: Decimal = Field(gt=0, max_digits=12, decimal_places=5)
    valid_from: date


class TariffResponse(TariffCreate):
    id: int
    service_id: int
