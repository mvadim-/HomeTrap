from __future__ import annotations

from datetime import date
from decimal import Decimal

from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.db import create_database_engine, create_session_factory
from app.main import create_app
from app.models import Invoice, InvoiceLine


async def _create_client(tmp_path):
    settings = Settings(
        database_path=tmp_path / "apartments.db",
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
    response = await client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "password"},
    )
    assert response.status_code == 200
    return application, lifespan, client


async def _close_client(lifespan, client: AsyncClient) -> None:
    await client.aclose()
    await lifespan.__aexit__(None, None, None)


def _apartment_payload(**overrides) -> dict:
    payload = {
        "name": "Квартира 1",
        "address": "Київ, вул. Хрещатик, 1",
        "rent_amount": "325.00",
        "rent_currency": "USD",
        "notes": "Тестова квартира",
    }
    payload.update(overrides)
    return payload


def _service_payload(**overrides) -> dict:
    payload = {
        "name": "Газ",
        "kind": "metered",
        "unit": "м³",
        "provider_account": "12345",
        "sort_order": 10,
    }
    payload.update(overrides)
    return payload


async def test_apartment_crud_archive_and_latest_invoice_summary(tmp_path) -> None:
    application, lifespan, client = await _create_client(tmp_path)
    try:
        create_response = await client.post(
            "/api/apartments",
            json=_apartment_payload(),
        )
        assert create_response.status_code == 201
        apartment = create_response.json()
        assert apartment["rent_amount"] == "325.00"
        assert apartment["latest_invoice"] is None

        engine = create_database_engine(application.state.settings.database_path)
        with create_session_factory(engine)() as session:
            session.add(
                Invoice(
                    apartment_id=apartment["id"],
                    period=date(2026, 7, 1),
                    exchange_rate=Decimal("44.680000"),
                    rent_amount_usd=Decimal("325.00"),
                    rent_amount_uah=Decimal("14521.00"),
                    utilities_total=Decimal("2210.51"),
                    grand_total=Decimal("16731.51"),
                )
            )
            session.commit()
        engine.dispose()

        list_response = await client.get("/api/apartments")
        assert list_response.status_code == 200
        latest = list_response.json()[0]["latest_invoice"]
        assert latest["period"] == "2026-07-01"
        assert latest["grand_total"] == "16731.51"

        update_response = await client.put(
            f"/api/apartments/{apartment['id']}",
            json=_apartment_payload(name="Оновлена", rent_amount="350.00"),
        )
        assert update_response.status_code == 200
        assert update_response.json()["name"] == "Оновлена"
        assert update_response.json()["rent_amount"] == "350.00"

        archive_response = await client.delete(f"/api/apartments/{apartment['id']}")
        assert archive_response.status_code == 204
        detail_response = await client.get(f"/api/apartments/{apartment['id']}")
        assert detail_response.json()["is_active"] is False
    finally:
        await _close_client(lifespan, client)


async def test_apartment_routes_require_auth_and_return_404(tmp_path) -> None:
    _, lifespan, client = await _create_client(tmp_path)
    try:
        client.cookies.clear()
        assert (await client.get("/api/apartments")).status_code == 401

        login_response = await client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "password"},
        )
        assert login_response.status_code == 200
        assert (await client.get("/api/apartments/999")).status_code == 404
        invalid_response = await client.post(
            "/api/apartments",
            json=_apartment_payload(rent_amount="-1.00"),
        )
        assert invalid_response.status_code == 422
    finally:
        await _close_client(lifespan, client)


