from collections.abc import Iterator
from contextlib import contextmanager
from io import BytesIO
import json
from pathlib import Path
from random import Random
import re
from zipfile import ZIP_DEFLATED, ZipFile

from httpx import ASGITransport, AsyncClient
import pytest

import app.routers.settings as settings_router
from app.config import Settings
from app.main import create_app
from app.services.backup import build_backup


async def _create_client(tmp_path: Path) -> tuple[object, AsyncClient, Settings]:
    settings = Settings(
        database_path=tmp_path / "settings.db",
        uploads_dir=tmp_path / "uploads",
        secret_key="test-session-secret",
        debug=True,
        scheduler_enabled=False,
        admin_username="admin",
        admin_password="password",
    )
    application = create_app(settings)
    lifespan = application.router.lifespan_context(application)
    await lifespan.__aenter__()
    client = AsyncClient(
        transport=ASGITransport(app=application),
        base_url="http://test",
    )
    return lifespan, client, settings


async def _close_client(lifespan: object, client: AsyncClient) -> None:
    await client.aclose()
    await lifespan.__aexit__(None, None, None)


async def _login(client: AsyncClient) -> None:
    response = await client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "password"},
    )
    assert response.status_code == 200


def _apartment_payload(name: str, rent_amount: str) -> dict[str, str]:
    return {
        "name": name,
        "address": f"Київ, {name}",
        "rent_amount": rent_amount,
        "rent_currency": "USD",
        "notes": f"Примітка: {name}",
    }


async def _build_backup_bytes(
    tmp_path: Path,
    apartments: list[dict[str, str]] | None = None,
) -> bytes:
    lifespan, client, _settings = await _create_client(tmp_path)
    try:
        await _login(client)
        for apartment in apartments or []:
            response = await client.post("/api/apartments", json=apartment)
            assert response.status_code == 201
        response = await client.get("/api/settings/backup")
        assert response.status_code == 200
        return response.content
    finally:
        await _close_client(lifespan, client)


def _replace_manifest(backup: bytes, **changes: str) -> bytes:
    output = BytesIO()
    with (
        ZipFile(BytesIO(backup)) as source,
        ZipFile(output, "w", compression=ZIP_DEFLATED) as target,
    ):
        for member in source.infolist():
            content = source.read(member)
            if member.filename == "manifest.json":
                manifest = json.loads(content)
                manifest.update(changes)
                content = json.dumps(manifest).encode()
            target.writestr(member, content)
    return output.getvalue()


def _add_archive_member(backup: bytes, name: str, content: bytes) -> bytes:
    output = BytesIO()
    with (
        ZipFile(BytesIO(backup)) as source,
        ZipFile(output, "w", compression=ZIP_DEFLATED) as target,
    ):
        for member in source.infolist():
            target.writestr(member, source.read(member))
        target.writestr(name, content)
    return output.getvalue()


