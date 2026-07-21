import json
from pathlib import Path, PurePosixPath, PureWindowsPath
import stat
from tempfile import TemporaryDirectory
from typing import BinaryIO
from zipfile import BadZipFile, ZipFile, ZipInfo

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.services import backup_limits
from app.services.backup_limits import ArchiveMetadataLimitError
from app.services.restore import (
    ImportSummary,
    RestoreValidationError,
    import_backup,
    validate_manifest,
)

COPY_CHUNK_SIZE = 1024 * 1024


class RestoreLimitError(RestoreValidationError):
    """Raised when an uploaded backup exceeds a resource quota."""


def _copy_upload(source: BinaryIO, target: BinaryIO) -> None:
    copied = 0
    while chunk := source.read(COPY_CHUNK_SIZE):
        copied += len(chunk)
        if copied > backup_limits.MAX_BACKUP_UPLOAD_SIZE:
            raise RestoreLimitError("Backup archive exceeds the upload size limit")
        target.write(chunk)


def _member_target(member: ZipInfo, destination: Path) -> Path:
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
    extracted_path = destination.joinpath(*member_path.parts).resolve()
    if not extracted_path.is_relative_to(destination):
        raise RestoreValidationError("Backup archive contains an unsafe path")
    return extracted_path


def _extract_backup(archive: ZipFile, destination: Path) -> None:
    destination = destination.resolve()
    seen_targets: set[Path] = set()
    validated: list[tuple[ZipInfo, Path]] = []
    for member in archive.infolist():
        extracted_path = _member_target(member, destination)
        if extracted_path in seen_targets:
            raise RestoreValidationError("Backup archive contains duplicate paths")
        seen_targets.add(extracted_path)
        validated.append((member, extracted_path))

    try:
        backup_limits.validate_zip_metadata([member for member, _ in validated])
    except ArchiveMetadataLimitError as error:
        raise RestoreLimitError(str(error)) from error

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
                    or extracted_total > backup_limits.MAX_BACKUP_UNCOMPRESSED_SIZE
                ):
                    raise RestoreLimitError(
                        "Backup archive exceeds the extracted size limit"
                    )
                target.write(chunk)


def restore_uploaded_backup(
    source: BinaryIO,
    live_session: Session,
    uploads_dir: Path,
) -> ImportSummary:
    """Ingest, validate, extract and transactionally merge an uploaded backup."""
    try:
        with TemporaryDirectory(prefix="hometrap-restore-") as temporary_directory:
            temporary_path = Path(temporary_directory)
            archive_path = temporary_path / "backup.zip"
            with archive_path.open("wb") as target:
                _copy_upload(source, target)

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
            current_revision = live_session.scalar(
                text("SELECT version_num FROM alembic_version")
            )
            if not isinstance(current_revision, str) or not current_revision:
                raise RestoreValidationError(
                    "Current database does not contain an Alembic revision"
                )
            validate_manifest(manifest, current_revision, database_path)
            return import_backup(
                database_path,
                backup_uploads_dir,
                live_session,
                uploads_dir,
            )
    except (RestoreLimitError, RestoreValidationError):
        live_session.rollback()
        raise
    except (BadZipFile, json.JSONDecodeError, UnicodeDecodeError, OSError) as error:
        live_session.rollback()
        raise RestoreValidationError("Backup archive is invalid") from error
    except (SQLAlchemyError, KeyError, ValueError) as error:
        live_session.rollback()
        raise RestoreValidationError("Backup contents are invalid") from error
