from collections.abc import Iterator
from contextlib import contextmanager
from io import BytesIO
from pathlib import Path
import re
from zipfile import ZipFile

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
        login = await client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "password"},
        )
        assert login.status_code == 200

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
