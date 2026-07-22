from __future__ import annotations

from datetime import date
from decimal import Decimal

from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.db import create_database_engine, create_session_factory
from app.main import create_app
from app.models import Apartment, Invoice, InvoiceLine, Service


async def _client(tmp_path):
    settings = Settings(
        database_path=tmp_path / "invoices.db",
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
    return application, lifespan, client


async def _close(lifespan, client: AsyncClient) -> None:
    await client.aclose()
    await lifespan.__aexit__(None, None, None)


def _seed_draft(application) -> int:
    engine = create_database_engine(application.state.settings.database_path)
    with create_session_factory(engine)() as session:
        apartment = Apartment(
            name="Квартира для API",
            address="Київ",
            rent_amount=Decimal("1000.00"),
            rent_currency="UAH",
        )
        service = Service(
            apartment=apartment,
            name="Утримання будинку",
            kind="fixed",
            unit="грн",
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
        invoice_id = invoice.id
    engine.dispose()
    return invoice_id


async def test_adjustment_api_create_update_delete_and_serialize(tmp_path) -> None:
    application, lifespan, client = await _client(tmp_path)
    try:
        invoice_id = _seed_draft(application)
        created_response = await client.put(
            f"/api/invoices/{invoice_id}",
            json={
                "adjustments": [
                    {
                        "label": " Компенсація ремонту котла ",
                        "amount": "-250.00",
                        "record_as_expense": True,
                        "category": "repair",
                    }
                ]
            },
        )

        assert created_response.status_code == 200
        created = created_response.json()
        adjustment = next(line for line in created["lines"] if line["kind"] == "adjustment")
        assert adjustment["service_id"] is None
        assert adjustment["service_name"] == "Компенсація ремонту котла"
        assert adjustment["service_kind"] == "adjustment"
        assert adjustment["tariff_value"] == "0"
        assert adjustment["amount"] == "-250.00"
        assert adjustment["expense"]["category"] == "repair"
        assert created["utilities_total"] == "100.00"
        assert created["adjustments_total"] == "-250.00"
        assert created["grand_total"] == "850.00"

        expense_id = adjustment["expense"]["id"]
        updated_response = await client.put(
            f"/api/invoices/{invoice_id}",
            json={
                "adjustments": [
                    {
                        "id": adjustment["id"],
                        "label": "Компенсація заміни котла",
                        "amount": "-300.00",
                        "record_as_expense": True,
                        "category": "other",
                    }
                ]
            },
        )
        assert updated_response.status_code == 200
        updated = updated_response.json()
        updated_adjustment = next(
            line for line in updated["lines"] if line["kind"] == "adjustment"
        )
        assert updated_adjustment["service_name"] == "Компенсація заміни котла"
        assert updated_adjustment["expense"] == {"id": expense_id, "category": "other"}
        assert updated["adjustments_total"] == "-300.00"

        detail = await client.get(f"/api/invoices/{invoice_id}")
        assert detail.status_code == 200
        assert next(
            line for line in detail.json()["lines"] if line["kind"] == "adjustment"
        )["expense"] == {"id": expense_id, "category": "other"}

        deleted = await client.put(
            f"/api/invoices/{invoice_id}", json={"adjustments": []}
        )
        assert deleted.status_code == 200
        assert all(line["kind"] != "adjustment" for line in deleted.json()["lines"])
        assert deleted.json()["adjustments_total"] == "0.00"
        assert deleted.json()["grand_total"] == "1100.00"
    finally:
        await _close(lifespan, client)


async def test_adjustment_api_validation_and_non_draft_conflict(tmp_path) -> None:
    application, lifespan, client = await _client(tmp_path)
    try:
        invoice_id = _seed_draft(application)

        positive_expense = await client.put(
            f"/api/invoices/{invoice_id}",
            json={
                "adjustments": [
                    {
                        "label": "Доплата",
                        "amount": "50.00",
                        "record_as_expense": True,
                        "category": "repair",
                    }
                ]
            },
        )
        assert positive_expense.status_code == 422

        invalid_category = await client.put(
            f"/api/invoices/{invoice_id}",
            json={
                "adjustments": [
                    {
                        "label": "Компенсація",
                        "amount": "-50.00",
                        "record_as_expense": True,
                        "category": "fuel",
                    }
                ]
            },
        )
        assert invalid_category.status_code == 422

        missing_category = await client.put(
            f"/api/invoices/{invoice_id}",
            json={
                "adjustments": [
                    {
                        "label": "Компенсація",
                        "amount": "-50.00",
                        "record_as_expense": True,
                    }
                ]
            },
        )
        assert missing_category.status_code == 422

        engine = create_database_engine(application.state.settings.database_path)
        with create_session_factory(engine)() as session:
            session.get(Invoice, invoice_id).status = "issued"
            session.commit()
        engine.dispose()

        non_draft = await client.put(
            f"/api/invoices/{invoice_id}",
            json={
                "adjustments": [
                    {
                        "label": "Компенсація",
                        "amount": "-50.00",
                        "record_as_expense": False,
                    }
                ]
            },
        )
        assert non_draft.status_code == 409
    finally:
        await _close(lifespan, client)
