from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import get_db, require_auth
from app.schemas import NotificationSettings, NotificationTestResponse
from app.services.notify import (
    build_senders,
    get_notification_settings,
    save_notification_settings,
    send_notification,
)

router = APIRouter(
    prefix="/api/settings",
    tags=["settings"],
    dependencies=[Depends(require_auth)],
)


@router.get("", response_model=NotificationSettings)
def get_settings(session: Session = Depends(get_db)) -> dict:
    return get_notification_settings(session)


@router.put("", response_model=NotificationSettings)
def update_settings(
    payload: NotificationSettings,
    session: Session = Depends(get_db),
) -> dict:
    value = payload.model_dump(mode="json")
    save_notification_settings(session, value)
    return value


@router.post("/test-notification", response_model=NotificationTestResponse)
def test_notification(session: Session = Depends(get_db)) -> dict:
    settings = get_notification_settings(session)
    result = send_notification(
        build_senders(settings, session),
        "Тестове сповіщення HomeTrap",
        "Канали сповіщень налаштовано правильно.",
    )
    return {
        "deliveries": result.deliveries,
        "errors": result.errors,
    }
