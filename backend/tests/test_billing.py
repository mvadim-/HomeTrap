from __future__ import annotations

from datetime import date
from decimal import Decimal

from httpx import ASGITransport, AsyncClient
import pytest
from sqlalchemy import select

from app.config import Settings
from app.db import create_database_engine, create_session_factory
from app.main import create_app
from app.models import Apartment, Expense, Invoice, InvoiceLine, Service, Tariff
from app.services.billing import (
    BillingConflictError,
    BillingValidationError,
    delete_draft,
    get_invoice,
    recalculate,
    transition_invoice,
    update_draft,
)
from app.services.nbu import RateResult


async def _client(tmp_path, monkeypatch):
    settings = Settings(
        database_path=tmp_path / "billing.db",
        secret_key="test-session-secret",
        debug=True,
        scheduler_enabled=False,
        admin_username="admin",
        admin_password="password",
    )
    application = create_app(settings)
    lifespan = application.router.lifespan_context(application)
    await lifespan.__aenter__()
    client = AsyncClient(
        transport=ASGITransport(app=application),
        base_url="http://test",
    )
    login = await client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "password"},
    )
    assert login.status_code == 200
    monkeypatch.setattr(
        "app.routers.invoices.get_rate",
        lambda _session, target_date: RateResult(
            requested_date=target_date,
            rate_date=target_date,
            currency="USD",
            rate=Decimal("44.680000"),
            is_fallback=False,
        ),
    )
    return application, lifespan, client


async def _close(lifespan, client: AsyncClient) -> None:
    await client.aclose()
    await lifespan.__aexit__(None, None, None)


def _seed_billing_data(
    application,
    *,
    with_previous: bool = True,
    previous_period: date = date(2026, 6, 1),
) -> tuple[int, int]:
    engine = create_database_engine(application.state.settings.database_path)
    with create_session_factory(engine)() as session:
        apartment = Apartment(
            name="Квартира 1",
            address="Київ",
            rent_amount=Decimal("325.00"),
            rent_currency="USD",
        )
        gas = Service(
            apartment=apartment,
            name="Газ",
            kind="metered",
            unit="м³",
            sort_order=1,
        )
        utilities = Service(
            apartment=apartment,
            name="Інші комунальні",
            kind="fixed",
            unit="грн",
            sort_order=2,
        )
        gas.tariffs.extend(
            [
                Tariff(value=Decimal("7.50000"), valid_from=date(2025, 1, 1)),
                Tariff(value=Decimal("7.95689"), valid_from=date(2026, 4, 1)),
            ]
        )
        utilities.tariffs.append(
            Tariff(value=Decimal("2035.46"), valid_from=date(2025, 1, 1))
        )
        session.add(apartment)
        session.flush()
        if with_previous:
            previous = Invoice(
                apartment=apartment,
                period=previous_period,
                status="paid",
                exchange_rate=Decimal("44.000000"),
                rent_amount_usd=Decimal("325.00"),
                rent_amount_uah=Decimal("14300.00"),
                utilities_total=Decimal("79.57"),
                grand_total=Decimal("14379.57"),
            )
            previous.lines.append(
                InvoiceLine(
                    service=gas,
                    service_name="Газ",
                    service_kind="metered",
                    prev_reading=Decimal("90.000"),
                    curr_reading=Decimal("100.000"),
                    consumed=Decimal("10.000"),
                    tariff_value=Decimal("7.95689"),
                    amount=Decimal("79.57"),
                )
            )
            session.add(previous)
        session.commit()
        result = apartment.id, gas.id
    engine.dispose()
    return result


def _seed_service_draft(session) -> int:
    apartment = Apartment(
        name="Квартира для коригувань",
        address="Київ",
        rent_amount=Decimal("1000.00"),
        rent_currency="UAH",
    )
    service = Service(
        apartment=apartment,
        name="Утримання будинку",
        kind="fixed",
        unit="грн",
        sort_order=1,
    )
    invoice = Invoice(
        apartment=apartment,
        period=date(2026, 7, 1),
        status="draft",
        exchange_rate=Decimal("1.000000"),
        rent_amount_usd=Decimal("1000.00"),
        rent_amount_uah=Decimal("1000.00"),
        utilities_total=Decimal("100.00"),
        adjustments_total=Decimal("0.00"),
        grand_total=Decimal("1100.00"),
    )
    invoice.lines.append(
        InvoiceLine(
            service=service,
            service_name=service.name,
            service_kind="fixed",
            tariff_value=Decimal("100.00000"),
            amount=Decimal("100.00"),
        )
    )
    session.add(invoice)
    session.commit()
    return invoice.id


