from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import get_db, require_auth
from app.schemas import UpcomingBillingResponse
from app.services.billing_schedule import compute_billing_schedule

router = APIRouter(
    prefix="/api/billing",
    tags=["billing"],
    dependencies=[Depends(require_auth)],
)

KYIV_TIMEZONE = ZoneInfo("Europe/Kyiv")
UPCOMING_HORIZON_DAYS = 30


def _today() -> date:
    return datetime.now(KYIV_TIMEZONE).date()


@router.get("/upcoming", response_model=list[UpcomingBillingResponse])
def upcoming_billing(session: Session = Depends(get_db)) -> list[dict[str, object]]:
    today = _today()
    horizon_end = today + timedelta(days=UPCOMING_HORIZON_DAYS)
    entries = (
        entry
        for entry in compute_billing_schedule(session, today)
        if entry.next_billing_date <= horizon_end
    )
    return [
        {
            "apartment_id": entry.apartment.id,
            "apartment_name": entry.apartment.name,
            "tenant_id": entry.tenant.id,
            "tenant_name": entry.tenant.full_name,
            "next_billing_date": entry.next_billing_date,
            "period": entry.period,
            "invoice_status": entry.invoice_status,
        }
        for entry in sorted(
            entries,
            key=lambda entry: (
                entry.next_billing_date,
                entry.apartment.name,
                entry.apartment.id,
            ),
        )
    ]