async def test_download_backup_returns_valid_zip_and_cleans_temp(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    lifespan, client, settings = await _create_client(tmp_path)
    attachment = settings.uploads_dir / "tenants" / "3" / "contract.pdf"
    attachment.parent.mkdir(parents=True)
    attachment.write_bytes(b"contract")
    temporary_paths: list[Path] = []

    @contextmanager
    def tracked_build_backup(
        database_path: Path,
        uploads_dir: Path,
    ) -> Iterator[Path]:
        with build_backup(database_path, uploads_dir) as backup_path:
            temporary_paths.append(backup_path)
            yield backup_path

    monkeypatch.setattr(settings_router, "build_backup", tracked_build_backup)
    try:
        await _login(client)

        response = await client.get("/api/settings/backup")

        assert response.status_code == 200
        assert response.headers["content-type"] == "application/zip"
        disposition = response.headers["content-disposition"]
        assert re.fullmatch(
            r'attachment; filename="hometrap-backup-\d{8}T\d{6}Z\.zip"',
            disposition,
        )
        with ZipFile(BytesIO(response.content)) as archive:
            assert set(archive.namelist()) >= {
                "hometrap.db",
                "manifest.json",
                "uploads/tenants/3/contract.pdf",
            }
            assert archive.read("uploads/tenants/3/contract.pdf") == b"contract"
        assert temporary_paths
        assert all(not path.exists() for path in temporary_paths)
    finally:
        await _close_client(lifespan, client)


async def test_download_backup_requires_authentication(tmp_path: Path) -> None:
    lifespan, client, _settings = await _create_client(tmp_path)
    try:
        response = await client.get("/api/settings/backup")

        assert response.status_code == 401
    finally:
        await _close_client(lifespan, client)


async def test_restore_backup_merges_missing_rows_and_preserves_existing(
    tmp_path: Path,
) -> None:
    shared_source = _apartment_payload("Спільна", "325.00")
    imported = _apartment_payload("Імпортована", "500.00")
    backup = await _build_backup_bytes(tmp_path / "source", [shared_source, imported])
    lifespan, client, _settings = await _create_client(tmp_path / "target")
    try:
        await _login(client)
        shared_live = _apartment_payload("Спільна", "999.00")
        shared_live["notes"] = "Локальне значення"
        created = await client.post("/api/apartments", json=shared_live)
        assert created.status_code == 201

        response = await client.post(
            "/api/settings/restore",
            files={"file": ("backup.zip", backup, "application/zip")},
        )

        assert response.status_code == 200
        assert response.json() == {
            "added": {
                "apartments": 1,
                "services": 0,
                "tariffs": 0,
                "tenants": 0,
                "tenant_attachments": 0,
                "invoices": 0,
                "invoice_lines": 0,
                "exchange_rates": 0,
            },
            "skipped": {
                "apartments": 1,
                "services": 0,
                "tariffs": 0,
                "tenants": 0,
                "tenant_attachments": 0,
                "invoices": 0,
                "invoice_lines": 0,
                "exchange_rates": 0,
            },
        }
        apartments = (await client.get("/api/apartments")).json()
        assert {apartment["name"] for apartment in apartments} == {
            "Спільна",
            "Імпортована",
        }
        preserved = next(
            apartment for apartment in apartments if apartment["name"] == "Спільна"
        )
        assert preserved["rent_amount"] == "999.00"
        assert preserved["notes"] == "Локальне значення"
    finally:
        await _close_client(lifespan, client)


async def test_large_backup_round_trip_restores_attachment(tmp_path: Path) -> None:
    attachment_content = Random(20260721).randbytes(9 * 1024 * 1024)
    source_lifespan, source_client, _source_settings = await _create_client(
        tmp_path / "source"
    )
    try:
        await _login(source_client)
        apartment_response = await source_client.post(
            "/api/apartments",
            json=_apartment_payload("Великий архів", "700.00"),
        )
        assert apartment_response.status_code == 201
        tenant_response = await source_client.post(
            f"/api/apartments/{apartment_response.json()['id']}/tenants",
            json={
                "full_name": "Олена Велика",
                "phone": None,
                "email": None,
                "contract_start": "2026-01-01",
                "contract_end": None,
                "billing_day": 1,
                "notes": None,
            },
        )
        assert tenant_response.status_code == 201
        upload_response = await source_client.post(
            f"/api/tenants/{tenant_response.json()['id']}/attachments",
            files={
                "files": (
                    "large-contract.pdf",
                    attachment_content,
                    "application/pdf",
                )
            },
        )
        assert upload_response.status_code == 201

        backup_response = await source_client.get("/api/settings/backup")

        assert backup_response.status_code == 200
        assert len(backup_response.content) > 9 * 1024 * 1024
        backup = backup_response.content
    finally:
        await _close_client(source_lifespan, source_client)

    target_lifespan, target_client, _target_settings = await _create_client(
        tmp_path / "target"
    )
    try:
        await _login(target_client)

        restore_response = await target_client.post(
            "/api/settings/restore",
            files={"file": ("large-backup.zip", backup, "application/zip")},
        )

        assert restore_response.status_code == 200
        assert restore_response.json()["added"]["tenant_attachments"] == 1
        apartments = (await target_client.get("/api/apartments")).json()
        tenants = (
            await target_client.get(f"/api/apartments/{apartments[0]['id']}/tenants")
        ).json()
        attachments = (
            await target_client.get(f"/api/tenants/{tenants[0]['id']}/attachments")
        ).json()
        downloaded = await target_client.get(f"/api/attachments/{attachments[0]['id']}")
        assert downloaded.status_code == 200
        assert downloaded.content == attachment_content
    finally:
        await _close_client(target_lifespan, target_client)


async def test_restore_backup_requires_authentication(tmp_path: Path) -> None:
    lifespan, client, _settings = await _create_client(tmp_path)
    try:
        response = await client.post(
            "/api/settings/restore",
            files={"file": ("backup.zip", b"not-a-zip", "application/zip")},
        )

        assert response.status_code == 401
    finally:
        await _close_client(lifespan, client)


async def test_restore_backup_rejects_broken_zip(tmp_path: Path) -> None:
    lifespan, client, _settings = await _create_client(tmp_path)
    try:
        await _login(client)

        response = await client.post(
            "/api/settings/restore",
            files={"file": ("backup.zip", b"not-a-zip", "application/zip")},
        )

        assert response.status_code == 422
        assert response.json()["detail"] == "Backup archive is invalid"
    finally:
        await _close_client(lifespan, client)


@pytest.mark.parametrize(
    ("manifest_change", "expected_detail"),
    [
        (
            {"alembic_revision": "incompatible"},
            "Backup database revision is incompatible with the current database",
        ),
        (
            {"db_sha256": "0" * 64},
            "Backup database checksum does not match manifest",
        ),
    ],
)
async def test_restore_backup_rejects_invalid_manifest(
    tmp_path: Path,
    manifest_change: dict[str, str],
    expected_detail: str,
) -> None:
    backup = await _build_backup_bytes(tmp_path / "source")
    invalid_backup = _replace_manifest(backup, **manifest_change)
    lifespan, client, _settings = await _create_client(tmp_path / "target")
    try:
        await _login(client)

        response = await client.post(
            "/api/settings/restore",
            files={"file": ("backup.zip", invalid_backup, "application/zip")},
        )

        assert response.status_code == 422
        assert response.json()["detail"] == expected_detail
        assert (await client.get("/api/apartments")).json() == []
    finally:
        await _close_client(lifespan, client)


async def test_restore_backup_rejects_zip_slip_member(tmp_path: Path) -> None:
    backup = await _build_backup_bytes(tmp_path / "source")
    malicious_backup = _add_archive_member(backup, "../escaped.txt", b"escaped")
    lifespan, client, _settings = await _create_client(tmp_path / "target")
    try:
        await _login(client)

        response = await client.post(
            "/api/settings/restore",
            files={"file": ("backup.zip", malicious_backup, "application/zip")},
        )

        assert response.status_code == 422
        assert response.json()["detail"] == "Backup archive contains an unsafe path"
        assert (await client.get("/api/apartments")).json() == []
    finally:
        await _close_client(lifespan, client)