def test_recalculate_separates_adjustments_from_utilities() -> None:
    invoice = Invoice(
        exchange_rate=Decimal("1.000000"),
        rent_amount_usd=Decimal("1000.00"),
        rent_amount_uah=Decimal("0.00"),
        utilities_total=Decimal("0.00"),
        adjustments_total=Decimal("0.00"),
        grand_total=Decimal("0.00"),
    )
    invoice.lines.extend(
        [
            InvoiceLine(
                service_name="Утримання будинку",
                service_kind="fixed",
                tariff_value=Decimal("100.00000"),
                amount=Decimal("100.00"),
            ),
            InvoiceLine(
                service_name="Компенсація ремонту",
                service_kind="adjustment",
                tariff_value=Decimal("0"),
                amount=Decimal("-250.00"),
            ),
        ]
    )

    recalculate(invoice)

    assert invoice.utilities_total == Decimal("100.00")
    assert invoice.adjustments_total == Decimal("-250.00")
    assert invoice.grand_total == Decimal("850.00")


def test_recalculate_allows_negative_grand_total() -> None:
    invoice = Invoice(
        exchange_rate=Decimal("1.000000"),
        rent_amount_usd=Decimal("1000.00"),
        rent_amount_uah=Decimal("0.00"),
        utilities_total=Decimal("0.00"),
        adjustments_total=Decimal("0.00"),
        grand_total=Decimal("0.00"),
    )
    invoice.lines.append(
        InvoiceLine(
            service_name="Компенсація ремонту",
            service_kind="adjustment",
            tariff_value=Decimal("0"),
            amount=Decimal("-1250.00"),
        )
    )

    recalculate(invoice)

    assert invoice.adjustments_total == Decimal("-1250.00")
    assert invoice.grand_total == Decimal("-250.00")


def test_update_draft_syncs_adjustment_and_expense_lifecycle(db_session) -> None:
    invoice_id = _seed_service_draft(db_session)

    created = update_draft(
        db_session,
        invoice_id,
        None,
        {},
        [
            {
                "label": "Компенсація ремонту котла",
                "amount": Decimal("-250.00"),
                "record_as_expense": True,
                "category": "repair",
            }
        ],
    )
    adjustment = next(
        line for line in created.lines if line.service_kind == "adjustment"
    )
    expense = db_session.scalar(
        select(Expense).where(Expense.invoice_line_id == adjustment.id)
    )
    assert adjustment.service_id is None
    assert adjustment.tariff_value == Decimal("0.00000")
    assert created.utilities_total == Decimal("100.00")
    assert created.adjustments_total == Decimal("-250.00")
    assert created.grand_total == Decimal("850.00")
    assert expense is not None
    assert expense.apartment_id == created.apartment_id
    assert expense.date == date(2026, 7, 1)
    assert expense.category == "repair"
    assert expense.amount == Decimal("250.00")
    assert expense.currency == "UAH"
    first_expense_id = expense.id

    updated = update_draft(
        db_session,
        invoice_id,
        None,
        {},
        [
            {
                "id": adjustment.id,
                "label": "Компенсація заміни котла",
                "amount": Decimal("-300.00"),
                "record_as_expense": True,
                "category": "other",
            }
        ],
    )
    updated_adjustment = next(
        line for line in updated.lines if line.service_kind == "adjustment"
    )
    expenses = db_session.scalars(select(Expense)).all()
    assert updated_adjustment.service_name == "Компенсація заміни котла"
    assert updated.adjustments_total == Decimal("-300.00")
    assert len(expenses) == 1
    assert expenses[0].id == first_expense_id
    assert expenses[0].category == "other"
    assert expenses[0].amount == Decimal("300.00")

    without_expense = update_draft(
        db_session,
        invoice_id,
        None,
        {},
        [
            {
                "id": adjustment.id,
                "label": "Компенсація заміни котла",
                "amount": Decimal("-300.00"),
                "record_as_expense": False,
                "category": None,
            }
        ],
    )
    assert db_session.scalars(select(Expense)).all() == []
    unlinked_adjustment = next(
        line for line in without_expense.lines if line.id == adjustment.id
    )
    assert unlinked_adjustment.expense is None

    update_draft(
        db_session,
        invoice_id,
        None,
        {},
        [
            {
                "id": adjustment.id,
                "label": "Компенсація заміни котла",
                "amount": Decimal("-300.00"),
                "record_as_expense": True,
                "category": "repair",
            }
        ],
    )
    assert db_session.scalar(select(Expense.id)) is not None

    cleared = update_draft(db_session, invoice_id, None, {}, [])
    assert all(line.service_kind != "adjustment" for line in cleared.lines)
    assert cleared.adjustments_total == Decimal("0.00")
    assert cleared.grand_total == Decimal("1100.00")
    assert db_session.scalars(select(Expense)).all() == []


