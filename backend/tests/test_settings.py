from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager, contextmanager
from io import BytesIO
import inspect
import json
from pathlib import Path
from random import Random
import re
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile

from httpx import ASGITransport, AsyncClient
import pytest
from fastapi import FastAPI, File, UploadFile
import starlette.formparsers as formparsers

import app.middleware as middleware_module
import app.routers.settings as settings_router
import app.services.backup_limits as backup_limits
from app.config import Settings
from app.main import create_app
from app.services.backup import build_backup


@asynccontextmanager
async def _client(tmp_path: Path) -> AsyncIterator[tuple[AsyncClient, Settings]]:
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
    try:
        yield client, settings
    finally:
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
    async with _client(tmp_path) as (client, _settings):
        await _login(client)
        for apartment in apartments or []:
            response = await client.post("/api/apartments", json=apartment)
            assert response.status_code == 201
        response = await client.get("/api/settings/backup")
        assert response.status_code == 200
        return response.content


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
    async with _client(tmp_path) as (client, settings):
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


async def test_download_backup_cleans_temp_when_send_fails(tmp_path: Path) -> None:
    @contextmanager
    def response_file() -> Iterator[Path]:
        with TemporaryDirectory(dir=tmp_path) as temporary_directory:
            path = Path(temporary_directory) / "backup.zip"
            path.write_bytes(b"backup-content")
            yield path

    cleanup = response_file()
    path = cleanup.__enter__()
    response = settings_router.CleanupFileResponse(
        path,
        cleanup=cleanup,
        media_type="application/zip",
        filename="backup.zip",
    )

    async def receive() -> dict[str, object]:
        return {"type": "http.request", "body": b"", "more_body": False}

    async def failing_send(message: dict[str, object]) -> None:
        if message["type"] == "http.response.body":
            raise RuntimeError("client disconnected")

    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.4"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": "/api/settings/backup",
        "raw_path": b"/api/settings/backup",
        "query_string": b"",
        "headers": [],
        "client": ("test", 1),
        "server": ("test", 80),
    }
    with pytest.raises(RuntimeError, match="disconnected"):
        await response(scope, receive, failing_send)  # type: ignore[arg-type]

    assert not path.exists()


async def test_download_backup_requires_authentication(tmp_path: Path) -> None:
    async with _client(tmp_path) as (client, _settings):
        response = await client.get("/api/settings/backup")

        assert response.status_code == 401


async def test_restore_backup_merges_missing_rows_and_preserves_existing(
    tmp_path: Path,
) -> None:
    shared_source = _apartment_payload("Спільна", "325.00")
    imported = _apartment_payload("Імпортована", "500.00")
    backup = await _build_backup_bytes(tmp_path / "source", [shared_source, imported])
    async with _client(tmp_path / "target") as (client, _settings):
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


async def test_large_backup_round_trip_restores_attachment(tmp_path: Path) -> None:
    attachment_content = Random(20260721).randbytes(9 * 1024 * 1024)
    async with _client(tmp_path / "source") as (source_client, _source_settings):
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

    async with _client(tmp_path / "target") as (target_client, _target_settings):
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


async def test_restore_backup_requires_authentication(tmp_path: Path) -> None:
    async with _client(tmp_path) as (client, _settings):
        response = await client.post(
            "/api/settings/restore",
            files={"file": ("backup.zip", b"not-a-zip", "application/zip")},
        )

        assert response.status_code == 401


def test_restore_handler_runs_in_fastapi_threadpool() -> None:
    assert not inspect.iscoroutinefunction(settings_router.restore_backup)


async def test_restore_backup_rejects_broken_zip(tmp_path: Path) -> None:
    async with _client(tmp_path) as (client, _settings):
        await _login(client)

        response = await client.post(
            "/api/settings/restore",
            files={"file": ("backup.zip", b"not-a-zip", "application/zip")},
        )

        assert response.status_code == 422
        assert response.json()["detail"] == "Backup archive is invalid"


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
    async with _client(tmp_path / "target") as (client, _settings):
        await _login(client)

        response = await client.post(
            "/api/settings/restore",
            files={"file": ("backup.zip", invalid_backup, "application/zip")},
        )

        assert response.status_code == 422
        assert response.json()["detail"] == expected_detail
        assert (await client.get("/api/apartments")).json() == []


