from collections.abc import Iterator

import pytest
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from app.config import Settings
from app.db import create_database_engine, create_session_factory, run_migrations


@pytest.fixture
def db_engine(tmp_path) -> Iterator[Engine]:
    database_path = tmp_path / "test.db"
    run_migrations(Settings(database_path=database_path, debug=True))
    engine = create_database_engine(database_path)
    yield engine
    engine.dispose()


@pytest.fixture
def db_session(db_engine: Engine) -> Iterator[Session]:
    session = create_session_factory(db_engine)()
    yield session
    session.rollback()
    session.close()