def test_update_draft_rejects_duplicate_and_foreign_adjustment_ids(
    db_session,
) -> None:
    first_invoice_id = _seed_service_draft(db_session)
    created = update_draft(
        db_session,
        first_invoice_id,
        None,
        {},
        [
            {
                "label": "Компенсація",
                "amount": Decimal("-50.00"),
                "record_as_expense": False,
                "category": None,
            }
        ],
    )
    adjustment = next(
        line for line in created.lines if line.service_kind == "adjustment"
    )
    duplicate = {
        "id": adjustment.id,
        "label": adjustment.service_name,
        "amount": adjustment.amount,
        "record_as_expense": False,
        "category": None,
    }

    with pytest.raises(BillingValidationError, match="ids must be unique"):
        update_draft(
            db_session,
            first_invoice_id,
            None,
            {},
            [duplicate, duplicate],
        )
    db_session.rollback()

    second_invoice_id = _seed_service_draft(db_session)
    with pytest.raises(BillingValidationError, match="was not found"):
        update_draft(
            db_session,
            second_invoice_id,
            None,
            {},
            [duplicate],
        )
    db_session.rollback()

    assert db_session.get(InvoiceLine, adjustment.id).service_name == "Компенсація"


def test_update_draft_rejects_invalid_expense_and_non_draft(db_session) -> None:
    invoice_id = _seed_service_draft(db_session)

    with pytest.raises(
        BillingValidationError,
        match="Only a negative adjustment",
    ):
        update_draft(
            db_session,
            invoice_id,
            None,
            {},
            [
                {
                    "label": "Доплата",
                    "amount": Decimal("50.00"),
                    "record_as_expense": True,
                    "category": "repair",
                }
            ],
        )
    db_session.rollback()
    assert (
        db_session.scalars(
            select(InvoiceLine).where(InvoiceLine.service_kind == "adjustment")
        ).all()
        == []
    )
    assert db_session.scalars(select(Expense)).all() == []

    invoice = db_session.get(Invoice, invoice_id)
    invoice.status = "issued"
    db_session.commit()
    with pytest.raises(BillingConflictError, match="Only draft invoices"):
        update_draft(
            db_session,
            invoice_id,
            None,
            {},
            [
                {
                    "label": "Знижка",
                    "amount": Decimal("-50.00"),
                    "record_as_expense": False,
                    "category": None,
                }
            ],
        )


async def test_create_and_recalculate_real_invoice_example(tmp_path, monkeypatch) -> None:
    application, lifespan, client = await _client(tmp_path, monkeypatch)
    try:
        apartment_id, _ = _seed_billing_data(application)
        create = await client.post(
            f"/api/apartments/{apartment_id}/invoices",
            json={"period": "2026-07-01"},
        )
        assert create.status_code == 201
        draft = create.json()
        gas_line = draft["lines"][0]
        assert gas_line["prev_reading"] == "100.000"
        assert gas_line["curr_reading"] is None
        assert gas_line["tariff_value"] == "7.95689"
        assert draft["utilities_total"] == "2035.46"
        assert draft["rent_amount_uah"] == "14521.00"

        update = await client.put(
            f"/api/invoices/{draft['id']}",
            json={
                "exchange_rate": "44.680000",
                "lines": [{"id": gas_line["id"], "curr_reading": "122.000"}],
            },
        )
        assert update.status_code == 200
        recalculated = update.json()
        assert recalculated["lines"][0]["consumed"] == "22.000"
        assert recalculated["lines"][0]["amount"] == "175.05"
        assert recalculated["utilities_total"] == "2210.51"
        assert recalculated["rent_amount_uah"] == "14521.00"
        assert recalculated["grand_total"] == "16731.51"
        assert [warning["code"] for warning in recalculated["warnings"]] == [
            "consumption_anomaly"
        ]
    finally:
        await _close(lifespan, client)


