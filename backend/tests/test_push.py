from __future__ import annotations

import json
from types import SimpleNamespace

import pytest
from pywebpush import WebPushException

from app.models import PushSubscription, Setting
from app.services.notify import build_senders
from app.services.push import (
    VAPID_KEYS_SETTING_KEY,
    VAPID_SUBJECT,
    WebPushDeliveryError,
    WebPushSender,
    get_vapid_public_key,
)


def _subscription(endpoint: str) -> PushSubscription:
    return PushSubscription(
        endpoint=endpoint,
        p256dh=f"p256dh-{endpoint}",
        auth=f"auth-{endpoint}",
    )


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


def test_build_senders_adds_push_and_generates_vapid_only_when_enabled(db_session) -> None:
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
    assert db_session.get(Setting, VAPID_KEYS_SETTING_KEY) is not None


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


def test_web_push_sender_deletes_gone_subscription_and_continues(db_session, monkeypatch) -> None:
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
                response=SimpleNamespace(status_code=410, text="gone"),
            )

    monkeypatch.setattr("app.services.push.webpush", send)

    WebPushSender(db_session).send("Тема", "Повідомлення")

    assert calls == ["https://push/gone", "https://push/live"]
    assert db_session.get(PushSubscription, gone_id) is None
    assert db_session.get(PushSubscription, live.id) is not None


def test_web_push_sender_partial_error_does_not_block_other_subscriptions(
    db_session,
    monkeypatch,
) -> None:
    db_session.add_all(
        [_subscription("https://push/broken"), _subscription("https://push/live")]
    )
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
