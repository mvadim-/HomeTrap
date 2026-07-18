from datetime import date
from decimal import Decimal
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_db, require_auth
from app.config import Settings
from app.main import create_app
from app.models import Apartment, Invoice, InvoiceStatus, Tenant
from app.services.billing import BillingValidationError, InvoiceChronologyError
from app.services.billing_schedule import (
    compute_billing_schedule,
    send_billing_reminders,
)
from app.services.nbu import NbuRateUnavailable, RateResult


class RecordingSender:
    def __init__(self, *, fails: bool = False) -> None:
        self.fails = fails
        self.messages: list[tuple[str, str]] = []

    def send(self, subject: str, message: str) -> None:
        if self.fails:
            raise RuntimeError("delivery failed")
        self.messages.append((subject, message))


BILLING_REMINDER_SETTINGS = {
    "days_before": 5,
    "repeat_every_days": 2,
    "auto_draft": True,
}


@pytest.fixture
async def billing_client(db_session: Session):
    application = create_app(
        Settings(
            secret_key="test-session-secret",
            debug=True,
            scheduler_enabled=False,
        )
    )
    application.dependency_overrides[get_db] = lambda: db_session
    application.dependency_overrides[require_auth] = lambda: object()
    async with AsyncClient(
        transport=ASGITransport(app=application),
        base_url="http://test",
    ) as client:
        yield client


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


def test_schedule_includes_contract_start_and_end_boundaries(
    db_session: Session,
) -> None:
    today = date(2026, 7, 20)
    starting_apartment = make_apartment("Початок сьогодні")
    ending_apartment = make_apartment("Завершення сьогодні")
    db_session.add_all(
        [
            make_tenant(starting_apartment, contract_start=today),
            make_tenant(
                ending_apartment,
                contract_start=date(2026, 1, 20),
                contract_end=today,
            ),
        ]
    )
    db_session.commit()

    entries = compute_billing_schedule(db_session, today)

    assert {entry.apartment.name for entry in entries} == {
        "Завершення сьогодні",
        "Початок сьогодні",
    }
    assert all(entry.next_billing_date == today for entry in entries)


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


async def test_upcoming_billing_api_sorts_and_reports_all_invoice_statuses(
    db_session: Session,
    billing_client: AsyncClient,
    monkeypatch,
) -> None:
    today = date(2026, 7, 1)
    monkeypatch.setattr("app.routers.billing._today", lambda: today)
    without_invoice = make_apartment("Грушевського")
    draft = make_apartment("Володимирська")
    issued = make_apartment("Богдана Хмельницького")
    paid = make_apartment("Антоновича")
    tenants = [
        make_tenant(without_invoice, contract_start=date(2026, 1, 8)),
        make_tenant(draft, contract_start=date(2026, 1, 7)),
        make_tenant(issued, contract_start=date(2026, 1, 7)),
        make_tenant(paid, contract_start=date(2026, 1, 9)),
    ]
    db_session.add_all(
        [
            *tenants,
            make_invoice(draft, today, InvoiceStatus.DRAFT),
            make_invoice(issued, today, InvoiceStatus.ISSUED),
            make_invoice(paid, today, InvoiceStatus.PAID),
        ]
    )
    db_session.commit()

    response = await billing_client.get("/api/billing/upcoming")

    assert response.status_code == 200
    assert response.json() == [
        {
            "apartment_id": issued.id,
            "apartment_name": "Богдана Хмельницького",
            "tenant_id": tenants[2].id,
            "tenant_name": "Орендар",
            "next_billing_date": "2026-07-07",
            "period": "2026-07-01",
            "invoice_status": "issued",
        },
        {
            "apartment_id": draft.id,
            "apartment_name": "Володимирська",
            "tenant_id": tenants[1].id,
            "tenant_name": "Орендар",
            "next_billing_date": "2026-07-07",
            "period": "2026-07-01",
            "invoice_status": "draft",
        },
        {
            "apartment_id": without_invoice.id,
            "apartment_name": "Грушевського",
            "tenant_id": tenants[0].id,
            "tenant_name": "Орендар",
            "next_billing_date": "2026-07-08",
            "period": "2026-07-01",
            "invoice_status": None,
        },
        {
            "apartment_id": paid.id,
            "apartment_name": "Антоновича",
            "tenant_id": tenants[3].id,
            "tenant_name": "Орендар",
            "next_billing_date": "2026-07-09",
            "period": "2026-07-01",
            "invoice_status": "paid",
        },
    ]


