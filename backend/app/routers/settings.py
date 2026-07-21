from datetime import datetime, timezone
import json
from pathlib import Path, PurePosixPath, PureWindowsPath
from shutil import copyfileobj
from tempfile import TemporaryDirectory
from zipfile import BadZipFile, ZipFile

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
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
from app.services.restore import (
    RestoreValidationError,
    import_backup,
    validate_manifest,
)

router = APIRouter(
    prefix="/api/settings",
    tags=["settings"],
    dependencies=[Depends(require_auth)],
)


def _extract_backup(archive: ZipFile, destination: Path) -> None:
    destination = destination.resolve()
    for member in archive.infolist():
        normalized_name = member.filename.replace("\\", "/")
        member_path = PurePosixPath(normalized_name)
        if (
            not normalized_name
            or member_path.is_absolute()
            or PureWindowsPath(member.filename).is_absolute()
            or ".." in member_path.parts
        ):
            raise RestoreValidationError("Backup archive contains an unsafe path")
        extracted_path = destination.joinpath(*member_path.parts).resolve()
        if not extracted_path.is_relative_to(destination):
            raise RestoreValidationError("Backup archive contains an unsafe path")
    archive.extractall(destination)


def _restore_validation_error(error: Exception) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail=str(error),
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


@router.post("/restore")
async def restore_backup(
    request: Request,
    file: UploadFile = File(...),
    session: Session = Depends(get_db),
) -> dict[str, dict[str, int]]:
    settings = request.app.state.settings
    with TemporaryDirectory(prefix="hometrap-restore-") as temporary_directory:
        temporary_path = Path(temporary_directory)
        archive_path = temporary_path / "backup.zip"
        with archive_path.open("wb") as target:
            copyfileobj(file.file, target)

        extracted_path = temporary_path / "extracted"
        extracted_path.mkdir()
        try:
            with ZipFile(archive_path) as archive:
                _extract_backup(archive, extracted_path)

            manifest_path = extracted_path / "manifest.json"
            database_path = extracted_path / "hometrap.db"
            backup_uploads_dir = extracted_path / "uploads"
            if not manifest_path.is_file() or not backup_uploads_dir.is_dir():
                raise RestoreValidationError(
                    "Backup archive is missing required files or directories"
                )
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            current_revision = session.scalar(
                text("SELECT version_num FROM alembic_version")
            )
            if not isinstance(current_revision, str) or not current_revision:
                raise RestoreValidationError(
                    "Current database does not contain an Alembic revision"
                )
            validate_manifest(manifest, current_revision, database_path)
            summary = import_backup(
                database_path,
                backup_uploads_dir,
                session,
                settings.uploads_dir,
            )
        except RestoreValidationError as error:
            session.rollback()
            raise _restore_validation_error(error) from error
        except (BadZipFile, json.JSONDecodeError, UnicodeDecodeError, OSError) as error:
            session.rollback()
            raise _restore_validation_error(
                RestoreValidationError("Backup archive is invalid")
            ) from error
        except (SQLAlchemyError, KeyError) as error:
            session.rollback()
            raise _restore_validation_error(
                RestoreValidationError("Backup contents are invalid")
            ) from error

    return {"added": summary.added, "skipped": summary.skipped}


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
