from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.db import create_database_engine, create_session_factory
from app.main import create_app
from app.models import Apartment, Invoice, InvoiceStatus, Setting, Tenant
from app.services.notify import (
    EmailSender,
    NOTIFICATION_HISTORY_KEY,
    NOTIFICATION_SETTINGS_KEY,
    TelegramSender,
    get_notification_settings,
    run_daily_notifications,
    save_notification_settings,
    send_notification,
)
from app.services.push import VAPID_KEYS_SETTING_KEY


class RecordingSender:
    def __init__(self) -> None:
        self.messages: list[tuple[str, str]] = []

    def send(self, subject: str, message: str) -> None:
        self.messages.append((subject, message))


def _settings(**overrides) -> dict:
    value = {
        "telegram": {"enabled": False, "token": "", "chat_id": ""},
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
        "billing_reminder": {
            "enabled": False,
            "days_before": 3,
            "repeat_every_days": 1,
            "auto_draft": True,
        },
        "push": {"enabled": False},
        "readings_day": 20,
        "overdue_after_days": 3,
        "repeat_every_days": 3,
    }
    value.update(overrides)
    return value


def _invoice(apartment: Apartment, *, issued_at: datetime) -> Invoice:
    return Invoice(
        apartment=apartment,
        period=date(2026, 7, 1),
        status=InvoiceStatus.ISSUED.value,
        issued_at=issued_at,
        exchange_rate=Decimal("44.680000"),
        rent_amount_usd=Decimal("325.00"),
        rent_amount_uah=Decimal("14521.00"),
        utilities_total=Decimal("500.00"),
        grand_total=Decimal("15021.00"),
    )


def test_daily_rules_repeat_and_deduplicate_same_day(db_session) -> None:
    today = date(2026, 7, 20)
    active = Apartment(
        name="Лісова",
        address="Київ",
        rent_amount=Decimal("325.00"),
        rent_currency="USD",
    )
    inactive = Apartment(
        name="Архівна",
        address="Київ",
        rent_amount=Decimal("300.00"),
        rent_currency="USD",
        is_active=False,
    )
    active.invoices.append(
        _invoice(
            active,
            issued_at=datetime(2026, 7, 17, 10, tzinfo=UTC),
        )
    )
    db_session.add_all([active, inactive])
    save_notification_settings(db_session, _settings())
    sender = RecordingSender()

    first = run_daily_notifications(db_session, today, [sender])
    second = run_daily_notifications(db_session, today, [sender])
    repeated = run_daily_notifications(db_session, today + timedelta(days=3), [sender])

    assert first.notifications == 2
    assert first.deliveries == 2
    assert second.notifications == 0
    assert repeated.notifications == 1
    assert len(sender.messages) == 3
    assert "Лісова" in sender.messages[0][1]
    assert "Архівна" not in sender.messages[0][1]
    assert sender.messages[1][0] == "Неоплачений рахунок"
    history = db_session.get(Setting, NOTIFICATION_HISTORY_KEY)
    assert history is not None
    assert history.value == {"readings": "2026-07-20", "overdue:1": "2026-07-23"}


def test_disabled_channels_do_not_send_or_consume_daily_reminder(db_session) -> None:
    today = date(2026, 7, 20)
    db_session.add(
        Apartment(
            name="Лісова",
            address="Київ",
            rent_amount=Decimal("325.00"),
            rent_currency="USD",
        )
    )
    save_notification_settings(db_session, _settings())

    result = run_daily_notifications(db_session, today)

    assert result.notifications == 0
    assert result.deliveries == 0
    assert db_session.get(Setting, NOTIFICATION_HISTORY_KEY) is None


def test_daily_pipeline_sends_enabled_billing_reminder(db_session) -> None:
    apartment = Apartment(
        name="Лісова",
        address="Київ",
        rent_amount=Decimal("325.00"),
        rent_currency="USD",
    )
    apartment.tenants.append(
        Tenant(
            full_name="Орендар",
            contract_start=date(2026, 1, 20),
        )
    )
    db_session.add(apartment)
    save_notification_settings(
        db_session,
        _settings(
            billing_reminder={
                "enabled": True,
                "days_before": 3,
                "repeat_every_days": 1,
                "auto_draft": True,
            }
        ),
    )
    sender = RecordingSender()

    result = run_daily_notifications(db_session, date(2026, 7, 17), [sender])

    assert result.notifications == 1
    assert result.deliveries == 1
    assert sender.messages[0][0] == "Нагадування про виставлення рахунка"
    history = db_session.get(Setting, NOTIFICATION_HISTORY_KEY)
    assert history is not None
    assert history.value == {f"billing:{apartment.id}:2026-07-01": "2026-07-17"}


def test_notification_settings_deep_merge_legacy_value_with_defaults(db_session) -> None:
    db_session.add(
        Setting(
            key=NOTIFICATION_SETTINGS_KEY,
            value={
                "telegram": {"enabled": False, "token": "legacy-token"},
                "email": {"enabled": False, "smtp_port": 2525},
                "readings_day": 18,
                "overdue_after_days": 5,
                "repeat_every_days": 2,
            },
        )
    )
    db_session.commit()

    loaded = get_notification_settings(db_session)

    assert loaded["telegram"] == {
        "enabled": False,
        "token": "legacy-token",
        "chat_id": "",
    }
    assert loaded["email"]["smtp_port"] == 2525
    assert loaded["email"]["smtp_host"] == ""
    assert loaded["billing_reminder"] == {
        "enabled": False,
        "days_before": 3,
        "repeat_every_days": 1,
        "auto_draft": True,
    }
    assert loaded["push"] == {"enabled": False}
    assert loaded["readings_day"] == 18


