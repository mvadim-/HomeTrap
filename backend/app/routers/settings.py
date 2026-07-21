from contextlib import AbstractContextManager
from datetime import datetime, timezone
import json
from pathlib import Path, PurePosixPath, PureWindowsPath
import stat
from tempfile import TemporaryDirectory
from typing import BinaryIO
from zipfile import BadZipFile, ZipFile, ZipInfo

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.types import Receive, Scope, Send

from app.auth import get_db, require_auth
from app.schemas import NotificationSettings, NotificationTestResponse
from app.services.backup import BackupLimitError, build_backup
from app.services.backup_limits import (
    MAX_BACKUP_COMPRESSION_RATIO,
    MAX_BACKUP_MEMBERS,
    MAX_BACKUP_UNCOMPRESSED_SIZE,
    MAX_BACKUP_UPLOAD_SIZE,
)
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
from app.services.storage import coordinated_write

router = APIRouter(
    prefix="/api/settings",
    tags=["settings"],
    dependencies=[Depends(require_auth)],
)

COPY_CHUNK_SIZE = 1024 * 1024


class RestoreLimitError(RestoreValidationError):
    """Raised when an uploaded backup exceeds a resource quota."""


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


def _copy_upload(source: BinaryIO, target: BinaryIO) -> None:
    copied = 0
    while chunk := source.read(COPY_CHUNK_SIZE):
        copied += len(chunk)
        if copied > MAX_BACKUP_UPLOAD_SIZE:
            raise RestoreLimitError("Backup archive exceeds the upload size limit")
        target.write(chunk)


def _extract_backup(archive: ZipFile, destination: Path) -> None:
    destination = destination.resolve()
    members = archive.infolist()
    if len(members) > MAX_BACKUP_MEMBERS:
        raise RestoreLimitError("Backup archive contains too many files")
    total_size = 0
    seen_names: set[str] = set()
    validated: list[tuple[ZipInfo, Path]] = []
    for member in members:
        normalized_name = member.filename.replace("\\", "/")
        member_path = PurePosixPath(normalized_name)
        if (
            not normalized_name
            or member_path.is_absolute()
            or PureWindowsPath(member.filename).is_absolute()
            or ".." in member_path.parts
            or stat.S_ISLNK(member.external_attr >> 16)
        ):
            raise RestoreValidationError("Backup archive contains an unsafe path")
        normalized_key = member_path.as_posix()
        if normalized_key in seen_names:
            raise RestoreValidationError("Backup archive contains duplicate paths")
        seen_names.add(normalized_key)
        extracted_path = destination.joinpath(*member_path.parts).resolve()
        if not extracted_path.is_relative_to(destination):
            raise RestoreValidationError("Backup archive contains an unsafe path")
        total_size += member.file_size
        if total_size > MAX_BACKUP_UNCOMPRESSED_SIZE:
            raise RestoreLimitError("Backup archive exceeds the extracted size limit")
        if (
            member.file_size > 0
            and member.file_size / max(member.compress_size, 1)
            > MAX_BACKUP_COMPRESSION_RATIO
        ):
            raise RestoreLimitError(
                "Backup archive exceeds the compression ratio limit"
            )
        validated.append((member, extracted_path))

    extracted_total = 0
    for member, extracted_path in validated:
        if member.is_dir():
            extracted_path.mkdir(parents=True, exist_ok=True)
            continue
        extracted_path.parent.mkdir(parents=True, exist_ok=True)
        member_size = 0
        with archive.open(member) as source, extracted_path.open("wb") as target:
            while chunk := source.read(COPY_CHUNK_SIZE):
                member_size += len(chunk)
                extracted_total += len(chunk)
                if (
                    member_size > member.file_size
                    or extracted_total > MAX_BACKUP_UNCOMPRESSED_SIZE
                ):
                    raise RestoreLimitError(
                        "Backup archive exceeds the extracted size limit"
                    )
                target.write(chunk)


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
    with TemporaryDirectory(prefix="hometrap-restore-") as temporary_directory:
        temporary_path = Path(temporary_directory)
        archive_path = temporary_path / "backup.zip"
        try:
            with archive_path.open("wb") as target:
                _copy_upload(file.file, target)

            extracted_path = temporary_path / "extracted"
            extracted_path.mkdir()
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
        except RestoreLimitError as error:
            session.rollback()
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail=str(error),
            ) from error
        except RestoreValidationError as error:
            session.rollback()
            raise _restore_validation_error(error) from error
        except (BadZipFile, json.JSONDecodeError, UnicodeDecodeError, OSError) as error:
            session.rollback()
            raise _restore_validation_error(
                RestoreValidationError("Backup archive is invalid")
            ) from error
        except (SQLAlchemyError, KeyError, ValueError) as error:
            session.rollback()
            raise _restore_validation_error(
                RestoreValidationError("Backup contents are invalid")
            ) from error

    return {"added": summary.added, "skipped": summary.skipped}


@router.get("", response_model=NotificationSettings)
def get_settings(session: Session = Depends(get_db)) -> dict:
    return get_notification_settings(session)


@router.put("", response_model=NotificationSettings)
@coordinated_write
def update_settings(
    payload: NotificationSettings,
    session: Session = Depends(get_db),
) -> dict:
    value = payload.model_dump(mode="json")
    save_notification_settings(session, value)
    return value


@router.post("/test-notification", response_model=NotificationTestResponse)
@coordinated_write
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
