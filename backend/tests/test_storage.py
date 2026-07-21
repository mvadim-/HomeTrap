from sqlalchemy import Engine, func, select
from sqlalchemy.orm import Session
import pytest

from app.models import Apartment
from app.services.storage import write_session


def test_write_session_commits_and_rolls_back_owned_sessions(db_engine: Engine) -> None:
    def session_factory() -> Session:
        return Session(db_engine)

    with write_session(session_factory) as session:
        session.add(
            Apartment(
                name="Координована",
                address="Київ",
                rent_amount=500,
                rent_currency="USD",
            )
        )

    with pytest.raises(RuntimeError, match="injected failure"):
        with write_session(session_factory) as session:
            session.add(
                Apartment(
                    name="Відкочена",
                    address="Львів",
                    rent_amount=400,
                    rent_currency="USD",
                )
            )
            raise RuntimeError("injected failure")

    with Session(db_engine) as session:
        assert session.scalar(select(func.count()).select_from(Apartment)) == 1
        assert session.scalar(select(Apartment.name)) == "Координована"
