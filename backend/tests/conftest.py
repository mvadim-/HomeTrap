from collections.abc import Iterator

import pytest
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from app import models  # noqa: F401
from app.db import Base, create_database_engine, create_session_factory


@pytest.fixture
def db_engine(tmp_path) -> Iterator[Engine]:
    engine = create_database_engine(tmp_path / "test.db")
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def db_session(db_engine: Engine) -> Iterator[Session]:
    session = create_session_factory(db_engine)()
    yield session
    session.rollback()
    session.close()
