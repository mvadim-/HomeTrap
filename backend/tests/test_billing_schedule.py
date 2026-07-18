from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from app.models import Apartment, Invoice, InvoiceStatus, Tenant
from app.services.billing_schedule import compute_billing_schedule


def make_apartment(
    name: str,
    *,
    is_active: bool = True,
) -> Apartment:
    return Apartment(
        name=name,
        address="Київ",
        rent_amount=Decimal("325.00"),
        rent_currency="USD",
        is_active=is_active,
    )


def make_tenant(
    apartment: Apartment,
    *,
    name: str = "Орендар",
    contract_start: date,
    contract_end: date | None = None,
    billing_day: int | None = None,
) -> Tenant:
    return Tenant(
        apartment=apartment,
        full_name=name,
        contract_start=contract_start,
        contract_end=contract_end,
        billing_day=billing_day,
    )


def make_invoice(
    apartment: Apartment,
    period: date,
    status: InvoiceStatus,
) -> Invoice:
    return Invoice(
        apartment=apartment,
        period=period,
        status=status.value,
        exchange_rate=Decimal("44.680000"),
        rent_amount_usd=Decimal("325.00"),
        rent_amount_uah=Decimal("14521.00"),
        utilities_total=Decimal("0.00"),
        grand_total=Decimal("14521.00"),
    )


@pytest.mark.parametrize(
    ("today", "expected"),
    [
        (date(2026, 2, 1), date(2026, 2, 28)),
        (date(2028, 2, 1), date(2028, 2, 29)),
        (date(2026, 4, 1), date(2026, 4, 30)),
    ],
)
def test_contract_day_is_clipped_to_end_of_month(
    db_session: Session,
    today: date,
    expected: date,
) -> None:
    apartment = make_apartment("Квартира 31")
    db_session.add(
        make_tenant(apartment, contract_start=date(2026, 1, 31))
    )
    db_session.commit()

    [entry] = compute_billing_schedule(db_session, today)

    assert entry.billing_day == 31
    assert entry.next_billing_date == expected
    assert entry.period == expected.replace(day=1)
    assert entry.invoice_exists is False
    assert entry.invoice_status is None


def test_billing_day_override_replaces_contract_day(db_session: Session) -> None:
    apartment = make_apartment("Override")
    db_session.add(
        make_tenant(
            apartment,
            contract_start=date(2026, 1, 31),
            billing_day=15,
        )
    )
    db_session.commit()

    [entry] = compute_billing_schedule(db_session, date(2026, 2, 1))

    assert entry.billing_day == 15
    assert entry.next_billing_date == date(2026, 2, 15)
    assert entry.period == date(2026, 2, 1)


def test_next_billing_date_moves_to_next_month_after_billing_day(
    db_session: Session,
) -> None:
    apartment = make_apartment("Наступний місяць")
    db_session.add(
        make_tenant(apartment, contract_start=date(2026, 1, 10))
    )
    db_session.commit()

    [entry] = compute_billing_schedule(db_session, date(2026, 7, 11))

    assert entry.next_billing_date == date(2026, 8, 10)
    assert entry.period == date(2026, 8, 1)


def test_schedule_uses_current_tenant_and_ignores_future_tenant(
    db_session: Session,
) -> None:
    apartment = make_apartment("Зміна орендаря")
    current = make_tenant(
        apartment,
        name="Поточний",
        contract_start=date(2026, 1, 5),
        contract_end=date(2026, 7, 31),
    )
    future = make_tenant(
        apartment,
        name="Майбутній",
        contract_start=date(2026, 8, 1),
        contract_end=date(2027, 7, 31),
        billing_day=20,
    )
    db_session.add_all([current, future])
    db_session.commit()

    entries = compute_billing_schedule(db_session, date(2026, 7, 1))

    assert len(entries) == 1
    assert entries[0].tenant.id == current.id
    assert entries[0].billing_day == 5


def test_schedule_excludes_ineligible_apartments_and_tenants(
    db_session: Session,
) -> None:
    ended_apartment = make_apartment("Договір завершено")
    no_tenant_apartment = make_apartment("Без орендаря")
    inactive_apartment = make_apartment("Неактивна", is_active=False)
    eligible_apartment = make_apartment("Активна")
    db_session.add_all(
        [
            make_tenant(
                ended_apartment,
                contract_start=date(2025, 1, 1),
                contract_end=date(2026, 6, 30),
            ),
            no_tenant_apartment,
            make_tenant(
                inactive_apartment,
                contract_start=date(2026, 1, 1),
            ),
            make_tenant(
                eligible_apartment,
                contract_start=date(2026, 1, 1),
            ),
        ]
    )
    db_session.commit()

    entries = compute_billing_schedule(db_session, date(2026, 7, 1))

    assert [entry.apartment.name for entry in entries] == ["Активна"]


@pytest.mark.parametrize("status", list(InvoiceStatus))
def test_schedule_reports_existing_invoice_status(
    db_session: Session,
    status: InvoiceStatus,
) -> None:
    apartment = make_apartment(status.value)
    tenant = make_tenant(
        apartment,
        contract_start=date(2026, 1, 20),
    )
    invoice = make_invoice(apartment, date(2026, 7, 1), status)
    db_session.add_all([tenant, invoice])
    db_session.commit()

    [entry] = compute_billing_schedule(db_session, date(2026, 7, 18))

    assert entry.period == date(2026, 7, 1)
    assert entry.invoice_exists is True
    assert entry.invoice_status == status.value
