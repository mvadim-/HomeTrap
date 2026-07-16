from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.main import create_app
from app.services.storage import attachment_path


async def _create_client(tmp_path):
    settings = Settings(
        database_path=tmp_path / "attachments.db",
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
    response = await client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "password"},
    )
    assert response.status_code == 200
    return lifespan, client, settings


async def _close_client(lifespan, client: AsyncClient) -> None:
    await client.aclose()
    await lifespan.__aexit__(None, None, None)


async def _create_tenant(client: AsyncClient) -> dict:
    apartment = await client.post(
        "/api/apartments",
        json={
            "name": "Квартира 1",
            "address": "Київ, вул. Хрещатик, 1",
            "rent_amount": "325.00",
            "rent_currency": "USD",
            "notes": None,
        },
    )
    assert apartment.status_code == 201
    tenant = await client.post(
        f"/api/apartments/{apartment.json()['id']}/tenants",
        json={
            "full_name": "Оксана Коваль",
            "phone": None,
            "email": "oksana@example.com",
            "contract_start": "2025-01-01",
            "contract_end": None,
            "notes": None,
        },
    )
    assert tenant.status_code == 201
    return tenant.json()


async def test_upload_download_and_delete_attachments(tmp_path) -> None:
    lifespan, client, settings = await _create_client(tmp_path)
    try:
        tenant = await _create_tenant(client)
        upload = await client.post(
            f"/api/tenants/{tenant['id']}/attachments",
            files=[
                ("files", ("contract.jpg", b"jpeg-content", "image/jpeg")),
                ("files", ("contract.pdf", b"pdf-content", "application/pdf")),
            ],
        )
        assert upload.status_code == 201
        attachments = upload.json()
        assert [item["original_name"] for item in attachments] == [
            "contract.jpg",
            "contract.pdf",
        ]
        assert [item["size_bytes"] for item in attachments] == [12, 11]
        stored_files = sorted((settings.uploads_dir / "tenants" / str(tenant["id"])).iterdir())
        assert {path.suffix for path in stored_files} == {".jpg", ".pdf"}

        downloaded = await client.get(f"/api/attachments/{attachments[0]['id']}")
        assert downloaded.status_code == 200
        assert downloaded.content == b"jpeg-content"
        assert downloaded.headers["content-type"] == "image/jpeg"
        assert "inline" in downloaded.headers["content-disposition"]

        client.cookies.clear()
        assert (
            await client.get(f"/api/attachments/{attachments[0]['id']}")
        ).status_code == 401
        login = await client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "password"},
        )
        assert login.status_code == 200

        deleted = await client.delete(f"/api/attachments/{attachments[0]['id']}")
        assert deleted.status_code == 204
        assert (await client.get(f"/api/attachments/{attachments[0]['id']}")).status_code == 404
        assert not any(path.suffix == ".jpg" for path in stored_files if path.exists())
    finally:
        await _close_client(lifespan, client)


async def test_upload_rejects_unsupported_and_oversized_files(tmp_path) -> None:
    lifespan, client, _settings = await _create_client(tmp_path)
    try:
        tenant = await _create_tenant(client)
        endpoint = f"/api/tenants/{tenant['id']}/attachments"

        unsupported = await client.post(
            endpoint,
            files={"files": ("contract.txt", b"text", "text/plain")},
        )
        assert unsupported.status_code == 415

        mismatched_extension = await client.post(
            endpoint,
            files={"files": ("contract.pdf", b"image", "image/jpeg")},
        )
        assert mismatched_extension.status_code == 415

        oversized = await client.post(
            endpoint,
            files={
                "files": (
                    "contract.pdf",
                    b"x" * (10 * 1024 * 1024 + 1),
                    "application/pdf",
                )
            },
        )
        assert oversized.status_code == 413
    finally:
        await _close_client(lifespan, client)


async def test_tenant_delete_removes_attachment_files(tmp_path) -> None:
    lifespan, client, settings = await _create_client(tmp_path)
    try:
        tenant = await _create_tenant(client)
        upload = await client.post(
            f"/api/tenants/{tenant['id']}/attachments",
            files={"files": ("contract.pdf", b"pdf-content", "application/pdf")},
        )
        assert upload.status_code == 201
        tenant_dir = settings.uploads_dir / "tenants" / str(tenant["id"])
        assert tenant_dir.is_dir()

        archived = await client.delete(f"/api/apartments/{tenant['apartment_id']}")
        assert archived.status_code == 204
        assert tenant_dir.is_dir()

        deleted = await client.delete(f"/api/tenants/{tenant['id']}")
        assert deleted.status_code == 204
        assert not tenant_dir.exists()
    finally:
        await _close_client(lifespan, client)


def test_attachment_path_rejects_traversal(tmp_path) -> None:
    uploads_dir = tmp_path / "uploads"
    try:
        attachment_path(uploads_dir, 1, "../../outside.pdf")
    except ValueError as error:
        assert "escapes uploads directory" in str(error)
    else:
        raise AssertionError("Path traversal was accepted")
