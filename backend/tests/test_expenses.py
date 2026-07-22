from datetime import date
from decimal import Decimal

from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.db import create_database_engine, create_session_factory
from app.main import create_app
from app.models import Apartment, Expense, Invoice, InvoiceLine


async def _create_client(tmp_path):
    settings = Settings(
        database_path=tmp_path / "expenses.db",
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
    return lifespan, client


async def _close_client(lifespan, client: AsyncClient) -> None:
    await client.aclose()
    await lifespan.__aexit__(None, None, None)


def _seed_linked_expense(database_path) -> int:
    engine = create_database_engine(database_path)
    with create_session_factory(engine)() as session:
        apartment = Apartment(
            name="Квартира з компенсацією",
            address="Київ",
            rent_amount=Decimal("500.00"),
            rent_currency="USD",
        )
        invoice = Invoice(
            apartment=apartment,
            period=date(2026, 7, 1),
            exchange_rate=Decimal("40.000000"),
            rent_amount_usd=Decimal("500.00"),
            rent_amount_uah=Decimal("20000.00"),
            utilities_total=Decimal("0.00"),
            adjustments_total=Decimal("-500.00"),
            grand_total=Decimal("19500.00"),
        )
        line = InvoiceLine(
            invoice=invoice,
            service_name="Компенсація ремонту",
            service_kind="adjustment",
            tariff_value=Decimal("0"),
            amount=Decimal("-500.00"),
        )
        expense = Expense(
            apartment=apartment,
            invoice_line=line,
            date=invoice.period,
            category="repair",
            amount=Decimal("500.00"),
        )
        session.add(expense)
        session.commit()
        expense_id = expense.id
    engine.dispose()
    return expense_id


async def _create_apartment(client: AsyncClient, name: str = "Квартира 1") -> dict:
    response = await client.post(
        "/api/apartments",
        json={
            "name": name,
            "address": "Київ, вул. Хрещатик, 1",
            "rent_amount": "325.00",
            "rent_currency": "USD",
            "notes": None,
        },
    )
    assert response.status_code == 201
    return response.json()


def _expense_payload(**overrides) -> dict:
    payload = {
        "apartment_id": None,
        "date": "2026-03-15",
        "category": "repair",
        "amount": "1200.50",
        "currency": "UAH",
        "notes": "Ремонт крана",
    }
    payload.update(overrides)
    return payload


async def test_expense_crud_happy_path(tmp_path) -> None:
    lifespan, client = await _create_client(tmp_path)
    try:
        apartment = await _create_apartment(client)
        apartment_id = apartment["id"]

        empty = await client.get("/api/expenses")
        assert empty.status_code == 200
        assert empty.json() == []

        created = await client.post(
            "/api/expenses",
            json=_expense_payload(apartment_id=apartment_id),
        )
        assert created.status_code == 201
        expense = created.json()
        assert expense["apartment_id"] == apartment_id
        assert expense["category"] == "repair"
        assert expense["amount"] == "1200.50"
        assert expense["currency"] == "UAH"
        assert expense["invoice_line_id"] is None
        expense_id = expense["id"]

        listed = await client.get("/api/expenses")
        assert listed.status_code == 200
        assert len(listed.json()) == 1

        patched = await client.patch(
            f"/api/expenses/{expense_id}",
            json={"amount": "999.99", "category": "tax"},
        )
        assert patched.status_code == 200
        assert patched.json()["amount"] == "999.99"
        assert patched.json()["category"] == "tax"
        assert patched.json()["notes"] == "Ремонт крана"

        deleted = await client.delete(f"/api/expenses/{expense_id}")
        assert deleted.status_code == 204
        assert (await client.get("/api/expenses")).json() == []
    finally:
        await _close_client(lifespan, client)


async def test_linked_expense_cannot_be_updated_or_deleted_directly(tmp_path) -> None:
    lifespan, client = await _create_client(tmp_path)
    try:
        expense_id = _seed_linked_expense(tmp_path / "expenses.db")

        patched = await client.patch(
            f"/api/expenses/{expense_id}",
            json={"amount": "1.00", "category": "tax"},
        )
        deleted = await client.delete(f"/api/expenses/{expense_id}")

        assert patched.status_code == 409
        assert deleted.status_code == 409
        listed = await client.get("/api/expenses")
        linked = next(row for row in listed.json() if row["id"] == expense_id)
        assert linked["amount"] == "500.00"
        assert linked["category"] == "repair"
        assert linked["invoice_line_id"] is not None
    finally:
        await _close_client(lifespan, client)


async def test_expense_currency_default_and_normalization(tmp_path) -> None:
    lifespan, client = await _create_client(tmp_path)
    try:
        payload = _expense_payload()
        del payload["currency"]
        created = await client.post("/api/expenses", json=payload)
        assert created.status_code == 201
        assert created.json()["currency"] == "UAH"

        usd = await client.post(
            "/api/expenses",
            json=_expense_payload(currency="usd"),
        )
        assert usd.status_code == 201
        assert usd.json()["currency"] == "USD"
    finally:
        await _close_client(lifespan, client)


async def test_general_expense_without_apartment(tmp_path) -> None:
    lifespan, client = await _create_client(tmp_path)
    try:
        created = await client.post("/api/expenses", json=_expense_payload())
        assert created.status_code == 201
        assert created.json()["apartment_id"] is None
    finally:
        await _close_client(lifespan, client)


async def test_expense_filters_by_apartment_and_dates(tmp_path) -> None:
    lifespan, client = await _create_client(tmp_path)
    try:
        first = await _create_apartment(client, "Квартира 1")
        second = await _create_apartment(client, "Квартира 2")

        await client.post(
            "/api/expenses",
            json=_expense_payload(apartment_id=first["id"], date="2026-01-10"),
        )
        await client.post(
            "/api/expenses",
            json=_expense_payload(apartment_id=first["id"], date="2026-03-10"),
        )
        await client.post(
            "/api/expenses",
            json=_expense_payload(apartment_id=second["id"], date="2026-02-10"),
        )
        await client.post(
            "/api/expenses",
            json=_expense_payload(apartment_id=None, date="2026-02-20"),
        )

        by_apartment = await client.get(
            "/api/expenses", params={"apartment_id": first["id"]}
        )
        assert by_apartment.status_code == 200
        assert len(by_apartment.json()) == 2
        assert {row["apartment_id"] for row in by_apartment.json()} == {first["id"]}

        by_range = await client.get(
            "/api/expenses",
            params={"date_from": "2026-02-01", "date_to": "2026-02-28"},
        )
        assert by_range.status_code == 200
        dates = sorted(row["date"] for row in by_range.json())
        assert dates == ["2026-02-10", "2026-02-20"]
    finally:
        await _close_client(lifespan, client)


async def test_expense_patch_apartment_and_currency(tmp_path) -> None:
    lifespan, client = await _create_client(tmp_path)
    try:
        first = await _create_apartment(client, "Квартира 1")
        second = await _create_apartment(client, "Квартира 2")

        created = await client.post(
            "/api/expenses",
            json=_expense_payload(apartment_id=first["id"]),
        )
        expense_id = created.json()["id"]

        # Move to a different valid apartment.
        moved = await client.patch(
            f"/api/expenses/{expense_id}",
            json={"apartment_id": second["id"]},
        )
        assert moved.status_code == 200
        assert moved.json()["apartment_id"] == second["id"]

        # Reset apartment_id back to null (general expense).
        generalized = await client.patch(
            f"/api/expenses/{expense_id}",
            json={"apartment_id": None},
        )
        assert generalized.status_code == 200
        assert generalized.json()["apartment_id"] is None

        # Currency is normalized on update (ExpenseUpdate.validate_currency).
        normalized = await client.patch(
            f"/api/expenses/{expense_id}",
            json={"currency": "usd"},
        )
        assert normalized.status_code == 200
        assert normalized.json()["currency"] == "USD"
    finally:
        await _close_client(lifespan, client)


async def test_expense_date_to_filter_is_inclusive(tmp_path) -> None:
    lifespan, client = await _create_client(tmp_path)
    try:
        await client.post("/api/expenses", json=_expense_payload(date="2026-02-28"))
        await client.post("/api/expenses", json=_expense_payload(date="2026-03-01"))

        # The upper bound is inclusive: an expense dated exactly on date_to is kept.
        boundary = await client.get(
            "/api/expenses",
            params={"date_from": "2026-02-01", "date_to": "2026-02-28"},
        )
        assert boundary.status_code == 200
        assert sorted(row["date"] for row in boundary.json()) == ["2026-02-28"]
    finally:
        await _close_client(lifespan, client)


async def test_expense_validation_errors(tmp_path) -> None:
    lifespan, client = await _create_client(tmp_path)
    try:
        non_positive = await client.post(
            "/api/expenses", json=_expense_payload(amount="0")
        )
        assert non_positive.status_code == 422

        negative = await client.post(
            "/api/expenses", json=_expense_payload(amount="-5")
        )
        assert negative.status_code == 422

        bad_category = await client.post(
            "/api/expenses", json=_expense_payload(category="grocery")
        )
        assert bad_category.status_code == 422

        bad_currency = await client.post(
            "/api/expenses", json=_expense_payload(currency="U1")
        )
        assert bad_currency.status_code == 422
    finally:
        await _close_client(lifespan, client)


async def test_expense_not_found_cases(tmp_path) -> None:
    lifespan, client = await _create_client(tmp_path)
    try:
        missing_apartment = await client.post(
            "/api/expenses", json=_expense_payload(apartment_id=999)
        )
        assert missing_apartment.status_code == 404

        missing_patch = await client.patch(
            "/api/expenses/999", json={"amount": "10.00"}
        )
        assert missing_patch.status_code == 404

        missing_delete = await client.delete("/api/expenses/999")
        assert missing_delete.status_code == 404

        created = await client.post("/api/expenses", json=_expense_payload())
        expense_id = created.json()["id"]
        patch_missing_apartment = await client.patch(
            f"/api/expenses/{expense_id}", json={"apartment_id": 999}
        )
        assert patch_missing_apartment.status_code == 404
    finally:
        await _close_client(lifespan, client)


async def test_expense_routes_require_auth(tmp_path) -> None:
    lifespan, client = await _create_client(tmp_path)
    try:
        await client.post("/api/auth/logout")
        response = await client.get("/api/expenses")
        assert response.status_code == 401
    finally:
        await _close_client(lifespan, client)