async def test_upcoming_billing_api_includes_day_30_and_excludes_day_31(
    billing_client: AsyncClient,
    monkeypatch,
) -> None:
    today = date(2026, 8, 1)
    monkeypatch.setattr("app.routers.billing._today", lambda: today)

    def schedule(_session: Session, schedule_today: date) -> list[SimpleNamespace]:
        assert schedule_today == today
        return [
            SimpleNamespace(
                apartment=SimpleNamespace(id=2, name="Поза горизонтом"),
                tenant=SimpleNamespace(id=12, full_name="Далекий орендар"),
                next_billing_date=date(2026, 9, 1),
                period=date(2026, 9, 1),
                invoice_status=None,
            ),
            SimpleNamespace(
                apartment=SimpleNamespace(id=1, name="На межі"),
                tenant=SimpleNamespace(id=11, full_name="Поточний орендар"),
                next_billing_date=date(2026, 8, 31),
                period=date(2026, 8, 1),
                invoice_status="draft",
            ),
        ]

    monkeypatch.setattr("app.routers.billing.compute_billing_schedule", schedule)

    response = await billing_client.get("/api/billing/upcoming")

    assert response.status_code == 200
    assert [item["apartment_name"] for item in response.json()] == ["На межі"]


async def test_upcoming_billing_api_returns_empty_list(
    billing_client: AsyncClient,
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        "app.routers.billing._today",
        lambda: date(2026, 7, 1),
    )

    response = await billing_client.get("/api/billing/upcoming")

    assert response.status_code == 200
    assert response.json() == []


def test_billing_reminder_starts_at_window_boundary_and_repeats(
    db_session: Session,
) -> None:
    apartment = make_apartment("Лісова")
    db_session.add(
        make_tenant(apartment, contract_start=date(2026, 1, 20))
    )
    db_session.commit()
    sender = RecordingSender()
    history: dict[str, str] = {}

    first = send_billing_reminders(
        db_session,
        date(2026, 7, 15),
        BILLING_REMINDER_SETTINGS,
        [sender],
        history,
    )
    too_soon = send_billing_reminders(
        db_session,
        date(2026, 7, 16),
        BILLING_REMINDER_SETTINGS,
        [sender],
        history,
    )
    repeated = send_billing_reminders(
        db_session,
        date(2026, 7, 17),
        BILLING_REMINDER_SETTINGS,
        [sender],
        history,
    )

    assert first.deliveries == 1
    assert too_soon.notifications == 0
    assert repeated.deliveries == 1
    assert history == {f"billing:{apartment.id}:2026-07-01": "2026-07-17"}
    assert sender.messages == [
        (
            "Нагадування про виставлення рахунка",
            "Виставте рахунок для квартири «Лісова» за 07.2026 до 20.07.2026.",
        ),
        (
            "Нагадування про виставлення рахунка",
            "Виставте рахунок для квартири «Лісова» за 07.2026 до 20.07.2026.",
        ),
    ]


def test_billing_reminder_is_silent_outside_window_and_for_existing_invoice(
    db_session: Session,
) -> None:
    outside = make_apartment("Поза вікном")
    invoiced = make_apartment("З рахунком")
    db_session.add_all(
        [
            make_tenant(outside, contract_start=date(2026, 1, 20)),
            make_tenant(invoiced, contract_start=date(2026, 1, 20)),
            make_invoice(invoiced, date(2026, 7, 1), InvoiceStatus.DRAFT),
        ]
    )
    db_session.commit()
    sender = RecordingSender()
    history: dict[str, str] = {}

    result = send_billing_reminders(
        db_session,
        date(2026, 7, 14),
        BILLING_REMINDER_SETTINGS,
        [sender],
        history,
    )
    invoiced_result = send_billing_reminders(
        db_session,
        date(2026, 7, 15),
        BILLING_REMINDER_SETTINGS,
        [sender],
        history,
    )

    assert result.notifications == 0
    assert invoiced_result.notifications == 1
    assert len(sender.messages) == 1
    assert "Поза вікном" in sender.messages[0][1]
    assert "З рахунком" not in sender.messages[0][1]


def test_billing_reminder_does_not_update_history_without_delivery(
    db_session: Session,
) -> None:
    apartment = make_apartment("Недоставлене")
    db_session.add(
        make_tenant(apartment, contract_start=date(2026, 1, 20))
    )
    db_session.commit()
    history: dict[str, str] = {}

    result = send_billing_reminders(
        db_session,
        date(2026, 7, 15),
        BILLING_REMINDER_SETTINGS,
        [RecordingSender(fails=True)],
        history,
    )

    assert result.notifications == 1
    assert result.deliveries == 0
    assert len(result.errors) == 1
    assert history == {}


