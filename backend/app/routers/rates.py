from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_db, require_auth
from app.schemas import ExchangeRateResponse
from app.services.nbu import NbuRateUnavailable, get_rate

router = APIRouter(
    prefix="/api/rates",
    tags=["rates"],
    dependencies=[Depends(require_auth)],
)


@router.get("/current", response_model=ExchangeRateResponse)
def current_rate(session: Session = Depends(get_db)) -> dict:
    today = datetime.now(ZoneInfo("Europe/Kyiv")).date()
    try:
        result = get_rate(session, today)
    except NbuRateUnavailable as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="NBU exchange rate is unavailable",
        ) from error
    return {
        "requested_date": result.requested_date,
        "rate_date": result.rate_date,
        "currency": result.currency,
        "rate": result.rate,
        "is_fallback": result.is_fallback,
    }
