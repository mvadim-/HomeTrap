from datetime import date
from decimal import Decimal
from pathlib import Path
import sqlite3

from alembic import command
from alembic.config import Config
import pytest
from sqlalchemy import delete, func, inspect, select
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
    PushSubscription,
    Service,
    ServiceKind,
    Setting,
    Tariff,
    Tenant,
    TenantAttachment,
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
        service_kind="metered",
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


@pytest.mark.parametrize("billing_day", [0, 32])
def test_tenant_billing_day_database_constraint(
    db_session: Session,
    billing_day: int,
) -> None:
    apartment = make_apartment()
    apartment.tenants.append(
        Tenant(
            full_name="Орендар",
            contract_start=date(2026, 1, 1),
            billing_day=billing_day,
        )
    )
    db_session.add(apartment)

    with pytest.raises(IntegrityError):
        db_session.commit()


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


def test_can_create_tenant_with_nullable_contract_end(db_session: Session) -> None:
    tenant = Tenant(
        apartment=make_apartment(),
        full_name="Оксана Коваль",
        phone="+380501234567",
        email="oksana@example.com",
        contract_start=date(2026, 7, 1),
        billing_day=15,
        notes="Контракт підписано",
        attachments=[
            TenantAttachment(
                original_name="contract.pdf",
                stored_name="2f427e6c-00e1-41ce-b86a-07adaf1de9ed.pdf",
                content_type="application/pdf",
                size_bytes=1024,
            )
        ],
    )
    db_session.add(tenant)
    db_session.commit()

    assert tenant.apartment.tenants == [tenant]
    assert tenant.contract_end is None
    assert db_session.get(Tenant, tenant.id).billing_day == 15
    assert tenant.attachments[0].tenant is tenant
    assert tenant.attachments[0].uploaded_at is not None


def test_push_subscription_endpoint_is_unique(db_session: Session) -> None:
    first = PushSubscription(
        endpoint="https://push.example.test/first",
        p256dh="first-public-key",
        auth="first-auth-secret",
    )
    second = PushSubscription(
        endpoint="https://push.example.test/second",
        p256dh="second-public-key",
        auth="second-auth-secret",
    )
    db_session.add_all([first, second])
    db_session.commit()

    assert db_session.get(PushSubscription, first.id).endpoint == first.endpoint
    assert first.created_at is not None

    db_session.add(
        PushSubscription(
            endpoint=first.endpoint,
            p256dh="duplicate-public-key",
            auth="duplicate-auth-secret",
        )
    )
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_only_one_active_tenant_is_allowed_per_apartment(db_session: Session) -> None:
    apartment = make_apartment()
    db_session.add_all(
        [
            Tenant(
                apartment=apartment,
                full_name="Перший",
                contract_start=date(2026, 1, 1),
            ),
            Tenant(
                apartment=apartment,
                full_name="Другий",
                contract_start=date(2026, 7, 1),
            ),
        ]
    )

    with pytest.raises(IntegrityError):
        db_session.commit()