async def test_first_invoice_uses_reading_as_baseline(tmp_path, monkeypatch) -> None:
    application, lifespan, client = await _client(tmp_path, monkeypatch)
    try:
        apartment_id, _ = _seed_billing_data(application, with_previous=False)
        draft = (
            await client.post(
                f"/api/apartments/{apartment_id}/invoices",
                json={"period": "2026-07-01"},
            )
        ).json()
        gas_line = draft["lines"][0]
        assert gas_line["prev_reading"] is None

        updated = (
            await client.put(
                f"/api/invoices/{draft['id']}",
                json={"lines": [{"id": gas_line["id"], "curr_reading": "500.000"}]},
            )
        ).json()
        assert updated["lines"][0]["curr_reading"] == "500.000"
        assert updated["lines"][0]["consumed"] is None
        assert updated["lines"][0]["amount"] == "0.00"
    finally:
        await _close(lifespan, client)


async def test_reading_is_carried_and_tariff_uses_invoice_period(
    tmp_path,
    monkeypatch,
) -> None:
    application, lifespan, client = await _client(tmp_path, monkeypatch)
    try:
        apartment_id, gas_id = _seed_billing_data(
            application,
            previous_period=date(2026, 2, 1),
        )
        march = await client.post(
            f"/api/apartments/{apartment_id}/invoices",
            json={"period": "2026-03-01"},
        )
        assert march.status_code == 201
        assert march.json()["lines"][0]["tariff_value"] == "7.50000"
        engine = create_database_engine(application.state.settings.database_path)
        with create_session_factory(engine)() as session:
            session.get(Invoice, march.json()["id"]).status = "paid"
            session.commit()
        engine.dispose()

        july = await client.post(
            f"/api/apartments/{apartment_id}/invoices",
            json={"period": "2026-07-01"},
        )
        assert july.status_code == 201
        gas_line = next(
            item for item in july.json()["lines"] if item["service_id"] == gas_id
        )
        assert gas_line["prev_reading"] == "100.000"
        assert gas_line["tariff_value"] == "7.95689"
    finally:
        await _close(lifespan, client)


async def test_backdated_draft_is_rejected_when_later_invoice_exists(
    tmp_path,
    monkeypatch,
) -> None:
    application, lifespan, client = await _client(tmp_path, monkeypatch)
    try:
        apartment_id, _ = _seed_billing_data(application)
        response = await client.post(
            f"/api/apartments/{apartment_id}/invoices",
            json={"period": "2026-03-01"},
        )
        assert response.status_code == 409
        assert "later invoice" in response.json()["detail"]

        engine = create_database_engine(application.state.settings.database_path)
        with create_session_factory(engine)() as session:
            invoices = session.scalars(
                select(Invoice).where(Invoice.apartment_id == apartment_id)
            ).all()
            assert [invoice.period for invoice in invoices] == [date(2026, 6, 1)]
        engine.dispose()
    finally:
        await _close(lifespan, client)


async def test_decreased_and_anomalous_readings_return_soft_warnings(
    tmp_path,
    monkeypatch,
) -> None:
    application, lifespan, client = await _client(tmp_path, monkeypatch)
    try:
        apartment_id, gas_id = _seed_billing_data(application)
        engine = create_database_engine(application.state.settings.database_path)
        with create_session_factory(engine)() as session:
            gas = session.get(Service, gas_id)
            apartment = session.get(Apartment, apartment_id)
            for month, current in enumerate(range(20, 70, 10), start=1):
                invoice = Invoice(
                    apartment=apartment,
                    period=date(2026, month, 1),
                    status="paid",
                    exchange_rate=Decimal("44"),
                    rent_amount_usd=Decimal("325"),
                    rent_amount_uah=Decimal("14300"),
                    utilities_total=Decimal("79.57"),
                    grand_total=Decimal("14379.57"),
                )
                invoice.lines.append(
                    InvoiceLine(
                        service=gas,
                        service_name="Газ",
                        service_kind="metered",
                        prev_reading=Decimal(current - 10),
                        curr_reading=Decimal(current),
                        consumed=Decimal("10"),
                        tariff_value=Decimal("7.95689"),
                        amount=Decimal("79.57"),
                    )
                )
                session.add(invoice)
            session.commit()
        engine.dispose()

        draft = (
            await client.post(
                f"/api/apartments/{apartment_id}/invoices",
                json={"period": "2026-07-01"},
            )
        ).json()
        gas_line = draft["lines"][0]
        decreased = (
            await client.put(
                f"/api/invoices/{draft['id']}",
                json={"lines": [{"id": gas_line["id"], "curr_reading": "50"}]},
            )
        ).json()
        assert {warning["code"] for warning in decreased["warnings"]} == {
            "reading_decreased",
            "consumption_anomaly",
        }

        anomalous = (
            await client.put(
                f"/api/invoices/{draft['id']}",
                json={"lines": [{"id": gas_line["id"], "curr_reading": "120"}]},
            )
        ).json()
        assert [warning["code"] for warning in anomalous["warnings"]] == [
            "consumption_anomaly"
        ]
    finally:
        await _close(lifespan, client)


