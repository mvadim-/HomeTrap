from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timezone
from hashlib import sha256
import json
import os
from pathlib import Path
import sqlite3
from tempfile import TemporaryDirectory
from zipfile import ZIP_STORED, ZipFile

from app.constants import APP_VERSION
from app.services.backup_limits import (
    MAX_BACKUP_COMPRESSION_RATIO,
    MAX_BACKUP_MEMBERS,
    MAX_BACKUP_UNCOMPRESSED_SIZE,
    MAX_BACKUP_UPLOAD_SIZE,
)
from app.services.storage import data_store_lock


class BackupLimitError(RuntimeError):
    """Raised when live data cannot fit a restorable backup archive."""


def _file_sha256(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _alembic_revision(database_path: Path) -> str:
    with sqlite3.connect(database_path) as connection:
        row = connection.execute("SELECT version_num FROM alembic_version").fetchone()
    if row is None:
        raise RuntimeError("Database does not contain an Alembic revision")
    return str(row[0])


def _create_snapshot(database_path: Path, snapshot_path: Path) -> None:
    with sqlite3.connect(database_path, isolation_level=None) as connection:
        connection.execute("VACUUM INTO ?", (str(snapshot_path),))


def _upload_paths(uploads_dir: Path) -> Iterator[Path]:
    if not uploads_dir.is_dir():
        return
    directories = [os.scandir(uploads_dir)]
    try:
        while directories:
            try:
                entry = next(directories[-1])
            except StopIteration:
                directories.pop().close()
                continue
            path = Path(entry.path)
            yield path
            if entry.is_dir(follow_symlinks=False):
                directories.append(os.scandir(path))
    finally:
        for directory in directories:
            directory.close()


def _archive_name(path: Path, uploads_dir: Path) -> str:
    relative_path = Path("uploads") / path.relative_to(uploads_dir)
    return f"{relative_path.as_posix()}{'/' if path.is_dir() else ''}"


def _write_uploads(archive: ZipFile, uploads_dir: Path) -> None:
    archive.writestr("uploads/", b"")
    for path in _upload_paths(uploads_dir):
        archive.write(path, _archive_name(path, uploads_dir))


def _validate_archive(archive_path: Path) -> None:
    if archive_path.stat().st_size > MAX_BACKUP_UPLOAD_SIZE:
        raise BackupLimitError("Backup archive exceeds the restore upload size limit")
    with ZipFile(archive_path) as archive:
        members = archive.infolist()
        if len(members) > MAX_BACKUP_MEMBERS:
            raise BackupLimitError("Backup archive exceeds the restore member limit")
        if sum(member.file_size for member in members) > MAX_BACKUP_UNCOMPRESSED_SIZE:
            raise BackupLimitError(
                "Backup archive exceeds the restore extracted size limit"
            )
        if any(
            member.file_size > 0
            and member.file_size / max(member.compress_size, 1)
            > MAX_BACKUP_COMPRESSION_RATIO
            for member in members
        ):
            raise BackupLimitError(
                "Backup archive exceeds the restore compression limit"
            )


def _database_size_upper_bound(database_path: Path) -> int:
    with sqlite3.connect(database_path) as connection:
        page_count = int(connection.execute("PRAGMA page_count").fetchone()[0])
        page_size = int(connection.execute("PRAGMA page_size").fetchone()[0])
    return max(database_path.stat().st_size, page_count * page_size)


def _zip_member_overhead(name: str) -> int:
    encoded_name_size = len(name.encode("utf-8"))
    return 30 + encoded_name_size + 46 + encoded_name_size


def _preflight_backup(database_path: Path, uploads_dir: Path) -> None:
    database_bytes = _database_size_upper_bound(database_path)
    manifest_size = len(
        json.dumps(
            {
                "app_version": APP_VERSION,
                "alembic_revision": _alembic_revision(database_path),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "db_sha256": "0" * 64,
            },
            sort_keys=True,
        ).encode("utf-8")
    )
    member_count = 3
    uncompressed_bytes = database_bytes + manifest_size
    archive_bytes = uncompressed_bytes + 22
    for name in ("hometrap.db", "uploads/", "manifest.json"):
        archive_bytes += _zip_member_overhead(name)
    if member_count > MAX_BACKUP_MEMBERS:
        raise BackupLimitError("Backup archive exceeds the restore member limit")

    for path in _upload_paths(uploads_dir):
        member_count += 1
        if member_count > MAX_BACKUP_MEMBERS:
            raise BackupLimitError("Backup archive exceeds the restore member limit")
        name = _archive_name(path, uploads_dir)
        archive_bytes += _zip_member_overhead(name)
        if path.is_file():
            file_size = path.stat().st_size
            uncompressed_bytes += file_size
            archive_bytes += file_size
        if uncompressed_bytes > MAX_BACKUP_UNCOMPRESSED_SIZE:
            raise BackupLimitError(
                "Backup archive exceeds the restore extracted size limit"
            )
        if archive_bytes > MAX_BACKUP_UPLOAD_SIZE:
            raise BackupLimitError("Backup archive exceeds the restore upload size limit")

    if uncompressed_bytes > MAX_BACKUP_UNCOMPRESSED_SIZE:
        raise BackupLimitError("Backup archive exceeds the restore extracted size limit")
    if archive_bytes > MAX_BACKUP_UPLOAD_SIZE:
        raise BackupLimitError("Backup archive exceeds the restore upload size limit")


@contextmanager
def build_backup(database_path: Path, uploads_dir: Path) -> Iterator[Path]:
    """Build a consistent backup and remove it when the context closes."""
    with TemporaryDirectory(prefix="hometrap-backup-") as temporary_directory:
        temporary_path = Path(temporary_directory)
        snapshot_path = temporary_path / "hometrap.db"
        archive_path = temporary_path / "hometrap-backup.zip"

        with data_store_lock():
            _preflight_backup(database_path, uploads_dir)
            _create_snapshot(database_path, snapshot_path)
            manifest = {
                "app_version": APP_VERSION,
                "alembic_revision": _alembic_revision(snapshot_path),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "db_sha256": _file_sha256(snapshot_path),
            }
            # Store without compression so application-generated members can never
            # be rejected by restore's zip-bomb compression-ratio guard.
            with ZipFile(archive_path, "w", compression=ZIP_STORED) as archive:
                archive.write(snapshot_path, "hometrap.db")
                _write_uploads(archive, uploads_dir)
                archive.writestr("manifest.json", json.dumps(manifest, sort_keys=True))
            _validate_archive(archive_path)

        yield archive_path
