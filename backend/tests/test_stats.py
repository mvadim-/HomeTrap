from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.db import create_database_engine, create_session_factory
from app.main import create_app
from app.models import Apartment, ExchangeRate, Expense, Invoice, InvoiceLine, Service
from app.routers.stats import _today


def _shift_month(value: date, offset: int) -> date:
    month_index = value.year * 12 + value.month - 1 + offset
    return date(month_index // 12, month_index % 12 + 1, 1)


async def _client(tmp_path):
    settings = Settings(
        database_path=tmp_path / "stats.db",
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
            service_kind="metered",
            prev_reading=Decimal("100.000"),
            curr_reading=Decimal("100.000") + Decimal(consumed),
            consumed=Decimal(consumed),
            tariff_value=Decimal("5.00000"),
            amount=utilities_amount,
        )
    )
    return invoice


def _seed_stats(application) -> tuple[int, int, int]:
    current = _today().replace(day=1)
    previous = _shift_month(current, -1)
    old = _shift_month(current, -18)
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
                    period=old,
                    status="paid",
                    rent="500.00",
                    utilities="25.00",
                    consumed="5.000",
                ),
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
        previous_invoice = first.invoices[1]
        previous_invoice.lines.append(
            InvoiceLine(
                service=first_fixed,
                service_name=first_fixed.name,
                service_kind="fixed",
                prev_reading=None,
                curr_reading=None,
                consumed=None,
                tariff_value=Decimal("50.00000"),
                amount=Decimal("50.00"),
            )
        )
        previous_invoice.utilities_total += Decimal("50.00")
        previous_invoice.grand_total += Decimal("50.00")

        current_invoice = first.invoices[2]
        current_invoice.lines.append(
            InvoiceLine(
                service=first_fixed,
                service_name=first_fixed.name,
                service_kind="fixed",
                prev_reading=None,
                curr_reading=None,
                consumed=None,
                tariff_value=Decimal("400.00000"),
                amount=Decimal("400.00"),
            )
        )
        current_invoice.utilities_total += Decimal("400.00")
        current_invoice.grand_total += Decimal("400.00")
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


def _seed_pnl_expenses(application, first_id: int) -> None:
    current = _today().replace(day=1)
    previous = _shift_month(current, -1)
    engine = create_database_engine(application.state.settings.database_path)
    with create_session_factory(engine)() as session:
        # Only USD rates are ever stored; store it dated at the current month so
        # a USD expense in the previous month has no stored rate <= its date.
        session.add(
            ExchangeRate(date=current, currency="USD", rate=Decimal("40.000000"))
        )
        session.add_all(
            [
                Expense(
                    apartment_id=first_id,
                    date=current,
                    category="repair",
                    amount=Decimal("300.00"),
                    currency="UAH",
                ),
                # Mid/end-of-month expense: regression for the month-boundary
                # date filter (a naive `date <= period_end` would drop it).
                Expense(
                    apartment_id=first_id,
                    date=current.replace(day=28),
                    category="tax",
                    amount=Decimal("100.00"),
                    currency="UAH",
                ),
                Expense(
                    apartment_id=first_id,
                    date=current,
                    category="insurance",
                    amount=Decimal("10.00"),
                    currency="USD",
                ),
                # Non-USD, non-UAH currency: never convertible -> unconverted.
                Expense(
                    apartment_id=first_id,
                    date=current,
                    category="other",
                    amount=Decimal("50.00"),
                    currency="EUR",
                ),
                Expense(
                    apartment_id=first_id,
                    date=previous,
                    category="repair",
                    amount=Decimal("200.00"),
                    currency="UAH",
                ),
                # USD expense with no stored rate <= its date -> unconverted.
                Expense(
                    apartment_id=first_id,
                    date=previous,
                    category="tax",
                    amount=Decimal("5.00"),
                    currency="USD",
                ),
                # General expense (portfolio-wide, not tied to an apartment).
                Expense(
                    apartment_id=None,
                    date=current,
                    category="commission",
                    amount=Decimal("500.00"),
                    currency="UAH",
                ),
            ]
        )
        session.commit()
    engine.dispose()