def test_auto_draft_is_created_once_and_not_recreated_after_deletion(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    apartment = make_apartment("Лісова")
    db_session.add(
        make_tenant(apartment, contract_start=date(2026, 1, 20))
    )
    db_session.commit()
    created: list[tuple[Apartment, date, Decimal]] = []

    def create_draft(
        session: Session,
        target_apartment: Apartment,
        period: date,
        rate: Decimal,
    ) -> None:
        created.append((target_apartment, period, rate))
        session.add(make_invoice(target_apartment, period, InvoiceStatus.DRAFT))
        session.commit()

    monkeypatch.setattr(
        "app.services.nbu.get_rate",
        lambda _session, target_date: RateResult(
            requested_date=target_date,
            rate_date=target_date,
            currency="USD",
            rate=Decimal("44.680000"),
            is_fallback=False,
        ),
    )
    monkeypatch.setattr(
        "app.services.billing.create_draft",
        create_draft,
    )
    sender = RecordingSender()
    history: dict[str, str] = {}

    first = send_billing_reminders(
        db_session,
        date(2026, 7, 20),
        BILLING_REMINDER_SETTINGS,
        [sender],
        history,
    )
    draft = db_session.scalar(select(Invoice))
    assert draft is not None
    db_session.delete(draft)
    db_session.commit()
    after_deleted_draft = send_billing_reminders(
        db_session,
        date(2026, 7, 20),
        BILLING_REMINDER_SETTINGS,
        [sender],
        history,
    )

    assert created == [(apartment, date(2026, 7, 1), Decimal("44.680000"))]
    assert first.notifications == 1
    assert first.deliveries == 1
    assert after_deleted_draft.notifications == 0
    assert history == {
        f"billing_draft:{apartment.id}:2026-07-01": "2026-07-20"
    }
    assert sender.messages == [
        (
            "Чернетку рахунка створено",
            "Чернетку рахунка для квартири «Лісова» за 07.2026 створено автоматично.",
        )
    ]


@pytest.mark.parametrize(
    ("failure_source", "error"),
    [
        ("draft", BillingValidationError("немає тарифу")),
        (
            "draft",
            InvoiceChronologyError("earlier_draft", "є попередня чернетка"),
        ),
        ("rate", NbuRateUnavailable("курс недоступний")),
    ],
)
def test_auto_draft_failure_requests_manual_creation_and_rolls_back(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    failure_source: str,
    error: RuntimeError,
) -> None:
    apartment = make_apartment("Січових Стрільців")
    db_session.add(
        make_tenant(apartment, contract_start=date(2026, 1, 20))
    )
    db_session.commit()

    def get_rate(_session: Session, target_date: date) -> RateResult:
        if failure_source == "rate":
            raise error
        return RateResult(
            requested_date=target_date,
            rate_date=target_date,
            currency="USD",
            rate=Decimal("44.680000"),
            is_fallback=False,
        )

    def create_draft(
        session: Session,
        target_apartment: Apartment,
        period: date,
        _rate: Decimal,
    ) -> None:
        session.add(make_invoice(target_apartment, period, InvoiceStatus.DRAFT))
        raise error

    monkeypatch.setattr("app.services.nbu.get_rate", get_rate)
    monkeypatch.setattr("app.services.billing.create_draft", create_draft)
    warnings: list[str] = []
    monkeypatch.setattr(
        "app.services.billing_schedule.logger.warning",
        lambda message, *args: warnings.append(message % args),
    )
    sender = RecordingSender()
    history: dict[str, str] = {}

    result = send_billing_reminders(
        db_session,
        date(2026, 7, 20),
        BILLING_REMINDER_SETTINGS,
        [sender],
        history,
    )

    assert result.notifications == 1
    assert result.deliveries == 1
    assert history == {}
    assert list(db_session.scalars(select(Invoice))) == []
    assert sender.messages == [
        (
            "Не вдалося створити чернетку рахунка",
            (
                "Створіть рахунок вручну для квартири «Січових Стрільців» "
                f"за 07.2026: {error}."
            ),
        )
    ]
    assert len(warnings) == 1
    assert str(error) in warnings[0]


def test_billing_day_without_auto_draft_sends_regular_reminder(
    db_session: Session,
) -> None:
    apartment = make_apartment("Поділ")
    db_session.add(
        make_tenant(apartment, contract_start=date(2026, 1, 20))
    )
    db_session.commit()
    sender = RecordingSender()
    history = {f"billing:{apartment.id}:2026-07-01": "2026-07-19"}

    result = send_billing_reminders(
        db_session,
        date(2026, 7, 20),
        {**BILLING_REMINDER_SETTINGS, "auto_draft": False},
        [sender],
        history,
    )

    assert result.notifications == 1
    assert result.deliveries == 1
    assert history == {f"billing:{apartment.id}:2026-07-01": "2026-07-20"}
    assert sender.messages == [
        (
            "Нагадування про виставлення рахунка",
            "Виставте рахунок для квартири «Поділ» за 07.2026 до 20.07.2026.",
        )
    ]