@pytest.mark.parametrize(
    "path_kind",
    ["parent", "posix_absolute", "windows_drive", "windows_unc", "backslash_parent"],
)
async def test_restore_backup_rejects_zip_slip_member(
    tmp_path: Path,
    path_kind: str,
) -> None:
    backup = await _build_backup_bytes(tmp_path / "source")
    outside_path = tmp_path / "escaped.txt"
    names = {
        "parent": "../escaped.txt",
        "posix_absolute": str(outside_path),
        "windows_drive": r"C:\escaped.txt",
        "windows_unc": r"\\server\share\escaped.txt",
        "backslash_parent": r"..\escaped.txt",
    }
    malicious_backup = _add_archive_member(backup, names[path_kind], b"escaped")
    async with _client(tmp_path / "target") as (client, _settings):
        await _login(client)

        response = await client.post(
            "/api/settings/restore",
            files={"file": ("backup.zip", malicious_backup, "application/zip")},
        )

        assert response.status_code == 422
        assert response.json()["detail"] == "Backup archive contains an unsafe path"
        assert (await client.get("/api/apartments")).json() == []
        assert not outside_path.exists()


@pytest.mark.parametrize(
    ("collision_name", "collision_content"),
    [
        pytest.param("./manifest.json", b"{}", id="dot-segment"),
        pytest.param("uploads//", b"", id="repeated-separator"),
        pytest.param("uploads", b"file", id="file-directory-slash"),
        pytest.param(r".\manifest.json", b"{}", id="windows-separator"),
    ],
)
async def test_restore_backup_rejects_canonical_path_collisions_before_import(
    tmp_path: Path,
    collision_name: str,
    collision_content: bytes,
) -> None:
    backup = await _build_backup_bytes(
        tmp_path / "source",
        [_apartment_payload("Не імпортувати", "500.00")],
    )
    malicious_backup = _add_archive_member(
        backup,
        collision_name,
        collision_content,
    )
    async with _client(tmp_path / "target") as (client, settings):
        await _login(client)
        existing = await client.post(
            "/api/apartments",
            json=_apartment_payload("Локальна", "700.00"),
        )
        assert existing.status_code == 201
        sentinel = settings.uploads_dir / "sentinel.txt"
        sentinel.parent.mkdir(parents=True, exist_ok=True)
        sentinel.write_bytes(b"unchanged")

        response = await client.post(
            "/api/settings/restore",
            files={"file": ("backup.zip", malicious_backup, "application/zip")},
        )

        assert response.status_code == 422
        assert response.json()["detail"] == (
            "Backup archive contains duplicate paths"
        )
        apartments = (await client.get("/api/apartments")).json()
        assert [(item["name"], item["rent_amount"]) for item in apartments] == [
            ("Локальна", "700.00")
        ]
        assert sentinel.read_bytes() == b"unchanged"


@pytest.mark.parametrize(
    ("limit_name", "limit_value", "expected_detail"),
    [
        ("MAX_BACKUP_UPLOAD_SIZE", 10, "upload size"),
        ("MAX_BACKUP_MEMBERS", 2, "too many files"),
        ("MAX_BACKUP_UNCOMPRESSED_SIZE", 10, "extracted size"),
    ],
)
async def test_restore_backup_rejects_resource_limit_before_import(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    limit_name: str,
    limit_value: int,
    expected_detail: str,
) -> None:
    backup = await _build_backup_bytes(tmp_path / "source")
    monkeypatch.setattr(backup_limits, limit_name, limit_value)
    async with _client(tmp_path / "target") as (client, settings):
        await _login(client)
        response = await client.post(
            "/api/settings/restore",
            files={"file": ("backup.zip", backup, "application/zip")},
        )

        assert response.status_code == 413
        assert expected_detail in response.json()["detail"]
        assert (await client.get("/api/apartments")).json() == []
        assert not settings.uploads_dir.exists() or not any(
            settings.uploads_dir.rglob("*")
        )