async def test_pnl_apartment_and_portfolio(tmp_path) -> None:
    application, lifespan, client = await _client(tmp_path)
    try:
        first_id, second_id, _ = _seed_stats(application)
        _seed_pnl_expenses(application, first_id)
        current = _today().replace(day=1)
        previous = _shift_month(current, -1)

        apartment = await client.get(
            "/api/stats/pnl",
            params={"apartment_id": first_id, "months": 2},
        )
        assert apartment.status_code == 200
        payload = apartment.json()
        assert payload["scope"] == "apartment"
        assert payload["apartment_id"] == first_id
        # Income is rent only (utilities excluded): previous 1000 + current 1100.
        assert payload["totals"]["income"] == "2100.00"
        # Converted expenses: current 300+100(day28)+400(USD*40)=800; previous 200.
        assert payload["totals"]["expenses_total"] == "1000.00"
        assert payload["totals"]["expenses_by_category"] == {
            "repair": "500.00",
            "tax": "100.00",
            "insurance": "400.00",
        }
        assert payload["totals"]["net"] == "1100.00"
        assert payload["totals"]["margin_percent"] == "52.38"
        # EUR 50 (current) and USD 5 (previous, no stored rate) are unconverted.
        assert payload["unconverted"] == {
            "count": 2,
            "by_currency": {"EUR": "50.00", "USD": "5.00"},
        }
        assert payload["values"] == [
            {
                "period": previous.isoformat(),
                "income": "1000.00",
                "expenses": "200.00",
                "net": "800.00",
            },
            {
                "period": current.isoformat(),
                "income": "1100.00",
                "expenses": "800.00",
                "net": "300.00",
            },
        ]

        portfolio = await client.get("/api/stats/pnl", params={"months": 2})
        assert portfolio.status_code == 200
        payload = portfolio.json()
        assert payload["scope"] == "portfolio"
        assert payload["apartment_id"] is None
        assert payload["totals"]["income"] == "4100.00"
        # Adds the general commission expense (500) to the apartment expenses.
        assert payload["totals"]["expenses_total"] == "1500.00"
        assert payload["totals"]["expenses_by_category"] == {
            "repair": "500.00",
            "tax": "100.00",
            "insurance": "400.00",
            "commission": "500.00",
        }
        assert payload["totals"]["net"] == "2600.00"
        assert payload["totals"]["margin_percent"] == "63.41"
        assert payload["values"][-1] == {
            "period": current.isoformat(),
            "income": "3100.00",
            "expenses": "1300.00",
            "net": "1800.00",
        }

        # Second apartment has income but no expenses of its own.
        second = await client.get(
            "/api/stats/pnl",
            params={"apartment_id": second_id, "months": 2},
        )
        assert second.status_code == 200
        payload = second.json()
        assert payload["totals"]["income"] == "2000.00"
        assert payload["totals"]["expenses_total"] == "0.00"
        assert payload["totals"]["expenses_by_category"] == {}
        assert payload["totals"]["margin_percent"] == "100.00"
        assert payload["unconverted"] == {"count": 0, "by_currency": {}}
    finally:
        await _close(lifespan, client)


async def test_pnl_margin_null_when_no_income(tmp_path) -> None:
    application, lifespan, client = await _client(tmp_path)
    try:
        _, _, empty_id = _seed_stats(application)
        current = _today().replace(day=1)
        engine = create_database_engine(application.state.settings.database_path)
        with create_session_factory(engine)() as session:
            session.add(
                Expense(
                    apartment_id=empty_id,
                    date=current,
                    category="repair",
                    amount=Decimal("100.00"),
                    currency="UAH",
                )
            )
            session.commit()
        engine.dispose()

        response = await client.get(
            "/api/stats/pnl",
            params={"apartment_id": empty_id, "months": 2},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["totals"]["income"] == "0.00"
        assert payload["totals"]["expenses_total"] == "100.00"
        assert payload["totals"]["net"] == "-100.00"
        assert payload["totals"]["margin_percent"] is None
        assert payload["values"] == [
            {
                "period": current.isoformat(),
                "income": "0.00",
                "expenses": "100.00",
                "net": "-100.00",
            }
        ]
    finally:
        await _close(lifespan, client)


async def test_pnl_not_found_and_auth(tmp_path) -> None:
    application, lifespan, client = await _client(tmp_path)
    try:
        assert (
            await client.get("/api/stats/pnl", params={"apartment_id": 999})
        ).status_code == 404
        client.cookies.clear()
        assert (await client.get("/api/stats/pnl")).status_code == 401
    finally:
        await _close(lifespan, client)


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

        engine = create_database_engine(application.state.settings.database_path)
        with create_session_factory(engine)() as session:
            gas = session.query(Service).filter_by(
                apartment_id=first_id,
                name="Газ",
            ).one()
            gas.kind = "fixed"
            session.commit()
        engine.dispose()

        after_kind_change = await client.get(
            "/api/stats/consumption",
            params={"apartment_id": first_id, "months": 2},
        )
        assert [
            point["consumed"]
            for point in after_kind_change.json()["series"][0]["values"]
        ] == ["10.000", "12.000"]

        engine = create_database_engine(application.state.settings.database_path)
        with create_session_factory(engine)() as session:
            current_invoice = (
                session.query(Invoice)
                .filter_by(apartment_id=first_id)
                .order_by(Invoice.period.desc())
                .first()
            )
            current_invoice.status = "draft"
            session.commit()
        engine.dispose()

        without_draft = await client.get(
            "/api/stats/consumption",
            params={"apartment_id": first_id, "months": 2},
        )
        assert [
            point["consumed"]
            for point in without_draft.json()["series"][0]["values"]
        ] == ["10.000"]
    finally:
        await _close(lifespan, client)


def test_stats_today_uses_kyiv_timezone(monkeypatch) -> None:
    class FrozenDateTime:
        @classmethod
        def now(cls, timezone):
            assert timezone.key == "Europe/Kyiv"
            return datetime(2026, 7, 1, 0, 30, tzinfo=timezone)

    monkeypatch.setattr("app.routers.stats.datetime", FrozenDateTime)

    assert _today() == date(2026, 7, 1)


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
            "utilities": "750.00",
            "total": "2850.00",
        }
        assert [point["total"] for point in payload["values"]] == [
            "1150.00",
            "1700.00",
        ]
        assert payload["top_service"] == {
            "name": "Утримання будинку",
            "share_percent": "60.00",
            "peak_period": _today().replace(day=1).isoformat(),
        }

        portfolio = await client.get("/api/stats/income", params={"months": 2})
        assert portfolio.status_code == 200
        payload = portfolio.json()
        assert payload["scope"] == "portfolio"
        assert payload["apartment_id"] is None
        assert payload["totals"] == {
            "rent": "4100.00",
            "utilities": "1050.00",
            "total": "5150.00",
        }
        assert [point["total"] for point in payload["values"]] == [
            "1150.00",
            "4000.00",
        ]
        assert payload["top_service"] == {
            "name": "Утримання будинку",
            "share_percent": "42.86",
            "peak_period": _today().replace(day=1).isoformat(),
        }
    finally:
        await _close(lifespan, client)


