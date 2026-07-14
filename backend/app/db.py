from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import TYPE_CHECKING

from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, create_engine, event, select
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import Settings

if TYPE_CHECKING:
    from app.models import Tariff


class Base(DeclarativeBase):
    pass


def database_url(database_path: Path) -> str:
    return f"sqlite:///{database_path}"


def create_database_engine(database_path: Path) -> Engine:
    engine = create_engine(
        database_url(database_path),
        connect_args={"check_same_thread": False},
    )
    @event.listens_for(engine, "connect")
    def enable_sqlite_foreign_keys(dbapi_connection: object, _: object) -> None:
        cursor = dbapi_connection.cursor()  # type: ignore[attr-defined]
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    return engine


def create_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False)


def run_migrations(settings: Settings) -> None:
    settings.database_path.parent.mkdir(parents=True, exist_ok=True)
    backend_dir = Path(__file__).resolve().parents[1]
    config = Config(backend_dir / "alembic.ini")
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    config.set_main_option("sqlalchemy.url", database_url(settings.database_path))
    command.upgrade(config, "head")


def get_tariff_for_period(
    session: Session,
    service_id: int,
    period: date,
) -> Tariff | None:
    from app.models import Tariff

    return session.scalar(
        select(Tariff)
        .where(Tariff.service_id == service_id, Tariff.valid_from <= period)
        .order_by(Tariff.valid_from.desc())
        .limit(1)
    )
