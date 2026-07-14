from __future__ import annotations

from datetime import date
from decimal import Decimal

from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.db import create_database_engine, create_session_factory
from app.main import create_app
from app.models import Apartment, Invoice, InvoiceLine, Service


def _shift_month(value: date, offset: int) -> date:
    month_index = value.year * 12 + value.month - 1 + offset
    return date(month_index // 12, month_index % 12 + 1, 1)


async def _client(tmp_path):
    settings = Settings(
        database_path=tmp_path / "stats.db",
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
    return application, lifespan, client


async def _close(lifespan, client: AsyncClient) -> None:
    await client.aclose()
    await lifespan.__aexit__(None, None, None)


def _add_invoice(
    apartment: Apartment,
    service: Service,
    *,
    period: date,
    status: str,
    rent: str,
    utilities: str,
    consumed: str,
) -> Invoice:
    rent_amount = Decimal(rent)
    utilities_amount = Decimal(utilities)
    invoice = Invoice(
        apartment=apartment,
        period=period,
        status=status,
        exchange_rate=Decimal("40.000000"),
        rent_amount_usd=Decimal("0.00"),
        rent_amount_uah=rent_amount,
        utilities_total=utilities_amount,
        grand_total=rent_amount + utilities_amount,
    )
    invoice.lines.append(
        InvoiceLine(
            service=service,
            service_name=service.name,
            prev_reading=Decimal("100.000"),
            curr_reading=Decimal("100.000") + Decimal(consumed),
            consumed=Decimal(consumed),
            tariff_value=Decimal("5.00000"),
            amount=utilities_amount,
        )
    )
    return invoice


def _seed_stats(application) -> tuple[int, int, int]:
    current = date.today().replace(day=1)
    previous = _shift_month(current, -1)
    engine = create_database_engine(application.state.settings.database_path)
    with create_session_factory(engine)() as session:
        first = Apartment(
            name="Квартира 1",
            address="Київ",
            rent_amount=Decimal("100.00"),
            rent_currency="USD",
        )
        first_gas = Service(
            apartment=first,
            name="Газ",
            kind="metered",
            unit="м³",
            sort_order=1,
        )
        first_fixed = Service(
            apartment=first,
            name="Утримання будинку",
            kind="fixed",
            unit="грн",
            sort_order=2,
        )
        second = Apartment(
            name="Квартира 2",
            address="Львів",
            rent_amount=Decimal("200.00"),
            rent_currency="USD",
        )
        second_water = Service(
            apartment=second,
            name="Вода",
            kind="metered",
            unit="м³",
        )
        empty = Apartment(
            name="Без історії",
            address="Одеса",
            rent_amount=Decimal("150.00"),
            rent_currency="USD",
        )
        first.invoices.extend(
            [
                _add_invoice(
                    first,
                    first_gas,
                    period=previous,
                    status="paid",
                    rent="1000.00",
                    utilities="100.00",
                    consumed="10.000",
                ),
                _add_invoice(
                    first,
                    first_gas,
                    period=current,
                    status="issued",
                    rent="1100.00",
                    utilities="200.00",
                    consumed="12.000",
                ),
            ]
        )
        first.invoices[0].lines.append(
            InvoiceLine(
                service=first_fixed,
                service_name=first_fixed.name,
                prev_reading=None,
                curr_reading=None,
                consumed=None,
                tariff_value=Decimal("50.00000"),
                amount=Decimal("50.00"),
            )
        )
        second.invoices.append(
            _add_invoice(
                second,
                second_water,
                period=current,
                status="paid",
                rent="2000.00",
                utilities="300.00",
                consumed="20.000",
            )
        )
        session.add_all([first, second, empty])
        session.commit()
        result = first.id, second.id, empty.id
    engine.dispose()
    return result


async def test_consumption_groups_metered_services_by_month(tmp_path) -> None:
    application, lifespan, client = await _client(tmp_path)
    try:
        first_id, _, _ = _seed_stats(application)
        response = await client.get(
            "/api/stats/consumption",
            params={"apartment_id": first_id, "months": 2},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["apartment_id"] == first_id
        assert payload["months"] == 2
        assert len(payload["series"]) == 1
        assert payload["series"][0]["service_name"] == "Газ"
        assert payload["series"][0]["unit"] == "м³"
        assert [point["consumed"] for point in payload["series"][0]["values"]] == [
            "10.000",
            "12.000",
        ]
    finally:
        await _close(lifespan, client)


async def test_income_aggregates_apartment_and_portfolio(tmp_path) -> None:
    application, lifespan, client = await _client(tmp_path)
    try:
        first_id, _, _ = _seed_stats(application)
        apartment = await client.get(
            "/api/stats/income",
            params={"apartment_id": first_id, "months": 2},
        )
        assert apartment.status_code == 200
        payload = apartment.json()
        assert payload["scope"] == "apartment"
        assert payload["totals"] == {
            "rent": "2100.00",
            "utilities": "300.00",
            "total": "2400.00",
        }
        assert [point["total"] for point in payload["values"]] == [
            "1100.00",
            "1300.00",
        ]

        portfolio = await client.get("/api/stats/income", params={"months": 2})
        assert portfolio.status_code == 200
        payload = portfolio.json()
        assert payload["scope"] == "portfolio"
        assert payload["apartment_id"] is None
        assert payload["totals"] == {
            "rent": "4100.00",
            "utilities": "600.00",
            "total": "4700.00",
        }
        assert [point["total"] for point in payload["values"]] == [
            "1100.00",
            "3600.00",
        ]
    finally:
        await _close(lifespan, client)


async def test_dashboard_and_empty_history(tmp_path) -> None:
    application, lifespan, client = await _client(tmp_path)
    try:
        first_id, _, empty_id = _seed_stats(application)
        dashboard = await client.get("/api/stats/dashboard")
        assert dashboard.status_code == 200
        payload = dashboard.json()
        assert payload["charged"] == "3600.00"
        assert payload["paid"] == "2300.00"
        assert payload["outstanding"] == "1300.00"
        assert payload["needs_attention"] == [
            {
                "invoice_id": payload["needs_attention"][0]["invoice_id"],
                "apartment_id": first_id,
                "apartment_name": "Квартира 1",
                "period": date.today().replace(day=1).isoformat(),
                "status": "issued",
                "grand_total": "1300.00",
                "reason": "unpaid",
            }
        ]

        consumption = await client.get(
            "/api/stats/consumption", params={"apartment_id": empty_id}
        )
        assert consumption.status_code == 200
        assert consumption.json()["series"] == []

        income = await client.get(
            "/api/stats/income", params={"apartment_id": empty_id}
        )
        assert income.status_code == 200
        assert income.json()["values"] == []
        assert income.json()["totals"] == {
            "rent": "0.00",
            "utilities": "0.00",
            "total": "0.00",
        }
    finally:
        await _close(lifespan, client)


async def test_stats_validation_not_found_and_auth(tmp_path) -> None:
    application, lifespan, client = await _client(tmp_path)
    try:
        assert (
            await client.get(
                "/api/stats/consumption",
                params={"apartment_id": 999},
            )
        ).status_code == 404
        assert (
            await client.get(
                "/api/stats/income",
                params={"apartment_id": 999},
            )
        ).status_code == 404
        assert (
            await client.get("/api/stats/income", params={"months": 0})
        ).status_code == 422
        client.cookies.clear()
        assert (await client.get("/api/stats/dashboard")).status_code == 401
    finally:
        await _close(lifespan, client)
