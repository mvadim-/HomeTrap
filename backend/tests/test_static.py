from pathlib import Path

from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.main import create_app


async def test_spa_routes_fall_back_to_frontend_index(tmp_path: Path) -> None:
    static_dir = tmp_path / "static"
    static_dir.mkdir()
    (static_dir / "index.html").write_text("<main>HomeTrap frontend</main>")
    settings = Settings(
        database_path=tmp_path / "test.db",
        static_dir=static_dir,
        admin_username="admin",
        admin_password="password",
    )
    app = create_app(settings)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/invoices")
        missing_api = await client.get("/api/not-found")

    assert response.status_code == 200
    assert response.text == "<main>HomeTrap frontend</main>"
    assert missing_api.status_code == 404
    assert missing_api.headers["content-type"].startswith("application/json")


async def test_static_file_is_served_without_spa_fallback(tmp_path: Path) -> None:
    static_dir = tmp_path / "static"
    static_dir.mkdir()
    (static_dir / "index.html").write_text("index")
    (static_dir / "manifest.json").write_text('{"name":"HomeTrap"}')
    settings = Settings(
        database_path=tmp_path / "test.db",
        static_dir=static_dir,
        admin_username="admin",
        admin_password="password",
    )
    app = create_app(settings)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/manifest.json")

    assert response.status_code == 200
    assert response.json() == {"name": "HomeTrap"}