async def test_dashboard_and_empty_history(tmp_path) -> None:
    application, lifespan, client = await _client(tmp_path)
    try:
        first_id, _, empty_id = _seed_stats(application)
        dashboard = await client.get("/api/stats/dashboard")
        assert dashboard.status_code == 200
        payload = dashboard.json()
        assert payload["charged"] == "4000.00"
        assert payload["paid"] == "2300.00"
        assert payload["outstanding"] == "1700.00"
        assert payload["needs_attention"] == [
            {
                "invoice_id": payload["needs_attention"][0]["invoice_id"],
                "apartment_id": first_id,
                "apartment_name": "Квартира 1",
                "period": _today().replace(day=1).isoformat(),
                "status": "issued",
                "grand_total": "1700.00",
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
        assert income.json()["top_service"] is None
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


async def test_stats_custom_period_and_all_time(tmp_path) -> None:
    application, lifespan, client = await _client(tmp_path)
    try:
        first_id, _, _ = _seed_stats(application)
        current = _today().replace(day=1)
        previous = _shift_month(current, -1)

        consumption = await client.get(
            "/api/stats/consumption",
            params={
                "apartment_id": first_id,
                "date_from": previous.isoformat(),
                "date_to": previous.isoformat(),
            },
        )
        assert consumption.status_code == 200
        assert consumption.json()["months"] is None
        assert [
            point["consumed"]
            for point in consumption.json()["series"][0]["values"]
        ] == ["10.000"]

        income = await client.get(
            "/api/stats/income",
            params={
                "apartment_id": first_id,
                "date_from": previous.isoformat(),
                "date_to": previous.isoformat(),
            },
        )
        assert income.status_code == 200
        assert income.json()["months"] is None
        assert [point["total"] for point in income.json()["values"]] == ["1150.00"]

        default_period = await client.get(
            "/api/stats/income", params={"apartment_id": first_id}
        )
        assert default_period.status_code == 200
        assert default_period.json()["months"] == 12
        assert len(default_period.json()["values"]) == 2

        all_time_income = await client.get(
            "/api/stats/income",
            params={"apartment_id": first_id, "all_time": "true"},
        )
        assert all_time_income.status_code == 200
        assert all_time_income.json()["months"] is None
        assert len(all_time_income.json()["values"]) == 3

        all_time_consumption = await client.get(
            "/api/stats/consumption",
            params={"apartment_id": first_id, "all_time": "true"},
        )
        assert all_time_consumption.status_code == 200
        assert [
            point["consumed"]
            for point in all_time_consumption.json()["series"][0]["values"]
        ] == ["5.000", "10.000", "12.000"]
    finally:
        await _close(lifespan, client)


async def test_stats_rejects_combined_and_invalid_periods(tmp_path) -> None:
    application, lifespan, client = await _client(tmp_path)
    try:
        first_id, _, _ = _seed_stats(application)
        current = _today().replace(day=1)
        previous = _shift_month(current, -1)
        invalid_periods = [
            {
                "months": 6,
                "date_from": previous.isoformat(),
                "date_to": current.isoformat(),
            },
            {"months": 6, "all_time": "true"},
            {
                "date_from": current.isoformat(),
                "date_to": previous.isoformat(),
            },
            {"date_from": previous.isoformat()},
            {
                "date_from": previous.replace(day=2).isoformat(),
                "date_to": current.isoformat(),
            },
        ]

        for endpoint in ("consumption", "income"):
            for params in invalid_periods:
                query = dict(params)
                if endpoint == "consumption":
                    query["apartment_id"] = first_id
                response = await client.get(f"/api/stats/{endpoint}", params=query)
                assert response.status_code == 422
    finally:
        await _close(lifespan, client)
