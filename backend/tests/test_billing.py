from __future__ import annotations

from datetime import date
from decimal import Decimal

from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.config import Settings
from app.db import create_database_engine, create_session_factory
from app.main import create_app
from app.models import Apartment, Invoice, InvoiceLine, Service, Tariff
from app.services.nbu import RateResult


async def _client(tmp_path, monkeypatch):
    settings = Settings(
        database_path=tmp_path / "billing.db",
        secret_key="test-session-secret",
        debug=True,
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


def _seed_billing_data(application, *, with_previous: bool = True) -> tuple[int, int]:
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
                period=date(2026, 6, 1),
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
        apartment_id, gas_id = _seed_billing_data(application)
        march = await client.post(
            f"/api/apartments/{apartment_id}/invoices",
            json={"period": "2026-03-01"},
        )
        assert march.status_code == 201
        assert march.json()["lines"][0]["tariff_value"] == "7.50000"

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
