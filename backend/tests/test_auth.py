import bcrypt
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.auth import LOGIN_ATTEMPT_LIMIT, SESSION_COOKIE_NAME
from app.config import Settings
from app.db import create_database_engine, create_session_factory
from app.main import create_app
from app.models import User


async def _create_client(tmp_path):
    settings = Settings(
        database_path=tmp_path / "auth.db",
        secret_key="test-session-secret",
        debug=True,
        admin_username="admin",
        admin_password="correct-password",
    )
    application = create_app(settings)
    lifespan = application.router.lifespan_context(application)
    await lifespan.__aenter__()
    client = AsyncClient(
        transport=ASGITransport(app=application),
        base_url="http://test",
    )
    return application, lifespan, client


async def test_startup_creates_admin_with_bcrypt_hash(tmp_path) -> None:
    application, lifespan, client = await _create_client(tmp_path)
    try:
        engine = create_database_engine(application.state.settings.database_path)
        with create_session_factory(engine)() as session:
            user = session.scalar(select(User).where(User.username == "admin"))
            assert user is not None
            assert user.password_hash != "correct-password"
            assert bcrypt.checkpw(b"correct-password", user.password_hash.encode())
        engine.dispose()
    finally:
        await client.aclose()
        await lifespan.__aexit__(None, None, None)


async def test_successful_login_me_and_logout(tmp_path) -> None:
    _, lifespan, client = await _create_client(tmp_path)
    try:
        response = await client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "correct-password"},
        )

        assert response.status_code == 200
        assert response.json()["username"] == "admin"
        cookie_header = response.headers["set-cookie"]
        assert f"{SESSION_COOKIE_NAME}=" in cookie_header
        assert "HttpOnly" in cookie_header

        me_response = await client.get("/api/auth/me")
        assert me_response.status_code == 200
        assert me_response.json()["username"] == "admin"

        logout_response = await client.post("/api/auth/logout")
        assert logout_response.status_code == 204
        assert (await client.get("/api/auth/me")).status_code == 401
    finally:
        await client.aclose()
        await lifespan.__aexit__(None, None, None)


async def test_login_with_wrong_password_returns_401(tmp_path) -> None:
    _, lifespan, client = await _create_client(tmp_path)
    try:
        response = await client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "wrong-password"},
        )

        assert response.status_code == 401
        assert SESSION_COOKIE_NAME not in response.cookies
    finally:
        await client.aclose()
        await lifespan.__aexit__(None, None, None)


async def test_me_without_cookie_returns_401(tmp_path) -> None:
    _, lifespan, client = await _create_client(tmp_path)
    try:
        response = await client.get("/api/auth/me")

        assert response.status_code == 401
    finally:
        await client.aclose()
        await lifespan.__aexit__(None, None, None)


async def test_login_is_rate_limited_after_five_failures(tmp_path) -> None:
    _, lifespan, client = await _create_client(tmp_path)
    try:
        for _ in range(LOGIN_ATTEMPT_LIMIT):
            response = await client.post(
                "/api/auth/login",
                json={"username": "admin", "password": "wrong-password"},
            )
            assert response.status_code == 401

        blocked_response = await client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "correct-password"},
        )

        assert blocked_response.status_code == 429
    finally:
        await client.aclose()
        await lifespan.__aexit__(None, None, None)
