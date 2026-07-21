from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from app.auth import get_db, require_auth
from app.schemas import NotificationSettings, NotificationTestResponse
from app.services.backup import build_backup
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


@router.get("/backup", response_class=FileResponse)
def download_backup(request: Request) -> FileResponse:
    settings = request.app.state.settings
    backup_context = build_backup(settings.database_path, settings.uploads_dir)
    backup_path = backup_context.__enter__()
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return FileResponse(
        backup_path,
        media_type="application/zip",
        filename=f"hometrap-backup-{timestamp}.zip",
        background=BackgroundTask(backup_context.__exit__, None, None, None),
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