async def test_restore_backup_rejects_high_ratio_untrusted_member(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    backup = await _build_backup_bytes(tmp_path / "source")
    malicious_backup = _add_archive_member(backup, "uploads/bomb.pdf", b"0" * 4096)
    monkeypatch.setattr(backup_limits, "MAX_BACKUP_COMPRESSION_RATIO", 2)
    async with _client(tmp_path / "target") as (client, _settings):
        await _login(client)

        response = await client.post(
            "/api/settings/restore",
            files={"file": ("backup.zip", malicious_backup, "application/zip")},
        )

        assert response.status_code == 413
        assert "compression ratio" in response.json()["detail"]


def _restore_scope(
    headers: list[tuple[bytes, bytes]] | None = None,
) -> dict[str, object]:
    return {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.4"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/api/settings/restore",
        "raw_path": b"/api/settings/restore",
        "query_string": b"",
        "headers": headers or [],
        "client": ("test", 1),
        "server": ("test", 80),
        "app": object(),
    }


async def test_restore_guard_rejects_unauthenticated_request_without_reading_body(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    downstream_called = False
    receive_called = False

    async def downstream(_scope, _receive, _send) -> None:
        nonlocal downstream_called
        downstream_called = True

    async def receive() -> dict[str, object]:
        nonlocal receive_called
        receive_called = True
        return {"type": "http.request", "body": b"archive", "more_body": False}

    sent: list[dict[str, object]] = []

    async def send(message: dict[str, object]) -> None:
        sent.append(message)

    monkeypatch.setattr(middleware_module, "is_authenticated", lambda _request: False)
    guard = middleware_module.RestoreUploadGuardMiddleware(downstream, max_body_size=4)
    await guard(_restore_scope(), receive, send)  # type: ignore[arg-type]

    assert sent[0]["status"] == 401
    assert not receive_called
    assert not downstream_called


async def test_restore_guard_rejects_content_length_before_reading_body(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    receive_called = False

    async def downstream(_scope, _receive, _send) -> None:
        raise AssertionError("oversized request reached multipart parser")

    async def receive() -> dict[str, object]:
        nonlocal receive_called
        receive_called = True
        return {"type": "http.request", "body": b"archive", "more_body": False}

    sent: list[dict[str, object]] = []

    async def send(message: dict[str, object]) -> None:
        sent.append(message)

    monkeypatch.setattr(middleware_module, "is_authenticated", lambda _request: True)
    guard = middleware_module.RestoreUploadGuardMiddleware(downstream, max_body_size=4)
    scope = _restore_scope(headers=[(b"content-length", b"5")])
    await guard(scope, receive, send)  # type: ignore[arg-type]

    assert sent[0]["status"] == 413
    assert not receive_called


async def test_restore_guard_bounds_chunked_body_before_downstream_processing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    chunks = iter(
        [
            {"type": "http.request", "body": b"123", "more_body": True},
            {"type": "http.request", "body": b"45", "more_body": False},
        ]
    )

    async def downstream(_scope, receive, _send) -> None:
        while (await receive()).get("more_body", False):
            pass

    async def receive() -> dict[str, object]:
        return next(chunks)

    sent: list[dict[str, object]] = []

    async def send(message: dict[str, object]) -> None:
        sent.append(message)

    monkeypatch.setattr(middleware_module, "is_authenticated", lambda _request: True)
    guard = middleware_module.RestoreUploadGuardMiddleware(downstream, max_body_size=4)
    await guard(_restore_scope(), receive, send)  # type: ignore[arg-type]

    assert sent[0]["status"] == 413


async def test_restore_guard_returns_413_and_closes_chunked_multipart_spool(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    spooled_files = []
    original_spooled_file = formparsers.SpooledTemporaryFile

    def tracked_spooled_file(*args, **kwargs):
        spooled_file = original_spooled_file(*args, **kwargs)
        spooled_files.append(spooled_file)
        return spooled_file

    monkeypatch.setattr(formparsers, "SpooledTemporaryFile", tracked_spooled_file)
    monkeypatch.setattr(middleware_module, "is_authenticated", lambda _request: True)

    application = FastAPI()

    @application.post("/api/settings/restore")
    async def parse_restore(file: UploadFile = File(...)) -> None:
        raise AssertionError(f"oversized file reached endpoint: {file.filename}")

    boundary = "restore-boundary"
    first_chunk = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="file"; filename="backup.zip"\r\n'
        "Content-Type: application/zip\r\n\r\n"
    ).encode() + b"123"
    second_chunk = b"45\r\n" + f"--{boundary}--\r\n".encode()
    chunks = iter(
        [
            {"type": "http.request", "body": first_chunk, "more_body": True},
            {"type": "http.request", "body": second_chunk, "more_body": False},
        ]
    )

    async def receive() -> dict[str, object]:
        return next(chunks)

    sent: list[dict[str, object]] = []

    async def send(message: dict[str, object]) -> None:
        sent.append(message)

    scope = _restore_scope(
        headers=[
            (
                b"content-type",
                f"multipart/form-data; boundary={boundary}".encode(),
            )
        ]
    )
    guard = middleware_module.RestoreUploadGuardMiddleware(
        application,
        max_body_size=len(first_chunk) + 1,
    )
    await guard(scope, receive, send)  # type: ignore[arg-type]

    assert sent[0]["status"] == 413
    assert spooled_files
    assert all(spooled_file.closed for spooled_file in spooled_files)
