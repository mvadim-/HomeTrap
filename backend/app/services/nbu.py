from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation

import httpx
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import ExchangeRate

NBU_EXCHANGE_URL = "https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange"
DEFAULT_CURRENCY = "USD"


class NbuRateUnavailable(RuntimeError):
    """Raised when the NBU response does not contain a usable exchange rate."""


@dataclass(frozen=True)
class RateResult:
    requested_date: date
    rate_date: date
    currency: str
    rate: Decimal
    is_fallback: bool


class NbuClient:
    def __init__(
        self,
        http_client: httpx.Client | None = None,
        timeout: float = 10.0,
    ) -> None:
        self._http_client = http_client
        self._timeout = timeout

    def fetch_rate(self, target_date: date, currency: str = DEFAULT_CURRENCY) -> Decimal:
        params = {
            "valcode": currency,
            "date": target_date.strftime("%Y%m%d"),
            "json": "",
        }
        try:
            if self._http_client is not None:
                response = self._http_client.get(NBU_EXCHANGE_URL, params=params)
            else:
                response = httpx.get(
                    NBU_EXCHANGE_URL,
                    params=params,
                    timeout=self._timeout,
                )
            response.raise_for_status()
            payload = response.json()
            rate = Decimal(str(payload[0]["rate"]))
        except (
            httpx.HTTPError,
            InvalidOperation,
            KeyError,
            TypeError,
            ValueError,
            IndexError,
        ) as error:
            raise NbuRateUnavailable(
                f"NBU rate is unavailable for {currency} on {target_date.isoformat()}"
            ) from error
        if rate <= 0:
            raise NbuRateUnavailable(
                f"NBU returned an invalid rate for {currency} on {target_date.isoformat()}"
            )
        return rate


def get_stored_rate(
    session: Session,
    target_date: date,
    currency: str = DEFAULT_CURRENCY,
) -> Decimal | None:
    """Return the latest stored rate with date <= target_date, or None.

    Read-only: never fetches from the network and never writes to the DB.
    Suitable for aggregations (e.g. P&L) that must not mutate state.
    """
    stored = session.scalar(
        select(ExchangeRate)
        .where(
            ExchangeRate.currency == currency,
            ExchangeRate.date <= target_date,
        )
        .order_by(ExchangeRate.date.desc())
        .limit(1)
    )
    return stored.rate if stored is not None else None


def get_rate(
    session: Session,
    target_date: date,
    client: NbuClient | None = None,
    currency: str = DEFAULT_CURRENCY,
) -> RateResult:
    cached = session.scalar(
        select(ExchangeRate).where(
            ExchangeRate.date == target_date,
            ExchangeRate.currency == currency,
        )
    )
    if cached is not None:
        return RateResult(
            requested_date=target_date,
            rate_date=cached.date,
            currency=cached.currency,
            rate=cached.rate,
            is_fallback=False,
        )

    try:
        rate = (client or NbuClient()).fetch_rate(target_date, currency)
    except NbuRateUnavailable:
        fallback = session.scalar(
            select(ExchangeRate)
            .where(
                ExchangeRate.currency == currency,
                ExchangeRate.date <= target_date,
            )
            .order_by(ExchangeRate.date.desc())
            .limit(1)
        )
        if fallback is None:
            raise
        return RateResult(
            requested_date=target_date,
            rate_date=fallback.date,
            currency=fallback.currency,
            rate=fallback.rate,
            is_fallback=True,
        )

    stored = ExchangeRate(date=target_date, currency=currency, rate=rate)
    session.add(stored)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        stored = session.scalar(
            select(ExchangeRate).where(
                ExchangeRate.date == target_date,
                ExchangeRate.currency == currency,
            )
        )
        if stored is None:
            raise
    return RateResult(
        requested_date=target_date,
        rate_date=target_date,
        currency=currency,
        rate=stored.rate,
        is_fallback=False,
    )
