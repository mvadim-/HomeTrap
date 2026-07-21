from datetime import datetime
from hashlib import sha256
import json
from pathlib import Path
import sqlite3
from threading import Event, Thread
from zipfile import ZIP_STORED, ZipFile

from sqlalchemy import Engine
from sqlalchemy.orm import Session
import pytest

from app.main import APP_VERSION
from app.models import Apartment, Tenant, TenantAttachment
import app.services.backup as backup_service
from app.services.backup import BackupLimitError, build_backup
from app.services.storage import attachment_path, data_store_lock, delete_attachment


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
            assert (
                archive.read("uploads/tenants/7/contract.pdf") == b"contract contents"
            )

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
        revision = connection.execute(
            "SELECT version_num FROM alembic_version"
        ).fetchone()

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


def test_build_backup_output_always_satisfies_restore_quotas(
    db_engine: Engine,
    tmp_path: Path,
) -> None:
    uploads_dir = tmp_path / "uploads"
    attachment = uploads_dir / "tenants" / "1" / "compressible.pdf"
    attachment.parent.mkdir(parents=True)
    attachment.write_bytes(b"0" * (1024 * 1024))

    with build_backup(_database_path(db_engine), uploads_dir) as backup_path:
        with ZipFile(backup_path) as archive:
            assert all(
                member.compress_type == ZIP_STORED for member in archive.infolist()
            )
            assert all(
                member.file_size / max(member.compress_size, 1)
                <= backup_service.MAX_BACKUP_COMPRESSION_RATIO
                for member in archive.infolist()
            )


def test_build_backup_refuses_archive_above_restore_upload_quota(
    db_engine: Engine,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(backup_service, "MAX_BACKUP_UPLOAD_SIZE", 1)
    snapshot_called = False

    def track_snapshot(*args) -> None:
        nonlocal snapshot_called
        snapshot_called = True

    monkeypatch.setattr(backup_service, "_create_snapshot", track_snapshot)
    with pytest.raises(BackupLimitError, match="restore upload size"):
        with build_backup(_database_path(db_engine), tmp_path / "uploads"):
            pass
    assert not snapshot_called


def test_backup_preflight_stops_streaming_at_member_limit(
    db_engine: Engine,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    uploads_dir = tmp_path / "uploads"
    uploads_dir.mkdir()
    paths = []
    for index in range(3):
        path = uploads_dir / f"{index}.pdf"
        path.write_bytes(b"x")
        paths.append(path)
    visited = 0

    def tracked_paths(_uploads_dir: Path):
        nonlocal visited
        for path in paths:
            visited += 1
            yield path

    monkeypatch.setattr(backup_service, "MAX_BACKUP_MEMBERS", 4)
    monkeypatch.setattr(backup_service, "_upload_paths", tracked_paths)
    with pytest.raises(BackupLimitError, match="restore member limit"):
        with build_backup(_database_path(db_engine), uploads_dir):
            pass

    assert visited == 2


def test_backup_preflight_accounts_for_zip_metadata_before_snapshot(
    db_engine: Engine,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_path = _database_path(db_engine)
    database_bytes = backup_service._database_size_upper_bound(database_path)
    snapshot_called = False

    def track_snapshot(*args) -> None:
        nonlocal snapshot_called
        snapshot_called = True

    monkeypatch.setattr(backup_service, "_zip_member_overhead", lambda name: 1000)
    monkeypatch.setattr(
        backup_service,
        "MAX_BACKUP_UPLOAD_SIZE",
        database_bytes + 2999,
    )
    monkeypatch.setattr(backup_service, "_create_snapshot", track_snapshot)

    with pytest.raises(BackupLimitError, match="restore upload size"):
        with build_backup(database_path, tmp_path / "uploads"):
            pass

    assert not snapshot_called


def test_build_backup_serializes_attachment_deletion(
    db_engine: Engine,
    db_session: Session,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    apartment = Apartment(
        name="Конкурентна",
        address="Київ",
        rent_amount=500,
        rent_currency="USD",
    )
    tenant = Tenant(
        apartment=apartment,
        full_name="Орендар",
        contract_start=datetime(2026, 1, 1).date(),
    )
    attachment = TenantAttachment(
        tenant=tenant,
        original_name="contract.pdf",
        stored_name="contract.pdf",
        content_type="application/pdf",
        size_bytes=8,
    )
    db_session.add(attachment)
    db_session.commit()
    uploads_dir = tmp_path / "uploads"
    live_path = attachment_path(uploads_dir, tenant.id, attachment.stored_name)
    live_path.parent.mkdir(parents=True)
    live_path.write_bytes(b"contract")

    original_create_snapshot = backup_service._create_snapshot
    delete_attempted = Event()
    workers: list[Thread] = []

    def delete_worker() -> None:
        delete_attempted.set()
        with data_store_lock(), Session(db_engine) as session:
            row = session.get(TenantAttachment, attachment.id)
            assert row is not None
            session.delete(row)
            session.commit()
            delete_attachment(uploads_dir, tenant.id, attachment.stored_name)

    def synchronized_snapshot(database_path: Path, snapshot_path: Path) -> None:
        worker = Thread(target=delete_worker)
        workers.append(worker)
        worker.start()
        assert delete_attempted.wait(timeout=5)
        original_create_snapshot(database_path, snapshot_path)

    monkeypatch.setattr(backup_service, "_create_snapshot", synchronized_snapshot)

    extracted_database = tmp_path / "snapshot.db"
    with build_backup(_database_path(db_engine), uploads_dir) as backup_path:
        with ZipFile(backup_path) as archive:
            extracted_database.write_bytes(archive.read("hometrap.db"))
            assert (
                archive.read(f"uploads/tenants/{tenant.id}/contract.pdf") == b"contract"
            )
    workers[0].join(timeout=5)
    assert not workers[0].is_alive()
    with sqlite3.connect(extracted_database) as connection:
        attachment_count = connection.execute(
            "SELECT count(*) FROM tenant_attachments"
        ).fetchone()[0]
    assert attachment_count == 1
