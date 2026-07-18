from __future__ import annotations

import json
import logging
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient
from pywebpush import WebPushException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.config import Settings
from app.main import create_app
from app.models import PushSubscription, Setting
from app.services.notify import build_senders
from app.services.push import (
    VAPID_KEYS_SETTING_KEY,
    VAPID_SUBJECT,
    WebPushDeliveryError,
    WebPushSender,
    _get_or_create_vapid_keys,
    get_vapid_public_key,
)


def _subscription(endpoint: str) -> PushSubscription:
    return PushSubscription(
        endpoint=endpoint,
        p256dh=f"p256dh-{endpoint}",
        auth=f"auth-{endpoint}",
    )


async def _create_client(tmp_path):
    settings = Settings(
        database_path=tmp_path / "push.db",
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


async def _close_client(lifespan, client: AsyncClient) -> None:
    await client.aclose()
    await lifespan.__aexit__(None, None, None)


def _subscription_payload(**overrides) -> dict:
    payload = {
        "endpoint": "https://push.example/subscriptions/one",
        "keys": {"p256dh": "public-key", "auth": "auth-secret"},
    }
    payload.update(overrides)
    return payload


def test_get_vapid_public_key_generates_and_reuses_pair(db_session) -> None:
    first = get_vapid_public_key(db_session)
    stored = db_session.get(Setting, VAPID_KEYS_SETTING_KEY)
    assert stored is not None
    private_key = stored.value["private_key"]

    second = get_vapid_public_key(db_session)

    assert second == first
    assert stored.value == {
        "private_key": private_key,
        "public_key": first,
    }
    assert first.startswith("B")
    assert len(first) == 87
    assert private_key.startswith("-----BEGIN PRIVATE KEY-----")


def test_get_vapid_public_key_recovers_from_concurrent_insert() -> None:
    canonical = {
        "private_key": "canonical-private-key",
        "public_key": "canonical-public-key",
    }

    class RacingSession:
        def __init__(self) -> None:
            self.rolled_back = False

        def get(self, _model, _key):
            if self.rolled_back:
                return SimpleNamespace(value=canonical)
            return None

        def add(self, _setting) -> None:
            pass

        def commit(self) -> None:
            raise IntegrityError("insert", {}, RuntimeError("unique constraint"))

        def rollback(self) -> None:
            self.rolled_back = True

    session = RacingSession()
    result = _get_or_create_vapid_keys(session)  # type: ignore[arg-type]

    assert session.rolled_back is True
    assert result == canonical


async def test_push_public_key_api_generates_and_reuses_pair(tmp_path) -> None:
    application, lifespan, client = await _create_client(tmp_path)
    try:
        first = await client.get("/api/push/public-key")
        second = await client.get("/api/push/public-key")

        assert first.status_code == 200
        assert second.status_code == 200
        assert second.json() == first.json()
        assert first.json()["public_key"].startswith("B")

        with application.state.session_factory() as session:
            stored = session.get(Setting, VAPID_KEYS_SETTING_KEY)
            assert stored is not None
            assert stored.value["public_key"] == first.json()["public_key"]
    finally:
        await _close_client(lifespan, client)


async def test_push_subscription_create_and_repeat_update(tmp_path) -> None:
    application, lifespan, client = await _create_client(tmp_path)
    try:
        created = await client.post(
            "/api/push/subscriptions",
            json=_subscription_payload(),
        )
        assert created.status_code == 201
        assert created.json()["endpoint"] == _subscription_payload()["endpoint"]
        assert created.json()["created_at"].endswith("Z")

        updated = await client.post(
            "/api/push/subscriptions",
            json=_subscription_payload(
                keys={"p256dh": "updated-public-key", "auth": "updated-auth"}
            ),
        )
        assert updated.status_code == 201
        assert updated.json() == created.json()

        with application.state.session_factory() as session:
            subscriptions = session.scalars(select(PushSubscription)).all()
            assert len(subscriptions) == 1
            assert subscriptions[0].p256dh == "updated-public-key"
            assert subscriptions[0].auth == "updated-auth"
    finally:
        await _close_client(lifespan, client)


async def test_push_subscription_delete_is_idempotent(tmp_path) -> None:
    application, lifespan, client = await _create_client(tmp_path)
    try:
        payload = _subscription_payload()
        assert (
            await client.post("/api/push/subscriptions", json=payload)
        ).status_code == 201

        first = await client.request(
            "DELETE",
            "/api/push/subscriptions",
            json={"endpoint": payload["endpoint"]},
        )
        second = await client.request(
            "DELETE",
            "/api/push/subscriptions",
            json={"endpoint": payload["endpoint"]},
        )

        assert first.status_code == 204
        assert second.status_code == 204
        with application.state.session_factory() as session:
            assert session.scalar(select(func.count(PushSubscription.id))) == 0
    finally:
        await _close_client(lifespan, client)


async def test_push_routes_require_auth_and_validate_payload(tmp_path) -> None:
    _, lifespan, client = await _create_client(tmp_path)
    try:
        invalid = await client.post(
            "/api/push/subscriptions",
            json=_subscription_payload(endpoint="not-a-url"),
        )
        assert invalid.status_code == 422

        client.cookies.clear()
        requests = [
            client.get("/api/push/public-key"),
            client.post("/api/push/subscriptions", json=_subscription_payload()),
            client.request(
                "DELETE",
                "/api/push/subscriptions",
                json={"endpoint": _subscription_payload()["endpoint"]},
            ),
        ]
        for request in requests:
            assert (await request).status_code == 401
    finally:
        await _close_client(lifespan, client)


def test_build_senders_adds_push_without_vapid_storage_side_effect(db_session) -> None:
    disabled = build_senders(
        {
            "telegram": {"enabled": False},
            "email": {"enabled": False},
            "push": {"enabled": False},
        },
        db_session,
    )
    assert disabled == []
    assert db_session.get(Setting, VAPID_KEYS_SETTING_KEY) is None

    enabled = build_senders(
        {
            "telegram": {"enabled": False},
            "email": {"enabled": False},
            "push": {"enabled": True},
        },
        db_session,
    )

    assert len(enabled) == 1
    assert isinstance(enabled[0], WebPushSender)
    assert db_session.get(Setting, VAPID_KEYS_SETTING_KEY) is None


def test_web_push_sender_sends_to_all_subscriptions(db_session, monkeypatch) -> None:
    db_session.add_all(
        [_subscription("https://push/one"), _subscription("https://push/two")]
    )
    db_session.commit()
    calls: list[dict] = []
    monkeypatch.setattr("app.services.push.webpush", lambda **kwargs: calls.append(kwargs))

    WebPushSender(db_session).send("Тема", "Повідомлення")

    assert len(calls) == 2
    assert [call["subscription_info"]["endpoint"] for call in calls] == [
        "https://push/one",
        "https://push/two",
    ]
    assert json.loads(calls[0]["data"]) == {
        "title": "Тема",
        "body": "Повідомлення",
    }
    assert calls[0]["vapid_claims"] == {"sub": VAPID_SUBJECT}
    assert calls[0]["vapid_private_key"].startswith("-----BEGIN PRIVATE KEY-----")


@pytest.mark.parametrize("status_code", [404, 410])
def test_web_push_sender_deletes_gone_subscription_and_continues(
    db_session,
    monkeypatch,
    status_code: int,
) -> None:
    gone = _subscription("https://push/gone")
    live = _subscription("https://push/live")
    db_session.add_all([gone, live])
    db_session.commit()
    gone_id = gone.id
    calls: list[str] = []

    def send(**kwargs) -> None:
        endpoint = kwargs["subscription_info"]["endpoint"]
        calls.append(endpoint)
        if endpoint == "https://push/gone":
            raise WebPushException(
                "subscription expired",
                response=SimpleNamespace(status_code=status_code, text="gone"),
            )

    monkeypatch.setattr("app.services.push.webpush", send)

    WebPushSender(db_session).send("Тема", "Повідомлення")

    assert calls == ["https://push/gone", "https://push/live"]
    assert db_session.get(PushSubscription, gone_id) is None
    assert db_session.get(PushSubscription, live.id) is not None


def test_web_push_sender_partial_error_does_not_block_other_subscriptions(
    db_session,
    monkeypatch,
    caplog,
) -> None:
    caplog.set_level(logging.WARNING, logger="app.services.push")
    broken = _subscription("https://push/broken")
    live = _subscription("https://push/live")
    db_session.add_all([broken, live])
    db_session.commit()
    calls: list[str] = []

    def send(**kwargs) -> None:
        endpoint = kwargs["subscription_info"]["endpoint"]
        calls.append(endpoint)
        if endpoint == "https://push/broken":
            raise RuntimeError("temporary failure")

    monkeypatch.setattr("app.services.push.webpush", send)

    WebPushSender(db_session).send("Тема", "Повідомлення")

    assert calls == ["https://push/broken", "https://push/live"]
    record = next(record for record in caplog.records if record.name == "app.services.push")
    assert record.subscription_id == broken.id
    assert record.status_code is None
    assert record.error_category == "RuntimeError"
    assert record.exc_info is not None
    assert "unexpected Web Push delivery failure" in caplog.text
    assert "https://push/broken" not in caplog.text


def test_web_push_sender_logs_http_status_without_subscription_secrets(
    db_session,
    monkeypatch,
    caplog,
) -> None:
    caplog.set_level(logging.WARNING, logger="app.services.push")
    subscription = _subscription("https://push/secret-endpoint")
    db_session.add(subscription)
    db_session.commit()
    monkeypatch.setattr(
        "app.services.push.webpush",
        lambda **_kwargs: (_ for _ in ()).throw(
            WebPushException(
                "request rejected",
                response=SimpleNamespace(status_code=503, text="rejected"),
            )
        ),
    )

    with pytest.raises(WebPushDeliveryError):
        WebPushSender(db_session).send("Тема", "Повідомлення")

    record = next(record for record in caplog.records if record.name == "app.services.push")
    assert record.subscription_id == subscription.id
    assert record.status_code == 503
    assert record.error_category == "WebPushException"
    assert record.exc_info is None
    assert subscription.endpoint not in caplog.text
    assert subscription.p256dh not in caplog.text
    assert subscription.auth not in caplog.text


def test_web_push_sender_reports_error_when_nothing_is_delivered(
    db_session,
    monkeypatch,
) -> None:
    db_session.add(_subscription("https://push/broken"))
    db_session.commit()
    monkeypatch.setattr(
        "app.services.push.webpush",
        lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("temporary failure")),
    )

    with pytest.raises(WebPushDeliveryError, match="delivery failed for all 1"):
        WebPushSender(db_session).send("Тема", "Повідомлення")
