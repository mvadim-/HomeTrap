from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


class NotificationSender(Protocol):
    def send(self, subject: str, message: str) -> None: ...


@dataclass
class NotificationResult:
    notifications: int = 0
    deliveries: int = 0
    errors: list[str] = field(default_factory=list)


def send_notification(
    senders: list[NotificationSender],
    subject: str,
    message: str,
) -> NotificationResult:
    result = NotificationResult(notifications=1)
    for sender in senders:
        try:
            sender.send(subject, message)
            result.deliveries += 1
        except Exception as error:  # sender failures must not block other channels
            result.errors.append(
                f"{type(sender).__name__}: delivery failed ({type(error).__name__})"
            )
    return result