async def test_reading_snapshot_survives_omitted_month_and_later_invoice_guard(
    tmp_path,
    monkeypatch,
) -> None:
    application, lifespan, client = await _client(tmp_path, monkeypatch)
    try:
        apartment_id, gas_id = _seed_billing_data(application)
        engine = create_database_engine(application.state.settings.database_path)
        with create_session_factory(engine)() as session:
            apartment = session.get(Apartment, apartment_id)
            fixed = session.scalar(
                select(Service).where(
                    Service.apartment_id == apartment_id,
                    Service.kind == "fixed",
                )
            )
            july = Invoice(
                apartment=apartment,
                period=date(2026, 7, 1),
                status="paid",
                exchange_rate=Decimal("44"),
                rent_amount_usd=Decimal("325"),
                rent_amount_uah=Decimal("14300"),
                utilities_total=Decimal("2035.46"),
                grand_total=Decimal("16335.46"),
            )
            july.lines.append(
                InvoiceLine(
                    service=fixed,
                    service_name=fixed.name,
                    service_kind="fixed",
                    prev_reading=None,
                    curr_reading=None,
                    consumed=None,
                    tariff_value=Decimal("2035.46"),
                    amount=Decimal("2035.46"),
                )
            )
            session.add(july)
            session.commit()
        engine.dispose()

        august = (
            await client.post(
                f"/api/apartments/{apartment_id}/invoices",
                json={"period": "2026-08-01"},
            )
        ).json()
        gas_line = next(line for line in august["lines"] if line["service_id"] == gas_id)
        assert gas_line["prev_reading"] == "100.000"
        assert gas_line["service_kind"] == "metered"

        engine = create_database_engine(application.state.settings.database_path)
        with create_session_factory(engine)() as session:
            session.get(Service, gas_id).kind = "fixed"
            session.commit()
        engine.dispose()
        updated = await client.put(
            f"/api/invoices/{august['id']}",
            json={"lines": [{"id": gas_line["id"], "curr_reading": "110"}]},
        )
        assert updated.status_code == 200
        assert updated.json()["lines"][0]["service_kind"] == "metered"

        september = await client.post(
            f"/api/apartments/{apartment_id}/invoices",
            json={"period": "2026-09-01"},
        )
        assert september.status_code == 409
        assert "earlier draft" in september.json()["detail"]
        assert (
            await client.post(f"/api/invoices/{august['id']}/issue")
        ).status_code == 200
        assert (
            await client.post(f"/api/invoices/{august['id']}/revert-to-draft")
        ).status_code == 200
    finally:
        await _close(lifespan, client)


async def test_invoice_validation_conflicts_and_auth(tmp_path, monkeypatch) -> None:
    application, lifespan, client = await _client(tmp_path, monkeypatch)
    try:
        apartment_id, _ = _seed_billing_data(application)
        assert (
            await client.post(
                f"/api/apartments/{apartment_id}/invoices",
                json={"period": "2026-07-14"},
            )
        ).status_code == 422
        assert (
            await client.post(
                "/api/apartments/999/invoices",
                json={"period": "2026-07-01"},
            )
        ).status_code == 404

        created = await client.post(
            f"/api/apartments/{apartment_id}/invoices",
            json={"period": "2026-07-01"},
        )
        assert created.status_code == 201
        duplicate = await client.post(
            f"/api/apartments/{apartment_id}/invoices",
            json={"period": "2026-07-01"},
        )
        assert duplicate.status_code == 409
        assert (await client.put("/api/invoices/999", json={})).status_code == 404

        engine = create_database_engine(application.state.settings.database_path)
        with create_session_factory(engine)() as session:
            invoice = session.scalar(select(Invoice).where(Invoice.id == created.json()["id"]))
            invoice.status = "issued"
            session.commit()
        engine.dispose()
        assert (
            await client.put(f"/api/invoices/{created.json()['id']}", json={})
        ).status_code == 409

        client.cookies.clear()
        assert (
            await client.post(
                f"/api/apartments/{apartment_id}/invoices",
                json={"period": "2026-08-01"},
            )
        ).status_code == 401
    finally:
        await _close(lifespan, client)


