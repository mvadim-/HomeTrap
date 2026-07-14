from __future__ import annotations

from datetime import date
from decimal import Decimal

from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.db import create_database_engine, create_session_factory
from app.main import create_app
from app.models import Apartment, Service, Tariff
from app.services.nbu import RateResult


async def _client(tmp_path, monkeypatch):
    settings = Settings(
        database_path=tmp_path / "invoice-status.db",
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


def _seed_apartment(application, name: str) -> int:
    engine = create_database_engine(application.state.settings.database_path)
    with create_session_factory(engine)() as session:
        apartment = Apartment(
            name=name,
            address="Київ",
            rent_amount=Decimal("325.00"),
            rent_currency="USD",
        )
        service = Service(
            apartment=apartment,
            name="Утримання будинку",
            kind="fixed",
            unit="грн",
        )
        service.tariffs.append(
            Tariff(value=Decimal("500.00"), valid_from=date(2026, 1, 1))
        )
        session.add(apartment)
        session.commit()
        apartment_id = apartment.id
    engine.dispose()
    return apartment_id


async def _create_invoice(client: AsyncClient, apartment_id: int, period: str) -> dict:
    response = await client.post(
        f"/api/apartments/{apartment_id}/invoices",
        json={"period": period},
    )
    assert response.status_code == 201
    return response.json()


async def test_invoice_full_lifecycle_and_forbidden_transitions(
    tmp_path,
    monkeypatch,
) -> None:
    application, lifespan, client = await _client(tmp_path, monkeypatch)
    try:
        apartment_id = _seed_apartment(application, "Квартира 1")
        draft = await _create_invoice(client, apartment_id, "2026-07-01")

        paid_from_draft = await client.post(
            f"/api/invoices/{draft['id']}/mark-paid"
        )
        assert paid_from_draft.status_code == 409

        issued_response = await client.post(f"/api/invoices/{draft['id']}/issue")
        assert issued_response.status_code == 200
        issued = issued_response.json()
        assert issued["status"] == "issued"
        assert issued["issued_at"] is not None
        assert issued["paid_at"] is None
        assert issued["exchange_rate"] == "44.680000"
        assert issued["lines"][0]["tariff_value"] == "500.00000"

        assert (
            await client.put(f"/api/invoices/{draft['id']}", json={})
        ).status_code == 409
        assert (
            await client.post(f"/api/invoices/{draft['id']}/issue")
        ).status_code == 409

        paid_response = await client.post(f"/api/invoices/{draft['id']}/mark-paid")
        assert paid_response.status_code == 200
        paid = paid_response.json()
        assert paid["status"] == "paid"
        assert paid["issued_at"] == issued["issued_at"]
        assert paid["paid_at"] is not None
        assert (
            await client.post(f"/api/invoices/{draft['id']}/revert-to-draft")
        ).status_code == 409

        unpaid_response = await client.post(
            f"/api/invoices/{draft['id']}/unmark-paid"
        )
        assert unpaid_response.status_code == 200
        assert unpaid_response.json()["status"] == "issued"
        assert unpaid_response.json()["paid_at"] is None

        reverted_response = await client.post(
            f"/api/invoices/{draft['id']}/revert-to-draft"
        )
        assert reverted_response.status_code == 200
        assert reverted_response.json()["status"] == "draft"
        assert reverted_response.json()["issued_at"] is None

        detail = await client.get(f"/api/invoices/{draft['id']}")
        assert detail.status_code == 200
        assert detail.json()["lines"][0]["amount"] == "500.00"
        assert (await client.get("/api/invoices/999")).status_code == 404
        assert (
            await client.post("/api/invoices/999/issue")
        ).status_code == 404
    finally:
        await _close(lifespan, client)


async def test_invoice_list_filters_by_apartment_status_and_period(
    tmp_path,
    monkeypatch,
) -> None:
    application, lifespan, client = await _client(tmp_path, monkeypatch)
    try:
        first_id = _seed_apartment(application, "Квартира 1")
        second_id = _seed_apartment(application, "Квартира 2")
        june = await _create_invoice(client, first_id, "2026-06-01")
        july = await _create_invoice(client, first_id, "2026-07-01")
        august = await _create_invoice(client, second_id, "2026-08-01")
        await client.post(f"/api/invoices/{july['id']}/issue")
        await client.post(f"/api/invoices/{august['id']}/issue")
        await client.post(f"/api/invoices/{august['id']}/mark-paid")

        all_invoices = await client.get("/api/invoices")
        assert all_invoices.status_code == 200
        assert [item["id"] for item in all_invoices.json()] == [
            august["id"],
            july["id"],
            june["id"],
        ]
        assert "lines" not in all_invoices.json()[0]

        apartment_filter = await client.get(
            "/api/invoices", params={"apartment_id": first_id}
        )
        assert [item["id"] for item in apartment_filter.json()] == [
            july["id"],
            june["id"],
        ]

        status_filter = await client.get(
            "/api/invoices", params={"status": "issued"}
        )
        assert [item["id"] for item in status_filter.json()] == [july["id"]]

        period_filter = await client.get(
            "/api/invoices", params={"period": "2026-06-01"}
        )
        assert [item["id"] for item in period_filter.json()] == [june["id"]]
        assert (
            await client.get("/api/invoices", params={"status": "unknown"})
        ).status_code == 422

        client.cookies.clear()
        assert (await client.get("/api/invoices")).status_code == 401
    finally:
        await _close(lifespan, client)
