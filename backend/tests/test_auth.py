import bcrypt
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.auth import LOGIN_ATTEMPT_LIMIT, SESSION_COOKIE_NAME, _decode_session
from app.config import Settings, validate_production_settings
from app.db import create_database_engine, create_session_factory
from app.main import create_app
from app.models import User


async def _create_client(
    tmp_path,
    *,
    trusted_proxy_cidrs: str = "",
    client_address: tuple[str, int] = ("127.0.0.1", 123),
):
    settings = Settings(
        database_path=tmp_path / "auth.db",
        secret_key="test-session-secret",
        debug=True,
        scheduler_enabled=False,
        admin_username="admin",
        admin_password="correct-password",
        trusted_proxy_cidrs=trusted_proxy_cidrs,
    )
    application = create_app(settings)
    lifespan = application.router.lifespan_context(application)
    await lifespan.__aenter__()
    client = AsyncClient(
        transport=ASGITransport(app=application, client=client_address),
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


async def test_login_rate_limit_uses_forwarded_ip_only_from_trusted_proxy(tmp_path) -> None:
    _, lifespan, client = await _create_client(
        tmp_path,
        trusted_proxy_cidrs="172.18.0.1/32",
        client_address=("172.18.0.1", 123),
    )
    try:
        for _ in range(LOGIN_ATTEMPT_LIMIT):
            response = await client.post(
                "/api/auth/login",
                headers={"X-Forwarded-For": "198.51.100.10"},
                json={"username": "admin", "password": "wrong-password"},
            )
            assert response.status_code == 401

        other_client = await client.post(
            "/api/auth/login",
            headers={"X-Forwarded-For": "198.51.100.11"},
            json={"username": "admin", "password": "correct-password"},
        )
        assert other_client.status_code == 200
    finally:
        await client.aclose()
        await lifespan.__aexit__(None, None, None)

    _, lifespan, client = await _create_client(
        tmp_path,
        trusted_proxy_cidrs="172.18.0.1/32",
        client_address=("192.0.2.20", 123),
    )
    try:
        for attempt in range(LOGIN_ATTEMPT_LIMIT):
            response = await client.post(
                "/api/auth/login",
                headers={"X-Forwarded-For": f"198.51.100.{attempt}"},
                json={"username": "admin", "password": "wrong-password"},
            )
            assert response.status_code == 401
        blocked = await client.post(
            "/api/auth/login",
            headers={"X-Forwarded-For": "198.51.100.200"},
            json={"username": "admin", "password": "correct-password"},
        )
        assert blocked.status_code == 429
    finally:
        await client.aclose()
        await lifespan.__aexit__(None, None, None)


def test_production_rejects_default_or_placeholder_session_secret(monkeypatch) -> None:
    with pytest.raises(RuntimeError, match="HOMETRAP_SECRET_KEY"):
        validate_production_settings(Settings(debug=False))
    with pytest.raises(RuntimeError, match="HOMETRAP_SECRET_KEY"):
        validate_production_settings(
            Settings(debug=False, secret_key="change-me-to-a-long-random-value")
        )
    monkeypatch.setenv("ADMIN_PASSWORD", "a-unique-strong-admin-password")
    validate_production_settings(
        Settings(debug=False, secret_key="a-unique-production-secret-with-32-characters")
    )
    monkeypatch.setenv("ADMIN_PASSWORD", "change-me-to-a-strong-password")
    with pytest.raises(RuntimeError, match="ADMIN_PASSWORD"):
        validate_production_settings(
            Settings(
                debug=False,
                secret_key="a-unique-production-secret-with-32-characters",
                admin_username="admin",
            )
        )
    with pytest.raises(RuntimeError, match="HOMETRAP_TRUSTED_PROXY_CIDRS"):
        validate_production_settings(
            Settings(debug=True, trusted_proxy_cidrs="not-a-network")
        )


def test_malformed_base64_session_is_invalid() -> None:
    assert _decode_session("%%%%.signature", "test-secret") is None
