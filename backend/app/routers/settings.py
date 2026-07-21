from contextlib import AbstractContextManager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from starlette.types import Receive, Scope, Send

from app.auth import get_db, get_write_db, require_auth
from app.schemas import NotificationSettings, NotificationTestResponse
from app.services.backup import BackupLimitError, build_backup
from app.services.notify import (
    build_senders,
    get_notification_settings,
    save_notification_settings,
    send_notification,
)
from app.services.restore import RestoreValidationError
from app.services.restore_archive import RestoreLimitError, restore_uploaded_backup

router = APIRouter(
    prefix="/api/settings",
    tags=["settings"],
    dependencies=[Depends(require_auth)],
)

class CleanupFileResponse(FileResponse):
    def __init__(
        self,
        path: str | Path,
        *,
        cleanup: AbstractContextManager[Path],
        media_type: str,
        filename: str,
    ) -> None:
        super().__init__(path, media_type=media_type, filename=filename)
        self._cleanup = cleanup

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        try:
            await super().__call__(scope, receive, send)
        finally:
            self._cleanup.__exit__(None, None, None)

def _restore_validation_error(error: Exception) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail=str(error),
    )


@router.get("/backup", response_class=FileResponse)
def download_backup(request: Request) -> FileResponse:
    settings = request.app.state.settings
    backup_context = build_backup(settings.database_path, settings.uploads_dir)
    try:
        backup_path = backup_context.__enter__()
    except BackupLimitError as error:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=str(error),
        ) from error
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return CleanupFileResponse(
        backup_path,
        media_type="application/zip",
        filename=f"hometrap-backup-{timestamp}.zip",
        cleanup=backup_context,
    )


@router.post("/restore")
def restore_backup(
    request: Request,
    file: UploadFile = File(...),
    session: Session = Depends(get_db),
) -> dict[str, dict[str, int]]:
    settings = request.app.state.settings
    try:
        summary = restore_uploaded_backup(file.file, session, settings.uploads_dir)
    except RestoreLimitError as error:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=str(error),
        ) from error
    except RestoreValidationError as error:
        raise _restore_validation_error(error) from error

    return {"added": summary.added, "skipped": summary.skipped}


@router.get("", response_model=NotificationSettings)
def get_settings(session: Session = Depends(get_db)) -> dict:
    return get_notification_settings(session)


@router.put("", response_model=NotificationSettings)
def update_settings(
    payload: NotificationSettings,
    session: Session = Depends(get_write_db),
) -> dict:
    value = payload.model_dump(mode="json")
    save_notification_settings(session, value)
    return value


@router.post("/test-notification", response_model=NotificationTestResponse)
def test_notification(session: Session = Depends(get_write_db)) -> dict:
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