async def test_settings_api_persists_and_tests_enabled_sender(
    tmp_path,
    monkeypatch,
) -> None:
    settings = Settings(
        database_path=tmp_path / "notify.db",
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
    sender = RecordingSender()
    try:
        assert (await client.get("/api/settings")).status_code == 401
        login = await client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "password"},
        )
        assert login.status_code == 200
        payload = _settings(
            telegram={"enabled": True, "token": "test-token", "chat_id": "42"},
            billing_reminder={
                "enabled": True,
                "days_before": 5,
                "repeat_every_days": 2,
                "auto_draft": False,
            },
            push={"enabled": True},
            readings_day=18,
        )

        updated = await client.put("/api/settings", json=payload)
        loaded = await client.get("/api/settings")
        assert updated.status_code == 200
        assert loaded.json() == payload

        monkeypatch.setattr(
            "app.routers.settings.build_senders",
            lambda _settings, _session: [sender],
        )
        test_response = await client.post("/api/settings/test-notification")
        assert test_response.status_code == 200
        assert test_response.json() == {"deliveries": 1, "errors": []}
        assert sender.messages == [
            (
                "Тестове сповіщення HomeTrap",
                "Канали сповіщень налаштовано правильно.",
            )
        ]

        engine = create_database_engine(settings.database_path)
        with create_session_factory(engine)() as session:
            stored = session.get(Setting, NOTIFICATION_SETTINGS_KEY)
            assert stored is not None
            assert stored.value["readings_day"] == 18
            assert stored.value["billing_reminder"]["days_before"] == 5
            assert stored.value["push"] == {"enabled": True}
            assert session.get(Setting, VAPID_KEYS_SETTING_KEY) is not None
        engine.dispose()
    finally:
        await client.aclose()
        await lifespan.__aexit__(None, None, None)


async def test_settings_api_rejects_incomplete_enabled_channel(
    tmp_path,
) -> None:
    settings = Settings(
        database_path=tmp_path / "notify-validation.db",
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
    try:
        await client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "password"},
        )
        response = await client.put(
            "/api/settings",
            json=_settings(
                telegram={"enabled": True, "token": "", "chat_id": ""}
            ),
        )
        assert response.status_code == 422
    finally:
        await client.aclose()
        await lifespan.__aexit__(None, None, None)


async def test_settings_api_rejects_invalid_billing_reminder_values(tmp_path) -> None:
    settings = Settings(
        database_path=tmp_path / "notify-billing-validation.db",
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
    try:
        await client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "password"},
        )
        invalid_days_before = await client.put(
            "/api/settings",
            json=_settings(
                billing_reminder={
                    "enabled": True,
                    "days_before": -1,
                    "repeat_every_days": 1,
                    "auto_draft": True,
                }
            ),
        )
        invalid_repeat = await client.put(
            "/api/settings",
            json=_settings(
                billing_reminder={
                    "enabled": True,
                    "days_before": 3,
                    "repeat_every_days": 0,
                    "auto_draft": True,
                }
            ),
        )

        assert invalid_days_before.status_code == 422
        assert invalid_repeat.status_code == 422
    finally:
        await client.aclose()
        await lifespan.__aexit__(None, None, None)


def test_real_sender_adapters_use_timeout_tls_login_and_continue(monkeypatch) -> None:
    telegram_requests = []

    class TelegramResponse:
        def raise_for_status(self) -> None:
            return None

    def fake_post(url, *, json, timeout):
        telegram_requests.append((url, json, timeout))
        return TelegramResponse()

    smtp_calls = []
    tls_context = object()

    class FakeSmtp:
        def __init__(self, host, port, timeout):
            smtp_calls.append(("connect", host, port, timeout))

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def starttls(self, *, context):
            smtp_calls.append(("starttls", context))

        def login(self, username, password):
            smtp_calls.append(("login", username, password))

        def send_message(self, message):
            smtp_calls.append(("send", message["To"]))

    monkeypatch.setattr("app.services.notify.httpx.post", fake_post)
    monkeypatch.setattr("app.services.notify.smtplib.SMTP", FakeSmtp)
    monkeypatch.setattr(
        "app.services.notify.ssl.create_default_context", lambda: tls_context
    )
    TelegramSender("token", "chat").send("Subject", "Message")
    EmailSender(
        smtp_host="smtp.test",
        smtp_port=587,
        smtp_username="user",
        smtp_password="password",
        from_address="from@test",
        to_address="to@test",
        use_tls=True,
    ).send("Subject", "Message")
    assert telegram_requests[0][2] == 10
    assert smtp_calls == [
        ("connect", "smtp.test", 587, 10),
        ("starttls", tls_context),
        ("login", "user", "password"),
        ("send", "to@test"),
    ]

    class FailingSender:
        def send(self, _subject, _message):
            raise RuntimeError("boom")

    recording = RecordingSender()
    result = send_notification([FailingSender(), recording], "Subject", "Message")
    assert result.deliveries == 1
    assert len(result.errors) == 1
    assert recording.messages == [("Subject", "Message")]
