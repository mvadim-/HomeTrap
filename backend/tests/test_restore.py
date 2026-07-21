from datetime import UTC, date, datetime
from decimal import Decimal
from hashlib import sha256
from pathlib import Path
import sqlite3

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import Settings
from app.db import create_database_engine, create_session_factory, run_migrations
from app.models import (
    Apartment,
    ExchangeRate,
    Invoice,
    InvoiceLine,
    PushSubscription,
    Service,
    Setting,
    Tariff,
    Tenant,
    TenantAttachment,
    User,
)
from app.services.restore import (
    RestoreValidationError,
    import_backup,
    validate_manifest,
)
from app.services.storage import attachment_path


REVISION = "20260718_05"


def _create_source(tmp_path: Path) -> tuple[Path, Path, dict[str, int]]:
    database_path = tmp_path / "source.db"
    uploads_dir = tmp_path / "source-uploads"
    run_migrations(Settings(database_path=database_path, debug=True))
    engine = create_database_engine(database_path)
    session = create_session_factory(engine)()
    try:
        apartment = Apartment(
            name="Квартира 1",
            address="Київ, Хрещатик, 1",
            rent_amount=Decimal("500.00"),
            rent_currency="USD",
            notes="Джерельна примітка",
        )
        service = Service(
            apartment=apartment,
            name="Електроенергія",
            kind="metered",
            unit="кВт·год",
            provider_account="account-1",
            tariffs=[Tariff(value=Decimal("4.32000"), valid_from=date(2026, 1, 1))],
        )
        tenant = Tenant(
            apartment=apartment,
            full_name="Оксана Коваль",
            phone="+380501234567",
            email="oksana@example.com",
            contract_start=date(2026, 1, 1),
            billing_day=15,
            attachments=[
                TenantAttachment(
                    original_name="contract.pdf",
                    stored_name="contract.pdf",
                    content_type="application/pdf",
                    size_bytes=16,
                    uploaded_at=datetime(2026, 1, 1, tzinfo=UTC),
                )
            ],
        )
        invoice = Invoice(
            apartment=apartment,
            period=date(2026, 6, 1),
            status="issued",
            issued_at=datetime(2026, 7, 15, tzinfo=UTC),
            exchange_rate=Decimal("41.500000"),
            rent_amount_usd=Decimal("500.00"),
            rent_amount_uah=Decimal("20750.00"),
            utilities_total=Decimal("432.00"),
            grand_total=Decimal("21182.00"),
        )
        line = InvoiceLine(
            invoice=invoice,
            service=service,
            service_name=service.name,
            service_kind=service.kind,
            prev_reading=Decimal("100.000"),
            curr_reading=Decimal("200.000"),
            consumed=Decimal("100.000"),
            tariff_value=Decimal("4.32000"),
            amount=Decimal("432.00"),
        )
        session.add_all(
            [
                tenant,
                line,
                ExchangeRate(
                    date=date(2026, 6, 1),
                    currency="USD",
                    rate=Decimal("41.500000"),
                ),
                User(username="backup-admin", password_hash="secret-hash"),
                Setting(key="private", value={"token": "secret"}),
                PushSubscription(
                    endpoint="https://push.example.test/device",
                    p256dh="public-key",
                    auth="auth-secret",
                ),
            ]
        )
        session.commit()
        source_ids = {
            "apartment": apartment.id,
            "service": service.id,
            "tenant": tenant.id,
            "invoice": invoice.id,
        }
    finally:
        session.close()
        engine.dispose()

    source_attachment = attachment_path(
        uploads_dir, source_ids["tenant"], "contract.pdf"
    )
    source_attachment.parent.mkdir(parents=True)
    source_attachment.write_bytes(b"contract-content")
    return database_path, uploads_dir, source_ids


def _manifest(database_path: Path, **overrides: object) -> dict[str, object]:
    manifest: dict[str, object] = {
        "app_version": "0.1.0",
        "alembic_revision": REVISION,
        "created_at": "2026-07-21T10:00:00+00:00",
        "db_sha256": sha256(database_path.read_bytes()).hexdigest(),
    }
    manifest.update(overrides)
    return manifest


