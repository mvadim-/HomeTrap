from __future__ import annotations

import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session, sessionmaker

from app.services.nbu import NbuRateUnavailable, get_rate

KYIV_TIMEZONE = ZoneInfo("Europe/Kyiv")
DAILY_RATE_JOB_ID = "update-daily-nbu-rate"

logger = logging.getLogger(__name__)


def update_daily_rate(session_factory: sessionmaker[Session]) -> None:
    today = datetime.now(KYIV_TIMEZONE).date()
    with session_factory() as session:
        try:
            get_rate(session, today)
        except NbuRateUnavailable:
            logger.warning("NBU rate update failed for %s", today, exc_info=True)


def start_scheduler(
    session_factory: sessionmaker[Session],
) -> BackgroundScheduler:
    scheduler = BackgroundScheduler(timezone=KYIV_TIMEZONE)
    scheduler.add_job(
        update_daily_rate,
        trigger="cron",
        hour=6,
        minute=0,
        id=DAILY_RATE_JOB_ID,
        args=[session_factory],
        replace_existing=True,
    )
    scheduler.start()
    return scheduler
