from __future__ import annotations

from datetime import date
from decimal import Decimal

import httpx
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from app.config import Settings
from app.db import create_session_factory
from app.main import create_app
from app.models import ExchangeRate
from app.services.nbu import NbuClient, NbuRateUnavailable, RateResult, get_rate
from app.services.scheduler import DAILY_RATE_JOB_ID, start_scheduler


def test_fetches_fresh_rate_and_caches_it(db_session) -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        assert request.url.params["valcode"] == "USD"
        assert request.url.params["date"] == "20260714"
        assert "json" in request.url.params
        return httpx.Response(200, json=[{"cc": "USD", "rate": 41.2345}])

    with httpx.Client(transport=httpx.MockTransport(handler)) as http_client:
        client = NbuClient(http_client)
        first = get_rate(db_session, date(2026, 7, 14), client)
        second = get_rate(db_session, date(2026, 7, 14), client)

    assert first.rate == Decimal("41.234500")
    assert first.rate_date == date(2026, 7, 14)
    assert first.is_fallback is False
    assert second == first
    assert calls == 1
    assert db_session.scalar(select(func.count()).select_from(ExchangeRate)) == 1


def test_unavailable_nbu_falls_back_to_latest_known_rate(db_session) -> None:
    db_session.add_all(
        [
            ExchangeRate(
                date=date(2026, 7, 11),
                currency="USD",
                rate=Decimal("40.100000"),
            ),
            ExchangeRate(
                date=date(2026, 7, 12),
                currency="USD",
                rate=Decimal("40.200000"),
            ),
        ]
    )
    db_session.commit()

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("NBU is unavailable", request=request)

    with httpx.Client(transport=httpx.MockTransport(handler)) as http_client:
        result = get_rate(
            db_session,
            date(2026, 7, 14),
            NbuClient(http_client),
        )

    assert result.rate == Decimal("40.200000")
    assert result.rate_date == date(2026, 7, 12)
    assert result.requested_date == date(2026, 7, 14)
    assert result.is_fallback is True


def test_unavailable_nbu_without_cached_rate_raises(db_session) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, request=request)

    with httpx.Client(transport=httpx.MockTransport(handler)) as http_client:
        with pytest.raises(NbuRateUnavailable):
            get_rate(
                db_session,
                date(2026, 7, 14),
                NbuClient(http_client),
            )


def test_scheduler_uses_kyiv_timezone_and_daily_job(db_engine) -> None:
    scheduler = start_scheduler(create_session_factory(db_engine))
    try:
        job = scheduler.get_job(DAILY_RATE_JOB_ID)
        assert job is not None
        assert str(scheduler.timezone) == "Europe/Kyiv"
        assert str(job.trigger).startswith("cron[")
        assert "hour='6'" in str(job.trigger)
    finally:
        scheduler.shutdown(wait=False)


async def test_current_rate_endpoint_requires_auth_and_serializes_decimal(
    tmp_path,
    monkeypatch,
) -> None:
    settings = Settings(
        database_path=tmp_path / "rates.db",
        secret_key="test-session-secret",
        debug=True,
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
        assert (await client.get("/api/rates/current")).status_code == 401
        login = await client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "password"},
        )
        assert login.status_code == 200

        monkeypatch.setattr(
            "app.routers.rates.get_rate",
            lambda _session, target_date: RateResult(
                requested_date=target_date,
                rate_date=date(2026, 7, 13),
                currency="USD",
                rate=Decimal("41.234500"),
                is_fallback=True,
            ),
        )
        response = await client.get("/api/rates/current")

        assert response.status_code == 200
        assert response.json() == {
            "requested_date": response.json()["requested_date"],
            "rate_date": "2026-07-13",
            "currency": "USD",
            "rate": "41.234500",
            "is_fallback": True,
        }
    finally:
        await client.aclose()
        await lifespan.__aexit__(None, None, None)
