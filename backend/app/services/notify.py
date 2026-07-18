from __future__ import annotations

import smtplib
import ssl
from copy import deepcopy
from datetime import UTC, date, datetime
from email.message import EmailMessage

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Apartment, Invoice, InvoiceStatus, Setting
from app.services.billing_schedule import send_billing_reminders
from app.services.notification_delivery import (
    NotificationResult,
    NotificationSender,
    send_notification,
)
from app.services.push import WebPushSender, get_vapid_public_key

NOTIFICATION_SETTINGS_KEY = "notifications"
NOTIFICATION_HISTORY_KEY = "notification_history"


DEFAULT_NOTIFICATION_SETTINGS = {
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


class TelegramSender:
    def __init__(self, token: str, chat_id: str) -> None:
        self.token = token
        self.chat_id = chat_id

    def send(self, subject: str, message: str) -> None:
        response = httpx.post(
            f"https://api.telegram.org/bot{self.token}/sendMessage",
            json={"chat_id": self.chat_id, "text": f"{subject}\n\n{message}"},
            timeout=10,
        )
        response.raise_for_status()


class EmailSender:
    def __init__(
        self,
        *,
        smtp_host: str,
        smtp_port: int,
        smtp_username: str,
        smtp_password: str,
        from_address: str,
        to_address: str,
        use_tls: bool,
    ) -> None:
        self.smtp_host = smtp_host
        self.smtp_port = smtp_port
        self.smtp_username = smtp_username
        self.smtp_password = smtp_password
        self.from_address = from_address
        self.to_address = to_address
        self.use_tls = use_tls

    def send(self, subject: str, message: str) -> None:
        email = EmailMessage()
        email["Subject"] = subject
        email["From"] = self.from_address
        email["To"] = self.to_address
        email.set_content(message)
        with smtplib.SMTP(self.smtp_host, self.smtp_port, timeout=10) as smtp:
            if self.use_tls:
                smtp.starttls(context=ssl.create_default_context())
            if self.smtp_username:
                smtp.login(self.smtp_username, self.smtp_password)
            smtp.send_message(email)


def get_notification_settings(session: Session) -> dict:
    stored = session.get(Setting, NOTIFICATION_SETTINGS_KEY)
    if stored is None:
        return deepcopy(DEFAULT_NOTIFICATION_SETTINGS)
    return _merge_settings(DEFAULT_NOTIFICATION_SETTINGS, stored.value)


def _merge_settings(defaults: dict, stored: dict) -> dict:
    merged = deepcopy(defaults)
    for key, value in stored.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _merge_settings(merged[key], value)
        else:
            merged[key] = deepcopy(value)
    return merged


def save_notification_settings(session: Session, value: dict) -> None:
    if value.get("push", {}).get("enabled"):
        get_vapid_public_key(session)
    stored = session.get(Setting, NOTIFICATION_SETTINGS_KEY)
    if stored is None:
        session.add(Setting(key=NOTIFICATION_SETTINGS_KEY, value=value))
    else:
        stored.value = value
    session.commit()


def build_senders(settings: dict, session: Session) -> list[NotificationSender]:
    senders: list[NotificationSender] = []
    telegram = settings["telegram"]
    if telegram["enabled"]:
        senders.append(TelegramSender(telegram["token"], telegram["chat_id"]))
    email = settings["email"]
    if email["enabled"]:
        senders.append(EmailSender(**{key: value for key, value in email.items() if key != "enabled"}))
    if settings["push"]["enabled"]:
        senders.append(WebPushSender(session))
    return senders


def run_daily_notifications(
    session: Session,
    today: date,
    senders: list[NotificationSender] | None = None,
) -> NotificationResult:
    settings = get_notification_settings(session)
    resolved_senders = senders if senders is not None else build_senders(settings, session)
    result = NotificationResult()
    history_setting = session.get(Setting, NOTIFICATION_HISTORY_KEY)
    history = dict(history_setting.value) if history_setting is not None else {}

    billing_reminder = settings["billing_reminder"]
    if billing_reminder["enabled"]:
        _merge_result(
            result,
            send_billing_reminders(
                session,
                today,
                billing_reminder,
                resolved_senders,
                history,
            ),
        )

    if not resolved_senders:
        _save_notification_history(session, history_setting, history)
        return result

    if today.day == settings["readings_day"]:
        key = "readings"
        if history.get(key) != today.isoformat():
            apartments = session.scalars(
                select(Apartment).where(Apartment.is_active.is_(True)).order_by(Apartment.name)
            ).all()
            if apartments:
                names = "\n".join(f"• {apartment.name}" for apartment in apartments)
                deliveries_before = result.deliveries
                _merge_result(
                    result,
                    send_notification(
                        resolved_senders,
                        "Час зняти показники",
                        f"Зніміть показники для активних квартир:\n{names}",
                    ),
                )
                if result.deliveries > deliveries_before:
                    history[key] = today.isoformat()

    invoices = session.scalars(
        select(Invoice)
        .where(Invoice.status == InvoiceStatus.ISSUED.value)
        .order_by(Invoice.id)
    ).all()
    for invoice in invoices:
        if invoice.issued_at is None:
            continue
        issued_date = _as_utc_date(invoice.issued_at)
        age = (today - issued_date).days
        overdue_after = settings["overdue_after_days"]
        repeat_every = settings["repeat_every_days"]
        if age < overdue_after or (age - overdue_after) % repeat_every != 0:
            continue
        key = f"overdue:{invoice.id}"
        if history.get(key) == today.isoformat():
            continue
        deliveries_before = result.deliveries
        _merge_result(
            result,
            send_notification(
                resolved_senders,
                "Неоплачений рахунок",
                f"Рахунок №{invoice.id} за {invoice.period:%m.%Y} не оплачено {age} дн.",
            ),
        )
        if result.deliveries > deliveries_before:
            history[key] = today.isoformat()

    _save_notification_history(session, history_setting, history)
    return result


def _save_notification_history(
    session: Session,
    history_setting: Setting | None,
    history: dict[str, str],
) -> None:
    if history_setting is None and history:
        session.add(Setting(key=NOTIFICATION_HISTORY_KEY, value=history))
    elif history_setting is not None:
        history_setting.value = history
    session.commit()


def _as_utc_date(value: datetime) -> date:
    normalized = value if value.tzinfo is not None else value.replace(tzinfo=UTC)
    return normalized.date()


def _merge_result(target: NotificationResult, source: NotificationResult) -> None:
    target.notifications += source.notifications
    target.deliveries += source.deliveries
    target.errors.extend(source.errors)