async def test_metered_invoice_requires_current_reading_before_issue(
    tmp_path,
    monkeypatch,
) -> None:
    application, lifespan, client = await _client(tmp_path, monkeypatch)
    try:
        apartment_id, _ = _seed_billing_data(application)
        draft = (
            await client.post(
                f"/api/apartments/{apartment_id}/invoices",
                json={"period": "2026-07-01"},
            )
        ).json()

        response = await client.post(f"/api/invoices/{draft['id']}/issue")

        assert response.status_code == 409
        assert "Current reading is required for Газ" in response.json()["detail"]
        detail = await client.get(f"/api/invoices/{draft['id']}")
        assert detail.json()["status"] == "draft"
    finally:
        await _close(lifespan, client)


async def test_deleting_mistaken_draft_unblocks_earlier_invoice(
    tmp_path,
    monkeypatch,
) -> None:
    application, lifespan, client = await _client(tmp_path, monkeypatch)
    try:
        apartment_id, _ = _seed_billing_data(
            application,
            previous_period=date(2026, 5, 1),
        )
        july = await client.post(
            f"/api/apartments/{apartment_id}/invoices",
            json={"period": "2026-07-01"},
        )
        assert july.status_code == 201
        blocked = await client.post(
            f"/api/apartments/{apartment_id}/invoices",
            json={"period": "2026-06-01"},
        )
        assert blocked.status_code == 409

        assert (await client.delete(f"/api/invoices/{july.json()['id']}")).status_code == 204
        recovered = await client.post(
            f"/api/apartments/{apartment_id}/invoices",
            json={"period": "2026-06-01"},
        )
        assert recovered.status_code == 201
        assert recovered.json()["period"] == "2026-06-01"
    finally:
        await _close(lifespan, client)


async def test_only_draft_invoice_can_be_deleted(tmp_path, monkeypatch) -> None:
    application, lifespan, client = await _client(tmp_path, monkeypatch)
    try:
        apartment_id, _ = _seed_billing_data(application)
        assert (await client.delete("/api/invoices/999")).status_code == 404

        engine = create_database_engine(application.state.settings.database_path)
        with create_session_factory(engine)() as session:
            issued = session.scalar(
                select(Invoice).where(Invoice.apartment_id == apartment_id)
            )
            issued.status = "issued"
            issued_id = issued.id
            session.commit()
        engine.dispose()

        response = await client.delete(f"/api/invoices/{issued_id}")
        assert response.status_code == 409
        assert response.json()["detail"] == "Only draft invoices can be deleted"
    finally:
        await _close(lifespan, client)


def test_stale_draft_cannot_delete_concurrently_issued_invoice(db_engine) -> None:
    session_factory = create_session_factory(db_engine)
    with session_factory() as seed_session:
        apartment = Apartment(
            name="Квартира 1",
            address="Київ",
            rent_amount=Decimal("325.00"),
            rent_currency="USD",
        )
        invoice = Invoice(
            apartment=apartment,
            period=date(2026, 7, 1),
            status="draft",
            exchange_rate=Decimal("44.000000"),
            rent_amount_usd=Decimal("325.00"),
            rent_amount_uah=Decimal("14300.00"),
            utilities_total=Decimal("0.00"),
            grand_total=Decimal("14300.00"),
        )
        seed_session.add(invoice)
        seed_session.commit()
        invoice_id = invoice.id

    with session_factory() as stale_session, session_factory() as issuer_session:
        assert get_invoice(stale_session, invoice_id).status == "draft"
        assert transition_invoice(issuer_session, invoice_id, "issue").status == "issued"

        with pytest.raises(BillingConflictError, match="Only draft invoices"):
            delete_draft(stale_session, invoice_id)

    with session_factory() as verify_session:
        preserved = get_invoice(verify_session, invoice_id)
        assert preserved.status == "issued"