def test_validate_manifest_accepts_matching_snapshot(tmp_path: Path) -> None:
    database_path, _, _ = _create_source(tmp_path)

    validate_manifest(_manifest(database_path), REVISION, database_path)


@pytest.mark.parametrize(
    ("manifest_change", "expected_message"),
    [
        ({"alembic_revision": "old"}, "incompatible"),
        ({"db_sha256": "0" * 64}, "checksum"),
        ({"created_at": "not-a-date"}, "created_at"),
        ({"app_version": None}, "app_version"),
    ],
)
def test_validate_manifest_rejects_invalid_metadata(
    tmp_path: Path,
    manifest_change: dict[str, object],
    expected_message: str,
) -> None:
    database_path, _, _ = _create_source(tmp_path)

    with pytest.raises(RestoreValidationError, match=expected_message):
        validate_manifest(
            _manifest(database_path, **manifest_change), REVISION, database_path
        )


def test_validate_manifest_rejects_database_revision_mismatch(tmp_path: Path) -> None:
    database_path, _, _ = _create_source(tmp_path)
    with sqlite3.connect(database_path) as connection:
        connection.execute("UPDATE alembic_version SET version_num = 'forged'")

    manifest = _manifest(database_path)

    with pytest.raises(RestoreValidationError, match="does not match manifest"):
        validate_manifest(manifest, REVISION, database_path)


def test_import_round_trip_into_empty_database(
    db_session: Session,
    tmp_path: Path,
) -> None:
    database_path, backup_uploads, _ = _create_source(tmp_path)
    uploads_dir = tmp_path / "live-uploads"

    summary = import_backup(database_path, backup_uploads, db_session, uploads_dir)

    assert summary.added == {
        "apartments": 1,
        "services": 1,
        "tariffs": 1,
        "tenants": 1,
        "tenant_attachments": 1,
        "invoices": 1,
        "invoice_lines": 1,
        "exchange_rates": 1,
    }
    assert set(summary.skipped.values()) == {0}
    apartment = db_session.scalar(select(Apartment))
    service = db_session.scalar(select(Service))
    tenant = db_session.scalar(select(Tenant))
    invoice = db_session.scalar(select(Invoice))
    line = db_session.scalar(select(InvoiceLine))
    attachment = db_session.scalar(select(TenantAttachment))
    assert apartment is not None
    assert service is not None and service.apartment_id == apartment.id
    assert tenant is not None and tenant.apartment_id == apartment.id
    assert invoice is not None and invoice.apartment_id == apartment.id
    assert line is not None
    assert line.invoice_id == invoice.id
    assert line.service_id == service.id
    assert attachment is not None and attachment.tenant_id == tenant.id
    assert attachment_path(
        uploads_dir, tenant.id, attachment.stored_name
    ).read_bytes() == (b"contract-content")
    assert db_session.scalar(select(func.count()).select_from(User)) == 0
    assert db_session.scalar(select(func.count()).select_from(Setting)) == 0
    assert db_session.scalar(select(func.count()).select_from(PushSubscription)) == 0