async def test_service_crud_is_sorted_and_validated(tmp_path) -> None:
    _, lifespan, client = await _create_client(tmp_path)
    try:
        apartment = (
            await client.post("/api/apartments", json=_apartment_payload())
        ).json()
        later = (
            await client.post(
                f"/api/apartments/{apartment['id']}/services",
                json=_service_payload(name="Газ", sort_order=20),
            )
        ).json()
        earlier_response = await client.post(
            f"/api/apartments/{apartment['id']}/services",
            json=_service_payload(
                name="Електроенергія",
                unit="кВт·год",
                sort_order=5,
            ),
        )
        assert earlier_response.status_code == 201

        services_response = await client.get(
            f"/api/apartments/{apartment['id']}/services"
        )
        assert [item["name"] for item in services_response.json()] == [
            "Електроенергія",
            "Газ",
        ]

        update_response = await client.put(
            f"/api/apartments/{apartment['id']}/services/{later['id']}",
            json=_service_payload(name="Газопостачання", sort_order=1),
        )
        assert update_response.status_code == 200
        assert update_response.json()["name"] == "Газопостачання"

        delete_response = await client.delete(
            f"/api/apartments/{apartment['id']}/services/"
            f"{earlier_response.json()['id']}"
        )
        assert delete_response.status_code == 204

        assert (
            await client.get(f"/api/apartments/{apartment['id']}/services/999")
        ).status_code == 404
        invalid_kind = await client.post(
            f"/api/apartments/{apartment['id']}/services",
            json=_service_payload(kind="unknown"),
        )
        assert invalid_kind.status_code == 422
    finally:
        await _close_client(lifespan, client)


async def test_service_with_invoice_lines_must_be_deactivated(tmp_path) -> None:
    application, lifespan, client = await _create_client(tmp_path)
    try:
        apartment = (
            await client.post("/api/apartments", json=_apartment_payload())
        ).json()
        service = (
            await client.post(
                f"/api/apartments/{apartment['id']}/services",
                json=_service_payload(),
            )
        ).json()

        engine = create_database_engine(application.state.settings.database_path)
        with create_session_factory(engine)() as session:
            invoice = Invoice(
                apartment_id=apartment["id"],
                period=date(2026, 7, 1),
                exchange_rate=Decimal("44.680000"),
                rent_amount_usd=Decimal("325.00"),
                rent_amount_uah=Decimal("14521.00"),
                utilities_total=Decimal("175.05"),
                grand_total=Decimal("14696.05"),
            )
            session.add(invoice)
            session.flush()
            session.add(
                InvoiceLine(
                    invoice_id=invoice.id,
                    service_id=service["id"],
                    service_name="Газ",
                    service_kind="metered",
                    prev_reading=Decimal("100.000"),
                    curr_reading=Decimal("122.000"),
                    consumed=Decimal("22.000"),
                    tariff_value=Decimal("7.95689"),
                    amount=Decimal("175.05"),
                )
            )
            session.commit()
        engine.dispose()

        delete_response = await client.delete(
            f"/api/apartments/{apartment['id']}/services/{service['id']}"
        )
        assert delete_response.status_code == 409

        deactivate_response = await client.put(
            f"/api/apartments/{apartment['id']}/services/{service['id']}",
            json={**_service_payload(), "is_active": False},
        )
        assert deactivate_response.status_code == 200
        assert deactivate_response.json()["is_active"] is False
    finally:
        await _close_client(lifespan, client)


async def test_tariff_history_duplicate_date_and_decimal_serialization(
    tmp_path,
) -> None:
    _, lifespan, client = await _create_client(tmp_path)
    try:
        apartment = (
            await client.post("/api/apartments", json=_apartment_payload())
        ).json()
        service = (
            await client.post(
                f"/api/apartments/{apartment['id']}/services",
                json=_service_payload(),
            )
        ).json()

        newer_response = await client.post(
            f"/api/services/{service['id']}/tariffs",
            json={"value": "7.95689", "valid_from": "2026-04-01"},
        )
        older_response = await client.post(
            f"/api/services/{service['id']}/tariffs",
            json={"value": "7.50000", "valid_from": "2025-01-01"},
        )
        assert newer_response.status_code == 201
        assert newer_response.json()["value"] == "7.95689"
        assert older_response.status_code == 201

        list_response = await client.get(f"/api/services/{service['id']}/tariffs")
        assert [item["valid_from"] for item in list_response.json()] == [
            "2025-01-01",
            "2026-04-01",
        ]

        duplicate_response = await client.post(
            f"/api/services/{service['id']}/tariffs",
            json={"value": "8.10000", "valid_from": "2026-04-01"},
        )
        assert duplicate_response.status_code == 409
        assert (await client.get("/api/services/999/tariffs")).status_code == 404
    finally:
        await _close_client(lifespan, client)
