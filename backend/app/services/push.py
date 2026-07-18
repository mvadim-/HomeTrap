from __future__ import annotations

import base64
import json
import logging

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid
from pywebpush import WebPushException, webpush
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import PushSubscription, Setting

VAPID_KEYS_SETTING_KEY = "web_push_vapid_keys"
VAPID_SUBJECT = "mailto:admin@hometrap.local"

logger = logging.getLogger(__name__)


class WebPushDeliveryError(RuntimeError):
    pass


def get_vapid_public_key(session: Session) -> str:
    return _get_or_create_vapid_keys(session)["public_key"]


def _get_or_create_vapid_keys(session: Session) -> dict[str, str]:
    stored = session.get(Setting, VAPID_KEYS_SETTING_KEY)
    if stored is not None:
        return stored.value

    vapid = Vapid()
    vapid.generate_keys()
    public_key = base64.urlsafe_b64encode(
        vapid.public_key.public_bytes(
            encoding=serialization.Encoding.X962,
            format=serialization.PublicFormat.UncompressedPoint,
        )
    ).rstrip(b"=").decode("ascii")
    value = {
        "private_key": vapid.private_pem().decode("ascii"),
        "public_key": public_key,
    }
    session.add(Setting(key=VAPID_KEYS_SETTING_KEY, value=value))
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        stored = session.get(Setting, VAPID_KEYS_SETTING_KEY)
        if stored is None:
            raise
        return stored.value
    return value


class WebPushSender:
    def __init__(self, session: Session) -> None:
        self.session = session

    def send(self, subject: str, message: str) -> None:
        subscriptions = self.session.scalars(
            select(PushSubscription).order_by(PushSubscription.id)
        ).all()
        if not subscriptions:
            raise WebPushDeliveryError("no Web Push subscriptions")

        vapid_keys = _get_or_create_vapid_keys(self.session)
        payload = json.dumps(
            {"title": subject, "body": message},
            ensure_ascii=False,
        )
        delivered = 0
        errors: list[Exception] = []
        deleted = False

        for subscription in subscriptions:
            try:
                webpush(
                    subscription_info={
                        "endpoint": subscription.endpoint,
                        "keys": {
                            "p256dh": subscription.p256dh,
                            "auth": subscription.auth,
                        },
                    },
                    data=payload,
                    vapid_private_key=vapid_keys["private_key"],
                    vapid_claims={"sub": VAPID_SUBJECT},
                    timeout=10,
                )
                delivered += 1
            except Exception as error:
                status_code = (
                    getattr(error.response, "status_code", None)
                    if isinstance(error, WebPushException)
                    else None
                )
                if status_code in {404, 410}:
                    self.session.delete(subscription)
                    deleted = True
                else:
                    errors.append(error)
                traceback = None
                if not isinstance(error, WebPushException):
                    sanitized = WebPushDeliveryError(
                        "unexpected Web Push delivery failure"
                    )
                    traceback = (type(sanitized), sanitized, error.__traceback__)
                logger.warning(
                    "Web Push delivery failed",
                    extra={
                        "subscription_id": subscription.id,
                        "status_code": status_code,
                        "error_category": type(error).__name__,
                    },
                    exc_info=traceback,
                )

        if deleted:
            self.session.commit()
        if delivered == 0:
            raise WebPushDeliveryError(
                f"delivery failed for all {len(subscriptions)} subscription(s)"
            ) from (errors[0] if errors else None)