def test_import_keeps_existing_values_and_is_idempotent(
    db_session: Session,
    tmp_path: Path,
) -> None:
    database_path, backup_uploads, _ = _create_source(tmp_path)
    uploads_dir = tmp_path / "live-uploads"
    apartment = Apartment(
        name="Квартира 1",
        address="Київ, Хрещатик, 1",
        rent_amount=Decimal("999.00"),
        rent_currency="EUR",
        notes="Локальне значення",
    )
    service = Service(
        apartment=apartment,
        name="Електроенергія",
        kind="fixed",
        unit=None,
        provider_account="local-account",
    )
    db_session.add_all(
        [
            service,
            ExchangeRate(
                date=date(2026, 6, 1), currency="USD", rate=Decimal("99.000000")
            ),
        ]
    )
    db_session.commit()

    first = import_backup(database_path, backup_uploads, db_session, uploads_dir)
    second = import_backup(database_path, backup_uploads, db_session, uploads_dir)

    db_session.refresh(apartment)
    db_session.refresh(service)
    assert apartment.rent_amount == Decimal("999.00")
    assert apartment.notes == "Локальне значення"
    assert service.kind == "fixed"
    assert first.skipped["apartments"] == 1
    assert first.skipped["services"] == 1
    assert first.added["tariffs"] == 1
    assert first.skipped["exchange_rates"] == 1
    assert set(second.added.values()) == {0}
    assert second.skipped == {
        "apartments": 1,
        "services": 1,
        "tariffs": 1,
        "tenants": 1,
        "tenant_attachments": 1,
        "invoices": 1,
        "invoice_lines": 1,
        "exchange_rates": 1,
    }


def test_active_tenant_conflict_is_skipped_and_reported(
    db_session: Session,
    tmp_path: Path,
) -> None:
    database_path, backup_uploads, _ = _create_source(tmp_path)
    apartment = Apartment(
        name="Квартира 1",
        address="Київ, Хрещатик, 1",
        rent_amount=Decimal("500.00"),
        rent_currency="USD",
    )
    existing_tenant = Tenant(
        apartment=apartment,
        full_name="Інший орендар",
        contract_start=date(2025, 1, 1),
    )
    db_session.add(existing_tenant)
    db_session.commit()

    summary = import_backup(
        database_path, backup_uploads, db_session, tmp_path / "live-uploads"
    )

    assert summary.skipped["tenants"] == 1
    assert summary.skipped["tenant_attachments"] == 1
    assert db_session.scalars(select(Tenant)).all() == [existing_tenant]


def test_attachment_is_added_to_matching_existing_tenant(
    db_session: Session,
    tmp_path: Path,
) -> None:
    database_path, backup_uploads, _ = _create_source(tmp_path)
    apartment = Apartment(
        name="Квартира 1",
        address="Київ, Хрещатик, 1",
        rent_amount=Decimal("500.00"),
        rent_currency="USD",
    )
    tenant = Tenant(
        apartment=apartment,
        full_name="Оксана Коваль",
        contract_start=date(2026, 1, 1),
    )
    db_session.add(tenant)
    db_session.commit()
    uploads_dir = tmp_path / "live-uploads"

    summary = import_backup(database_path, backup_uploads, db_session, uploads_dir)

    attachment = db_session.scalar(select(TenantAttachment))
    assert summary.skipped["tenants"] == 1
    assert summary.added["tenant_attachments"] == 1
    assert attachment is not None and attachment.tenant_id == tenant.id
    assert attachment_path(uploads_dir, tenant.id, "contract.pdf").is_file()


def test_import_error_rolls_back_database_and_removes_copied_files(
    db_session: Session,
    tmp_path: Path,
) -> None:
    database_path, backup_uploads, source_ids = _create_source(tmp_path)
    source_engine = create_database_engine(database_path)
    source_session = create_session_factory(source_engine)()
    try:
        source_session.add(
            TenantAttachment(
                tenant_id=source_ids["tenant"],
                original_name="missing.pdf",
                stored_name="missing.pdf",
                content_type="application/pdf",
                size_bytes=10,
                uploaded_at=datetime(2026, 1, 2, tzinfo=UTC),
            )
        )
        source_session.commit()
    finally:
        source_session.close()
        source_engine.dispose()
    uploads_dir = tmp_path / "live-uploads"

    with pytest.raises(FileNotFoundError, match="missing.pdf"):
        import_backup(database_path, backup_uploads, db_session, uploads_dir)

    assert db_session.scalar(select(func.count()).select_from(Apartment)) == 0
    assert db_session.scalar(select(func.count()).select_from(TenantAttachment)) == 0
    assert not uploads_dir.exists() or not any(uploads_dir.rglob("*"))
