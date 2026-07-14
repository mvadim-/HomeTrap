from __future__ import annotations

from datetime import date
from decimal import Decimal
from io import BytesIO
from pathlib import Path

from httpx import ASGITransport, AsyncClient
from openpyxl import load_workbook

from app.config import Settings
from app.main import create_app
from app.services.nbu import RateResult

FIXTURE = Path(__file__).parent / "fixtures" / "sample_import.xlsx"
MONTH_NAMES = (
    "",
    "Січ",
    "Лют",
    "Бер",
    "Кві",
    "Тра",
    "Чер",
    "Лип",
    "Сер",
    "Вер",
    "Жов",
    "Лис",
    "Гру",
)


def _shift_month(value: date, offset: int) -> date:
    month_index = value.year * 12 + value.month - 1 + offset
    return date(month_index // 12, month_index % 12 + 1, 1)


def _acceptance_workbook(first_period: date, second_period: date) -> bytes:
    workbook = load_workbook(FIXTURE)
    information = workbook["Загальна інформація"]
    information["E3"] = first_period
    information["F3"] = second_period
    for old_title, period in (("Кві 2024", first_period), ("Тра 2024", second_period)):
        sheet = workbook[old_title]
        sheet.title = f"{MONTH_NAMES[period.month]} {period.year}"
        sheet["A1"] = f"Розрахунок за {sheet.title}"
    output = BytesIO()
    workbook.save(output)
    return output.getvalue()


class RecordingSender:
    def __init__(self) -> None:
        self.messages: list[tuple[str, str]] = []

    def send(self, subject: str, message: str) -> None:
        self.messages.append((subject, message))


async def test_complete_landlord_acceptance_scenario(tmp_path, monkeypatch) -> None:
    current_period = date.today().replace(day=1)
    first_import_period = _shift_month(current_period, -2)
    second_import_period = _shift_month(current_period, -1)
    settings = Settings(
        database_path=tmp_path / "acceptance.db",
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
    sender = RecordingSender()
    try:
        login = await client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "password"},
        )
        assert login.status_code == 200

        apartment_response = await client.post(
            "/api/apartments",
            json={
                "name": "Лісова",
                "address": "Київ",
                "rent_amount": "325.00",
                "rent_currency": "USD",
                "notes": "Acceptance flow",
            },
        )
        assert apartment_response.status_code == 201
        apartment_id = apartment_response.json()["id"]

        service_response = await client.post(
            f"/api/apartments/{apartment_id}/services",
            json={
                "name": "Газ",
                "kind": "metered",
                "unit": "м³",
                "provider_account": "ACC-XXXX",
                "sort_order": 1,
            },
        )
        assert service_response.status_code == 201
        gas_id = service_response.json()["id"]
        tariff_response = await client.post(
            f"/api/services/{gas_id}/tariffs",
            json={"value": "7.50000", "valid_from": first_import_period.isoformat()},
        )
        assert tariff_response.status_code == 201

        import_response = await client.post(
            f"/api/apartments/{apartment_id}/import",
            files={
                "file": (
                    "history.xlsx",
                    _acceptance_workbook(first_import_period, second_import_period),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )
        assert import_response.status_code == 200
        assert import_response.json()["invoices_created"] == 2
        assert import_response.json()["services_created"] == 1
        assert import_response.json()["tariffs_created"] == 3

        tariffs = await client.get(f"/api/services/{gas_id}/tariffs")
        assert [item["value"] for item in tariffs.json()] == ["7.50000", "7.95689"]

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
        draft_response = await client.post(
            f"/api/apartments/{apartment_id}/invoices",
            json={"period": current_period.isoformat()},
        )
        assert draft_response.status_code == 201
        draft = draft_response.json()
        gas_line = next(line for line in draft["lines"] if line["service_id"] == gas_id)
        assert gas_line["prev_reading"] == "140.000"
        assert gas_line["tariff_value"] == "7.95689"

        updated_response = await client.put(
            f"/api/invoices/{draft['id']}",
            json={"lines": [{"id": gas_line["id"], "curr_reading": "145.000"}]},
        )
        assert updated_response.status_code == 200
        updated = updated_response.json()
        assert next(
            line for line in updated["lines"] if line["service_id"] == gas_id
        )["consumed"] == "5.000"

        issued_response = await client.post(f"/api/invoices/{draft['id']}/issue")
        assert issued_response.status_code == 200
        assert issued_response.json()["status"] == "issued"
        paid_response = await client.post(f"/api/invoices/{draft['id']}/mark-paid")
        assert paid_response.status_code == 200
        paid = paid_response.json()
        assert paid["status"] == "paid"
        assert paid["paid_at"] is not None

        consumption = await client.get(
            "/api/stats/consumption",
            params={"apartment_id": apartment_id, "months": 3},
        )
        assert consumption.status_code == 200
        gas_series = next(
            series
            for series in consumption.json()["series"]
            if series["service_id"] == gas_id
        )
        assert [point["consumed"] for point in gas_series["values"]] == [
            "22.000",
            "18.000",
            "5.000",
        ]
        income = await client.get(
            "/api/stats/income",
            params={"apartment_id": apartment_id, "months": 3},
        )
        assert income.status_code == 200
        assert [point["period"] for point in income.json()["values"]] == [
            first_import_period.isoformat(),
            second_import_period.isoformat(),
            current_period.isoformat(),
        ]
        dashboard = await client.get("/api/stats/dashboard")
        assert dashboard.status_code == 200
        assert dashboard.json()["paid"] == paid["grand_total"]
        assert dashboard.json()["outstanding"] == "0.00"

        notification_settings = {
            "telegram": {"enabled": True, "token": "test-token", "chat_id": "42"},
            "email": {
                "enabled": False,
                "smtp_host": "",
                "smtp_port": 587,
                "smtp_username": "",
                "smtp_password": "",
                "from_address": "",
                "to_address": "",
                "use_tls": True,
            },
            "readings_day": 20,
            "overdue_after_days": 3,
            "repeat_every_days": 3,
        }
        saved_settings = await client.put("/api/settings", json=notification_settings)
        assert saved_settings.status_code == 200
        monkeypatch.setattr(
            "app.routers.settings.build_senders",
            lambda _settings: [sender],
        )
        notification = await client.post("/api/settings/test-notification")
        assert notification.status_code == 200
        assert notification.json() == {"deliveries": 1, "errors": []}
        assert sender.messages[0][0] == "Тестове сповіщення HomeTrap"
    finally:
        await client.aclose()
        await lifespan.__aexit__(None, None, None)