def test_database_cascade_deletes_tenant_and_attachments(db_session: Session) -> None:
    apartment = make_apartment()
    tenant = Tenant(
        apartment=apartment,
        full_name="Оксана Коваль",
        contract_start=date(2026, 7, 1),
        attachments=[
            TenantAttachment(
                original_name="contract.pdf",
                stored_name="2f427e6c-00e1-41ce-b86a-07adaf1de9ed.pdf",
                content_type="application/pdf",
                size_bytes=1024,
            )
        ],
    )
    db_session.add(tenant)
    db_session.commit()

    db_session.execute(delete(Apartment).where(Apartment.id == apartment.id))
    db_session.commit()

    assert db_session.scalar(select(func.count()).select_from(Tenant)) == 0
    assert db_session.scalar(select(func.count()).select_from(TenantAttachment)) == 0


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
    application = create_app(
        Settings(
            database_path=database_path,
            secret_key="test-production-secret-that-is-at-least-32-chars",
            scheduler_enabled=False,
        )
    )

    async with application.router.lifespan_context(application):
        pass

    engine = create_database_engine(database_path)
    try:
        table_names = set(inspect(engine).get_table_names())
        invoice_line_columns = {
            column["name"]: column
            for column in inspect(engine).get_columns("invoice_lines")
        }
        invoice_line_checks = {
            constraint["name"]
            for constraint in inspect(engine).get_check_constraints("invoice_lines")
        }
        tenant_columns = {
            column["name"]: column for column in inspect(engine).get_columns("tenants")
        }
        tenant_checks = {
            constraint["name"]
            for constraint in inspect(engine).get_check_constraints("tenants")
        }
        push_unique_constraints = inspect(engine).get_unique_constraints(
            "push_subscriptions"
        )
        apartment_columns = {
            column["name"]: column
            for column in inspect(engine).get_columns("apartments")
        }
        service_columns = {
            column["name"]: column for column in inspect(engine).get_columns("services")
        }
        apartment_unique_constraints = inspect(engine).get_unique_constraints(
            "apartments"
        )
        service_unique_constraints = inspect(engine).get_unique_constraints("services")
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
        "tenants",
        "tenant_attachments",
        "push_subscriptions",
    } <= table_names
    assert invoice_line_columns["service_kind"]["nullable"] is False
    assert "ck_invoice_lines_service_kind" in invoice_line_checks
    assert tenant_columns["billing_day"]["nullable"] is True
    assert "ck_tenants_billing_day" in tenant_checks
    assert any(
        constraint["column_names"] == ["endpoint"]
        for constraint in push_unique_constraints
    )
    assert apartment_columns["restore_key"]["nullable"] is False
    assert service_columns["restore_key"]["nullable"] is False
    assert any(
        constraint["column_names"] == ["restore_key"]
        for constraint in apartment_unique_constraints
    )
    assert any(
        constraint["column_names"] == ["restore_key"]
        for constraint in service_unique_constraints
    )


def test_restore_key_migration_backfills_existing_duplicate_business_keys(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "pre-restore-keys.db"
    backend_dir = Path(__file__).resolve().parents[1]
    config = Config(backend_dir / "alembic.ini")
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{database_path}")
    command.upgrade(config, "20260718_05")
    with sqlite3.connect(database_path) as connection:
        connection.executemany(
            """INSERT INTO apartments
               (id, name, address, rent_amount, rent_currency, notes, is_active)
               VALUES (?, 'Дублікат', 'Київ', 500, 'USD', NULL, 1)""",
            [(1,), (2,)],
        )
        connection.executemany(
            """INSERT INTO services
               (id, apartment_id, name, kind, unit, provider_account, sort_order,
                is_active)
               VALUES (?, 1, 'Газ', 'fixed', NULL, NULL, 0, 1)""",
            [(1,), (2,)],
        )

    command.upgrade(config, "head")

    with sqlite3.connect(database_path) as connection:
        apartment_keys = connection.execute(
            "SELECT restore_key FROM apartments ORDER BY id"
        ).fetchall()
        service_keys = connection.execute(
            "SELECT restore_key FROM services ORDER BY id"
        ).fetchall()
        revision = connection.execute(
            "SELECT version_num FROM alembic_version"
        ).fetchone()

    assert len({row[0] for row in apartment_keys}) == 2
    assert len({row[0] for row in service_keys}) == 2
    assert all(len(row[0]) == 32 for row in apartment_keys + service_keys)
    assert revision == ("20260721_07",)


def test_restore_key_migration_resumes_after_interrupted_column_add(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "interrupted-restore-keys.db"
    backend_dir = Path(__file__).resolve().parents[1]
    config = Config(backend_dir / "alembic.ini")
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{database_path}")
    command.upgrade(config, "20260718_05")
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            """INSERT INTO apartments
               (id, name, address, rent_amount, rent_currency, notes, is_active)
               VALUES (1, 'Квартира', 'Київ', 500, 'USD', NULL, 1)"""
        )
        connection.execute(
            "ALTER TABLE apartments ADD COLUMN restore_key VARCHAR(32)"
        )

    command.upgrade(config, "head")

    with sqlite3.connect(database_path) as connection:
        apartment_key = connection.execute(
            "SELECT restore_key FROM apartments WHERE id = 1"
        ).fetchone()
        service_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(services)")
        }
        revision = connection.execute(
            "SELECT version_num FROM alembic_version"
        ).fetchone()

    assert apartment_key is not None
    assert len(apartment_key[0]) == 32
    assert "restore_key" in service_columns
    assert revision == ("20260721_07",)
