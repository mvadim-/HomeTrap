from datetime import datetime
from hashlib import sha256
import json
from pathlib import Path
import sqlite3
from zipfile import ZipFile

from sqlalchemy import Engine

from app.main import APP_VERSION
from app.services.backup import build_backup


def _database_path(engine: Engine) -> Path:
    return Path(str(engine.url.database))


def test_build_backup_contains_database_uploads_and_manifest(
    db_engine: Engine,
    tmp_path: Path,
) -> None:
    uploads_dir = tmp_path / "uploads"
    attachment = uploads_dir / "tenants" / "7" / "contract.pdf"
    attachment.parent.mkdir(parents=True)
    attachment.write_bytes(b"contract contents")

    with build_backup(_database_path(db_engine), uploads_dir) as backup_path:
        assert backup_path.is_file()
        with ZipFile(backup_path) as archive:
            assert set(archive.namelist()) >= {
                "hometrap.db",
                "manifest.json",
                "uploads/",
                "uploads/tenants/7/contract.pdf",
            }
            assert archive.read("uploads/tenants/7/contract.pdf") == b"contract contents"

            database_bytes = archive.read("hometrap.db")
            manifest = json.loads(archive.read("manifest.json"))

        assert manifest["app_version"] == APP_VERSION
        assert manifest["alembic_revision"]
        assert datetime.fromisoformat(manifest["created_at"]).tzinfo is not None
        assert manifest["db_sha256"] == sha256(database_bytes).hexdigest()


def test_build_backup_snapshot_is_a_readable_database(
    db_engine: Engine,
    tmp_path: Path,
) -> None:
    extracted_database = tmp_path / "extracted.db"

    with build_backup(_database_path(db_engine), tmp_path / "uploads") as backup_path:
        with ZipFile(backup_path) as archive:
            extracted_database.write_bytes(archive.read("hometrap.db"))

    with sqlite3.connect(extracted_database) as connection:
        revision = connection.execute("SELECT version_num FROM alembic_version").fetchone()

    assert revision is not None


def test_build_backup_supports_empty_uploads_and_cleans_temporary_files(
    db_engine: Engine,
    tmp_path: Path,
) -> None:
    uploads_dir = tmp_path / "uploads"
    uploads_dir.mkdir()

    with build_backup(_database_path(db_engine), uploads_dir) as backup_path:
        temporary_directory = backup_path.parent
        assert temporary_directory.is_dir()
        with ZipFile(backup_path) as archive:
            assert "uploads/" in archive.namelist()

    assert not temporary_directory.exists()
