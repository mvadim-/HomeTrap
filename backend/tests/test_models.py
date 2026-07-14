from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import func, inspect, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import Settings
from app.db import create_database_engine, get_tariff_for_period
from app.main import create_app
from app.models import (
    Apartment,
    ExchangeRate,
    Invoice,
    InvoiceLine,
    InvoiceStatus,
    Service,
    ServiceKind,
    Setting,
    Tariff,
    User,
)


def make_apartment(name: str = "Квартира 1") -> Apartment:
    return Apartment(
        name=name,
        address="Київ",
        rent_amount=Decimal("325.00"),
        rent_currency="USD",
    )


def make_invoice(apartment: Apartment, period: date) -> Invoice:
    return Invoice(
        apartment=apartment,
        period=period,
        exchange_rate=Decimal("44.680000"),
        rent_amount_usd=Decimal("325.00"),
        rent_amount_uah=Decimal("14521.00"),
        utilities_total=Decimal("2210.51"),
        grand_total=Decimal("16731.51"),
    )


def test_can_create_all_entities(db_session: Session) -> None:
    apartment = make_apartment()
    service = Service(
        apartment=apartment,
        name="Газ",
        kind=ServiceKind.METERED.value,
        unit="м³",
        provider_account="12345",
    )
    tariff = Tariff(
        service=service,
        value=Decimal("7.95689"),
        valid_from=date(2026, 1, 1),
    )
    invoice = make_invoice(apartment, date(2026, 7, 1))
    line = InvoiceLine(
        invoice=invoice,
        service=service,
        service_name="Газ",
        prev_reading=Decimal("100.000"),
        curr_reading=Decimal("122.000"),
        consumed=Decimal("22.000"),
        tariff_value=Decimal("7.95689"),
        amount=Decimal("175.05"),
    )
    rate = ExchangeRate(
        date=date(2026, 7, 1),
        currency="USD",
        rate=Decimal("44.680000"),
    )
    user = User(username="admin", password_hash="bcrypt-hash")
    setting = Setting(key="reminder", value={"day": 25, "enabled": True})
    db_session.add_all([tariff, line, rate, user, setting])
    db_session.commit()

    assert apartment.id is not None
    assert service.is_active is True
    assert invoice.status == InvoiceStatus.DRAFT.value
    assert invoice.lines == [line]
    assert db_session.scalar(select(ExchangeRate.rate)) == Decimal("44.680000")
    assert db_session.get(Setting, "reminder").value["day"] == 25


def test_deleting_apartment_cascades_services_and_tariffs(db_session: Session) -> None:
    apartment = make_apartment()
    apartment.services.append(
        Service(
            name="Електроенергія",
            kind=ServiceKind.METERED.value,
            unit="кВт·год",
            tariffs=[
                Tariff(value=Decimal("4.32000"), valid_from=date(2025, 1, 1)),
            ],
        )
    )
    db_session.add(apartment)
    db_session.commit()

    db_session.delete(apartment)
    db_session.commit()

    assert db_session.scalar(select(func.count()).select_from(Apartment)) == 0
    assert db_session.scalar(select(func.count()).select_from(Service)) == 0
    assert db_session.scalar(select(func.count()).select_from(Tariff)) == 0


def test_invoice_period_is_unique_per_apartment(db_session: Session) -> None:
    apartment = make_apartment()
    db_session.add_all(
        [
            make_invoice(apartment, date(2026, 7, 1)),
            make_invoice(apartment, date(2026, 7, 1)),
        ]
    )

    with pytest.raises(IntegrityError):
        db_session.commit()


def test_same_period_is_allowed_for_different_apartments(db_session: Session) -> None:
    first = make_apartment("Перша")
    second = make_apartment("Друга")
    db_session.add_all(
        [
            make_invoice(first, date(2026, 7, 1)),
            make_invoice(second, date(2026, 7, 1)),
        ]
    )
    db_session.commit()

    assert db_session.scalar(select(func.count()).select_from(Invoice)) == 2


def test_get_tariff_for_period_returns_latest_effective_tariff(
    db_session: Session,
) -> None:
    service = Service(
        apartment=make_apartment(),
        name="Газ",
        kind=ServiceKind.METERED.value,
        tariffs=[
            Tariff(value=Decimal("7.50000"), valid_from=date(2025, 1, 1)),
            Tariff(value=Decimal("7.95689"), valid_from=date(2026, 4, 1)),
            Tariff(value=Decimal("8.10000"), valid_from=date(2026, 8, 1)),
        ],
    )
    db_session.add(service)
    db_session.commit()

    selected = get_tariff_for_period(db_session, service.id, date(2026, 7, 1))

    assert selected is not None
    assert selected.value == Decimal("7.95689")
    assert get_tariff_for_period(db_session, service.id, date(2024, 12, 1)) is None


async def test_application_startup_applies_migrations(tmp_path) -> None:
    database_path = tmp_path / "runtime" / "hometrap.db"
    application = create_app(Settings(database_path=database_path))

    async with application.router.lifespan_context(application):
        pass

    engine = create_database_engine(database_path)
    try:
        table_names = set(inspect(engine).get_table_names())
    finally:
        engine.dispose()

    assert {
        "alembic_version",
        "apartments",
        "services",
        "tariffs",
        "invoices",
        "invoice_lines",
        "exchange_rates",
        "users",
        "settings",
    } <= table_names
