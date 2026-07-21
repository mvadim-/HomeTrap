from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import sqlite3
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile


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


def _write_uploads(archive: ZipFile, uploads_dir: Path) -> None:
    archive.writestr("uploads/", b"")
    if not uploads_dir.is_dir():
        return

    for path in sorted(uploads_dir.rglob("*")):
        relative_path = Path("uploads") / path.relative_to(uploads_dir)
        archive.write(path, f"{relative_path.as_posix()}{'/' if path.is_dir() else ''}")


@contextmanager
def build_backup(database_path: Path, uploads_dir: Path) -> Iterator[Path]:
    """Build a consistent backup and remove it when the context closes."""
    with TemporaryDirectory(prefix="hometrap-backup-") as temporary_directory:
        temporary_path = Path(temporary_directory)
        snapshot_path = temporary_path / "hometrap.db"
        archive_path = temporary_path / "hometrap-backup.zip"

        _create_snapshot(database_path, snapshot_path)

        from app.main import APP_VERSION

        manifest = {
            "app_version": APP_VERSION,
            "alembic_revision": _alembic_revision(snapshot_path),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "db_sha256": _file_sha256(snapshot_path),
        }
        with ZipFile(archive_path, "w", compression=ZIP_DEFLATED) as archive:
            archive.write(snapshot_path, "hometrap.db")
            _write_uploads(archive, uploads_dir)
            archive.writestr("manifest.json", json.dumps(manifest, sort_keys=True))

        yield archive_path
