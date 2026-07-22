from datetime import UTC, date, datetime
from decimal import Decimal
from hashlib import sha256
from pathlib import Path
import sqlite3
from threading import Barrier, Thread
from zipfile import ZipFile

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

import app.services.restore as restore_service
import app.services.storage as storage_service
from app.config import Settings
from app.db import create_database_engine, create_session_factory, run_migrations
from app.models import (
    Apartment,
    ExchangeRate,
    Expense,
    Invoice,
    InvoiceLine,
    PushSubscription,
    RestoreAlias,
    Service,
    Setting,
    Tariff,
    Tenant,
    TenantAttachment,
    User,
)
from app.services.backup import build_backup
from app.services.restore import (
    RestoreValidationError,
    import_backup,
    recover_restore_journals,
    validate_manifest,
)
from app.services.storage import attachment_path


def _revision(database_path: Path) -> str:
    with sqlite3.connect(database_path) as connection:
        row = connection.execute("SELECT version_num FROM alembic_version").fetchone()
    assert row is not None
    return str(row[0])


def _create_source(tmp_path: Path) -> tuple[Path, Path, dict[str, object]]:
    tmp_path.mkdir(parents=True, exist_ok=True)
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
        apartment_expense = Expense(
            apartment=apartment,
            date=date(2026, 6, 10),
            category="repair",
            amount=Decimal("1500.00"),
            currency="UAH",
            notes="Ремонт крана",
        )
        general_expense = Expense(
            apartment=None,
            date=date(2026, 6, 20),
            category="tax",
            amount=Decimal("250.00"),
            currency="UAH",
            notes="Загальний податок",
        )
        session.add_all(
            [
                tenant,
                line,
                apartment_expense,
                general_expense,
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
            "apartment_expense": apartment_expense.id,
            "apartment_expense_key": apartment_expense.restore_key,
            "general_expense_key": general_expense.restore_key,
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


def _add_adjustment_source(database_path: Path) -> dict[str, object]:
    engine = create_database_engine(database_path)
    session = create_session_factory(engine)()
    try:
        invoice = session.scalar(select(Invoice))
        assert invoice is not None
        apartment = invoice.apartment
        invoice.adjustments_total = Decimal("-125.00")
        invoice.grand_total = Decimal("21057.00")
        adjustment = InvoiceLine(
            id=47,
            invoice=invoice,
            service_id=None,
            service_name="Компенсація ремонту",
            service_kind="adjustment",
            prev_reading=None,
            curr_reading=None,
            consumed=None,
            tariff_value=Decimal("0.00000"),
            amount=Decimal("-125.00"),
        )
        expense = Expense(
            apartment=apartment,
            invoice_line=adjustment,
            date=invoice.period,
            category="repair",
            amount=Decimal("125.00"),
            currency="UAH",
            notes="Компенсація ремонту",
        )
        session.add(expense)
        session.commit()
        return {
            "line_id": adjustment.id,
            "expense_key": expense.restore_key,
        }
    finally:
        session.close()
        engine.dispose()


def _manifest(database_path: Path, **overrides: object) -> dict[str, object]:
    manifest: dict[str, object] = {
        "app_version": "0.1.0",
        "alembic_revision": _revision(database_path),
        "created_at": "2026-07-21T10:00:00+00:00",
        "db_sha256": sha256(database_path.read_bytes()).hexdigest(),
    }
    manifest.update(overrides)
    return manifest


def test_validate_manifest_accepts_matching_snapshot(tmp_path: Path) -> None:
    database_path, _, _ = _create_source(tmp_path)

    validate_manifest(_manifest(database_path), _revision(database_path), database_path)


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
            _manifest(database_path, **manifest_change),
            _revision(database_path),
            database_path,
        )


def test_validate_manifest_rejects_database_revision_mismatch(tmp_path: Path) -> None:
    database_path, _, _ = _create_source(tmp_path)
    expected_revision = _revision(database_path)
    with sqlite3.connect(database_path) as connection:
        connection.execute("UPDATE alembic_version SET version_num = 'forged'")

    manifest = _manifest(database_path, alembic_revision=expected_revision)

    with pytest.raises(RestoreValidationError, match="does not match manifest"):
        validate_manifest(manifest, expected_revision, database_path)


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
        "expenses": 2,
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


def test_import_round_trips_expenses_with_remapped_apartment(
    db_session: Session,
    tmp_path: Path,
) -> None:
    database_path, backup_uploads, source_ids = _create_source(tmp_path)
    uploads_dir = tmp_path / "live-uploads"

    summary = import_backup(database_path, backup_uploads, db_session, uploads_dir)

    assert summary.added["expenses"] == 2
    assert summary.skipped["expenses"] == 0
    apartment = db_session.scalar(select(Apartment))
    assert apartment is not None
    expenses = db_session.scalars(select(Expense).order_by(Expense.date)).all()
    assert len(expenses) == 2
    apartment_expense = db_session.scalar(
        select(Expense).where(
            Expense.restore_key == source_ids["apartment_expense_key"]
        )
    )
    general_expense = db_session.scalar(
        select(Expense).where(Expense.restore_key == source_ids["general_expense_key"])
    )
    assert apartment_expense is not None
    assert apartment_expense.apartment_id == apartment.id
    assert apartment_expense.category == "repair"
    assert apartment_expense.amount == Decimal("1500.00")
    assert apartment_expense.currency == "UAH"
    assert apartment_expense.notes == "Ремонт крана"
    assert general_expense is not None
    assert general_expense.apartment_id is None
    assert general_expense.category == "tax"
    assert general_expense.amount == Decimal("250.00")


def test_import_expenses_is_idempotent(
    db_session: Session,
    tmp_path: Path,
) -> None:
    database_path, backup_uploads, _ = _create_source(tmp_path)
    uploads_dir = tmp_path / "live-uploads"

    first = import_backup(database_path, backup_uploads, db_session, uploads_dir)
    second = import_backup(database_path, backup_uploads, db_session, uploads_dir)

    assert first.added["expenses"] == 2
    assert second.added["expenses"] == 0
    assert second.skipped["expenses"] == 2
    assert db_session.scalar(select(func.count()).select_from(Expense)) == 2


def test_backup_restore_round_trips_adjustment_and_linked_expense_idempotently(
    db_session: Session,
    tmp_path: Path,
) -> None:
    database_path, backup_uploads, _ = _create_source(tmp_path / "source")
    source_ids = _add_adjustment_source(database_path)
    snapshot_path = tmp_path / "snapshot.db"

    with build_backup(database_path, backup_uploads) as backup_path:
        with ZipFile(backup_path) as archive:
            snapshot_path.write_bytes(archive.read("hometrap.db"))

    first = import_backup(
        snapshot_path,
        backup_uploads,
        db_session,
        tmp_path / "live-uploads",
    )

    invoice = db_session.scalar(select(Invoice))
    adjustment = db_session.scalar(
        select(InvoiceLine).where(InvoiceLine.service_kind == "adjustment")
    )
    expense = db_session.scalar(
        select(Expense).where(Expense.restore_key == source_ids["expense_key"])
    )
    assert first.added["invoice_lines"] == 2
    assert first.added["expenses"] == 3
    assert invoice is not None
    assert invoice.adjustments_total == Decimal("-125.00")
    assert invoice.grand_total == Decimal("21057.00")
    assert adjustment is not None
    assert adjustment.id != source_ids["line_id"]
    assert adjustment.service_id is None
    assert adjustment.service_name == "Компенсація ремонту"
    assert adjustment.amount == Decimal("-125.00")
    assert expense is not None
    assert expense.invoice_line_id == adjustment.id

    second = import_backup(
        snapshot_path,
        backup_uploads,
        db_session,
        tmp_path / "live-uploads",
    )

    assert set(second.added.values()) == {0}
    assert second.skipped["invoice_lines"] == 2
    assert second.skipped["expenses"] == 3
    assert db_session.scalar(
        select(func.count()).select_from(InvoiceLine).where(
            InvoiceLine.service_kind == "adjustment"
        )
    ) == 1
    assert db_session.scalar(
        select(func.count()).select_from(Expense).where(
            Expense.restore_key == source_ids["expense_key"]
        )
    ) == 1


def test_import_unlinks_expense_when_existing_invoice_lines_are_skipped(
    db_session: Session,
    tmp_path: Path,
) -> None:
    database_path, backup_uploads, _ = _create_source(tmp_path / "source")
    source_ids = _add_adjustment_source(database_path)
    apartment = Apartment(
        name="Квартира 1",
        address="Київ, Хрещатик, 1",
        rent_amount=Decimal("500.00"),
        rent_currency="USD",
    )
    existing_invoice = Invoice(
        apartment=apartment,
        period=date(2026, 6, 1),
        status="issued",
        exchange_rate=Decimal("41.500000"),
        rent_amount_usd=Decimal("500.00"),
        rent_amount_uah=Decimal("20750.00"),
        utilities_total=Decimal("0.00"),
        adjustments_total=Decimal("0.00"),
        grand_total=Decimal("20750.00"),
    )
    db_session.add(existing_invoice)
    db_session.commit()

    first = import_backup(
        database_path,
        backup_uploads,
        db_session,
        tmp_path / "live-uploads",
    )

    linked_expense = db_session.scalar(
        select(Expense).where(Expense.restore_key == source_ids["expense_key"])
    )
    assert first.skipped["invoices"] == 1
    assert first.skipped["invoice_lines"] == 2
    assert first.added["expenses"] == 3
    assert linked_expense is not None
    assert linked_expense.invoice_line_id is None

    second = import_backup(
        database_path,
        backup_uploads,
        db_session,
        tmp_path / "live-uploads",
    )

    assert second.added["expenses"] == 0
    assert second.skipped["expenses"] == 3
    assert db_session.scalar(
        select(func.count()).select_from(Expense).where(
            Expense.restore_key == source_ids["expense_key"]
        )
    ) == 1


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
        "expenses": 2,
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


def test_import_commit_error_rolls_back_database_and_removes_copied_files(
    db_session: Session,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_path, backup_uploads, _ = _create_source(tmp_path)
    uploads_dir = tmp_path / "live-uploads"

    def fail_commit() -> None:
        raise RuntimeError("forced commit failure")

    monkeypatch.setattr(db_session, "commit", fail_commit)
    with pytest.raises(RuntimeError, match="forced commit failure"):
        import_backup(database_path, backup_uploads, db_session, uploads_dir)

    assert db_session.scalar(select(func.count()).select_from(Apartment)) == 0
    assert db_session.scalar(select(func.count()).select_from(TenantAttachment)) == 0
    assert not uploads_dir.exists() or not any(uploads_dir.rglob("*"))


def test_import_file_finalization_error_prevents_database_commit(
    db_session: Session,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_path, backup_uploads, _ = _create_source(tmp_path)
    uploads_dir = tmp_path / "live-uploads"

    def fail_finalization(*args, **kwargs) -> None:
        raise OSError("forced finalization failure")

    monkeypatch.setattr(
        restore_service,
        "_finish_restore_journal",
        fail_finalization,
    )
    with pytest.raises(OSError, match="forced finalization failure"):
        import_backup(database_path, backup_uploads, db_session, uploads_dir)

    assert db_session.scalar(select(func.count()).select_from(Apartment)) == 0
    assert db_session.scalar(select(func.count()).select_from(TenantAttachment)) == 0


def test_startup_recovery_removes_files_from_interrupted_uncommitted_restore(
    db_session: Session,
    db_engine,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_path, backup_uploads, _ = _create_source(tmp_path)
    uploads_dir = tmp_path / "live-uploads"

    def interrupt_commit() -> None:
        raise SystemExit("simulated process exit")

    monkeypatch.setattr(db_session, "commit", interrupt_commit)
    with pytest.raises(SystemExit, match="simulated process exit"):
        import_backup(database_path, backup_uploads, db_session, uploads_dir)
    db_session.rollback()
    monkeypatch.undo()

    targets = list((uploads_dir / "tenants").rglob("contract.pdf"))
    assert len(targets) == 1
    assert (uploads_dir / ".restore-journal").is_dir()

    recover_restore_journals(uploads_dir, create_session_factory(db_engine))

    assert not targets[0].exists()
    assert not (uploads_dir / ".restore-journal").exists()
    assert db_session.scalar(select(func.count()).select_from(TenantAttachment)) == 0


def test_import_rejects_dangling_source_restore_alias(
    db_session: Session,
    tmp_path: Path,
) -> None:
    database_path, backup_uploads, _ = _create_source(tmp_path)
    source_engine = create_database_engine(database_path)
    with Session(source_engine) as source_session:
        source_session.add(
            RestoreAlias(
                entity_type="service",
                restore_key="a" * 32,
                target_restore_key="f" * 32,
            )
        )
        source_session.commit()
    source_engine.dispose()

    with pytest.raises(RestoreValidationError, match="dangling restore alias"):
        import_backup(database_path, backup_uploads, db_session, tmp_path / "live")

    assert db_session.scalar(select(func.count()).select_from(Service)) == 0


def test_import_restores_file_for_existing_attachment_row(
    db_session: Session,
    tmp_path: Path,
) -> None:
    database_path, backup_uploads, _ = _create_source(tmp_path)
    uploads_dir = tmp_path / "live-uploads"
    import_backup(database_path, backup_uploads, db_session, uploads_dir)
    tenant = db_session.scalar(select(Tenant))
    attachment = db_session.scalar(select(TenantAttachment))
    assert tenant is not None and attachment is not None
    target = attachment_path(uploads_dir, tenant.id, attachment.stored_name)
    target.unlink()

    summary = import_backup(database_path, backup_uploads, db_session, uploads_dir)

    assert summary.skipped["tenant_attachments"] == 1
    assert target.read_bytes() == b"contract-content"


def test_import_rejects_unsafe_attachment_metadata(
    db_session: Session,
    tmp_path: Path,
) -> None:
    database_path, backup_uploads, source_ids = _create_source(tmp_path)
    source_engine = create_database_engine(database_path)
    with Session(source_engine) as source_session:
        attachment = source_session.scalar(select(TenantAttachment))
        assert attachment is not None
        attachment.original_name = "payload.html"
        attachment.stored_name = "payload.html"
        attachment.content_type = "text/html"
        attachment.size_bytes = 7
        source_session.commit()
    source_engine.dispose()
    malicious_path = attachment_path(
        backup_uploads, source_ids["tenant"], "payload.html"
    )
    malicious_path.parent.mkdir(parents=True, exist_ok=True)
    malicious_path.write_bytes(b"<script")

    with pytest.raises(RestoreValidationError, match="metadata is invalid"):
        import_backup(database_path, backup_uploads, db_session, tmp_path / "live")


def test_import_rejects_unsafe_attachment_stored_name(
    db_session: Session,
    tmp_path: Path,
) -> None:
    database_path, backup_uploads, _ = _create_source(tmp_path)
    source_engine = create_database_engine(database_path)
    with Session(source_engine) as source_session:
        attachment = source_session.scalar(select(TenantAttachment))
        assert attachment is not None
        attachment.stored_name = "../../escaped.pdf"
        source_session.commit()
    source_engine.dispose()

    with pytest.raises(RestoreValidationError, match="metadata is invalid"):
        import_backup(database_path, backup_uploads, db_session, tmp_path / "live")


def test_import_rejects_existing_target_with_different_content(
    db_session: Session,
    tmp_path: Path,
) -> None:
    database_path, backup_uploads, _ = _create_source(tmp_path)
    uploads_dir = tmp_path / "live"
    target = attachment_path(uploads_dir, 1, "contract.pdf")
    target.parent.mkdir(parents=True)
    target.write_bytes(b"different-content")

    with pytest.raises(RestoreValidationError, match="different content"):
        import_backup(database_path, backup_uploads, db_session, uploads_dir)


def test_import_skips_overlapping_ended_contract(
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
    existing = Tenant(
        apartment=apartment,
        full_name="Попередній орендар",
        contract_start=date(2025, 6, 1),
        contract_end=date(2026, 6, 30),
    )
    db_session.add(existing)
    db_session.commit()

    summary = import_backup(
        database_path, backup_uploads, db_session, tmp_path / "live"
    )

    assert summary.skipped["tenants"] == 1
    assert db_session.scalars(select(Tenant)).all() == [existing]


def test_import_preserves_duplicate_apartment_business_keys(
    db_session: Session,
    tmp_path: Path,
) -> None:
    database_path, backup_uploads, _ = _create_source(tmp_path)
    source_engine = create_database_engine(database_path)
    with Session(source_engine) as source_session:
        source_session.add(
            Apartment(
                name="Квартира 1",
                address="Київ, Хрещатик, 1",
                rent_amount=Decimal("600.00"),
                rent_currency="USD",
            )
        )
        source_session.commit()
    source_engine.dispose()

    first = import_backup(database_path, backup_uploads, db_session, tmp_path / "live")
    second = import_backup(database_path, backup_uploads, db_session, tmp_path / "live")

    apartments = db_session.scalars(select(Apartment).order_by(Apartment.id)).all()
    assert first.added["apartments"] == 2
    assert second.added["apartments"] == 0
    assert second.skipped["apartments"] == 2
    assert len(apartments) == 2
    assert len({apartment.restore_key for apartment in apartments}) == 2


def test_import_preserves_duplicate_service_business_keys(
    db_session: Session,
    tmp_path: Path,
) -> None:
    database_path, backup_uploads, _ = _create_source(tmp_path)
    source_engine = create_database_engine(database_path)
    with Session(source_engine) as source_session:
        apartment = source_session.scalar(select(Apartment))
        assert apartment is not None
        source_session.add(
            Service(
                apartment=apartment,
                name="Електроенергія",
                kind="fixed",
                unit=None,
            )
        )
        source_session.commit()
    source_engine.dispose()

    first = import_backup(database_path, backup_uploads, db_session, tmp_path / "live")
    second = import_backup(database_path, backup_uploads, db_session, tmp_path / "live")

    services = db_session.scalars(select(Service).order_by(Service.id)).all()
    assert first.added["services"] == 2
    assert second.added["services"] == 0
    assert second.skipped["services"] == 2
    assert len(services) == 2
    assert len({service.restore_key for service in services}) == 2


def test_apartment_fallback_does_not_reuse_row_claimed_by_restore_key(
    db_session: Session,
    tmp_path: Path,
) -> None:
    database_path, backup_uploads, _ = _create_source(tmp_path)
    source_engine = create_database_engine(database_path)
    existing_key = "1" * 32
    distinct_key = "2" * 32
    distinct_service_key = "3" * 32
    with Session(source_engine) as source_session:
        source_existing = source_session.scalar(select(Apartment))
        assert source_existing is not None
        source_existing.restore_key = existing_key
        source_distinct = Apartment(
            restore_key=distinct_key,
            name="Перейменована квартира",
            address="Київ, Нова, 2",
            rent_amount=Decimal("700.00"),
            rent_currency="USD",
        )
        source_distinct.services.append(
            Service(
                restore_key=distinct_service_key,
                name="Водопостачання",
                kind="fixed",
            )
        )
        source_session.add(source_distinct)
        source_session.commit()

    live_existing = Apartment(
        restore_key=existing_key,
        name="Перейменована квартира",
        address="Київ, Нова, 2",
        rent_amount=Decimal("500.00"),
        rent_currency="USD",
    )
    live_new = Apartment(
        restore_key="4" * 32,
        name="Квартира 1",
        address="Київ, Хрещатик, 1",
        rent_amount=Decimal("600.00"),
        rent_currency="USD",
    )
    db_session.add_all([live_existing, live_new])
    db_session.commit()

    first = import_backup(database_path, backup_uploads, db_session, tmp_path / "live")
    second = import_backup(database_path, backup_uploads, db_session, tmp_path / "live")

    apartments = db_session.scalars(select(Apartment).order_by(Apartment.id)).all()
    distinct_service = db_session.scalar(
        select(Service).where(Service.restore_key == distinct_service_key)
    )
    assert first.added["apartments"] == 1
    assert second.added["apartments"] == 0
    assert len(apartments) == 3
    assert live_existing.restore_key == existing_key
    assert distinct_service is not None
    assert distinct_service.apartment.restore_key == distinct_key


def test_service_fallback_does_not_reuse_row_claimed_by_restore_key(
    db_session: Session,
    tmp_path: Path,
) -> None:
    database_path, backup_uploads, _ = _create_source(tmp_path)
    source_engine = create_database_engine(database_path)
    apartment_key = "a" * 32
    existing_key = "b" * 32
    distinct_key = "c" * 32
    with Session(source_engine) as source_session:
        source_apartment = source_session.scalar(select(Apartment))
        source_existing = source_session.scalar(select(Service))
        assert source_apartment is not None
        assert source_existing is not None
        source_apartment.restore_key = apartment_key
        source_existing.restore_key = existing_key
        source_apartment.services.append(
            Service(
                restore_key=distinct_key,
                name="Перейменована послуга",
                kind="fixed",
                tariffs=[
                    Tariff(value=Decimal("7.00000"), valid_from=date(2026, 2, 1))
                ],
            )
        )
        source_session.commit()

    live_apartment = Apartment(
        restore_key=apartment_key,
        name="Квартира 1",
        address="Київ, Хрещатик, 1",
        rent_amount=Decimal("500.00"),
        rent_currency="USD",
    )
    live_existing = Service(
        restore_key=existing_key,
        apartment=live_apartment,
        name="Перейменована послуга",
        kind="fixed",
    )
    live_new = Service(
        restore_key="d" * 32,
        apartment=live_apartment,
        name="Електроенергія",
        kind="metered",
        unit="кВт·год",
    )
    db_session.add_all([live_existing, live_new])
    db_session.commit()

    first = import_backup(database_path, backup_uploads, db_session, tmp_path / "live")
    second = import_backup(database_path, backup_uploads, db_session, tmp_path / "live")

    services = db_session.scalars(select(Service).order_by(Service.id)).all()
    distinct_service = db_session.scalar(
        select(Service).where(Service.restore_key == distinct_key)
    )
    assert first.added["services"] == 1
    assert second.added["services"] == 0
    assert len(services) == 3
    assert live_existing.restore_key == existing_key
    assert distinct_service is not None
    assert [tariff.value for tariff in distinct_service.tariffs] == [
        Decimal("7.00000")
    ]


def test_fallback_cannot_claim_row_reserved_by_later_exact_match(
    db_session: Session,
    tmp_path: Path,
) -> None:
    database_path, backup_uploads, _ = _create_source(tmp_path)
    source_engine = create_database_engine(database_path)
    fallback_key = "5" * 32
    exact_key = "6" * 32
    with Session(source_engine) as source_session:
        first = source_session.scalar(select(Apartment))
        assert first is not None
        first.restore_key = fallback_key
        first.name = "Поточна назва"
        first.address = "Поточна адреса"
        source_session.add(
            Apartment(
                restore_key=exact_key,
                name="Стара назва",
                address="Стара адреса",
                rent_amount=Decimal("700.00"),
                rent_currency="USD",
            )
        )
        source_session.commit()

    live = Apartment(
        restore_key=exact_key,
        name="Поточна назва",
        address="Поточна адреса",
        rent_amount=Decimal("900.00"),
        rent_currency="USD",
    )
    db_session.add(live)
    db_session.commit()

    summary = import_backup(database_path, backup_uploads, db_session, tmp_path / "live")

    assert summary.added["apartments"] == 1
    assert live.restore_key == exact_key
    assert db_session.scalar(
        select(Apartment).where(Apartment.restore_key == fallback_key)
    ) is not None


def test_fallback_alias_survives_live_rename_without_overwriting_identity(
    db_session: Session,
    tmp_path: Path,
) -> None:
    database_path, backup_uploads, _ = _create_source(tmp_path)
    source_engine = create_database_engine(database_path)
    with Session(source_engine) as source_session:
        source = source_session.scalar(select(Apartment))
        assert source is not None
        source.restore_key = "7" * 32
        source_session.commit()
    live = Apartment(
        restore_key="8" * 32,
        name="Квартира 1",
        address="Київ, Хрещатик, 1",
        rent_amount=Decimal("999.00"),
        rent_currency="USD",
    )
    db_session.add(live)
    db_session.commit()

    first = import_backup(database_path, backup_uploads, db_session, tmp_path / "live")
    live.name = "Перейменована локально"
    db_session.commit()
    second = import_backup(database_path, backup_uploads, db_session, tmp_path / "live")

    assert first.skipped["apartments"] == 1
    assert second.added["apartments"] == 0
    assert live.restore_key == "8" * 32
    assert db_session.scalar(select(func.count()).select_from(Apartment)) == 1


def test_import_stages_attachment_bytes_before_live_database_flush(
    db_session: Session,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_path, backup_uploads, _ = _create_source(tmp_path)
    flush_count = 0
    original_flush = db_session.flush
    original_copyfile = restore_service.copyfile

    def tracked_flush(*args, **kwargs) -> None:
        nonlocal flush_count
        flush_count += 1
        original_flush(*args, **kwargs)

    def tracked_copyfile(source: Path, target: Path) -> Path:
        assert flush_count == 0
        return original_copyfile(source, target)

    monkeypatch.setattr(db_session, "flush", tracked_flush)
    monkeypatch.setattr(restore_service, "copyfile", tracked_copyfile)

    import_backup(database_path, backup_uploads, db_session, tmp_path / "live")

    assert flush_count >= 1


def test_startup_recovery_cleans_journal_after_committed_restore(
    db_session: Session,
    db_engine,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_path, backup_uploads, _ = _create_source(tmp_path)
    uploads_dir = tmp_path / "live"
    monkeypatch.setattr(restore_service, "_remove_restore_journal", lambda *args: None)

    import_backup(database_path, backup_uploads, db_session, uploads_dir)

    attachment = db_session.scalar(select(TenantAttachment))
    assert attachment is not None
    target = attachment_path(uploads_dir, attachment.tenant_id, attachment.stored_name)
    assert target.read_bytes() == b"contract-content"
    assert (uploads_dir / ".restore-journal").is_dir()
    monkeypatch.undo()
    recover_restore_journals(uploads_dir, create_session_factory(db_engine))
    assert target.read_bytes() == b"contract-content"
    assert not (uploads_dir / ".restore-journal").exists()


def test_restore_fsyncs_new_directory_entries(
    db_session: Session,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_path, backup_uploads, _ = _create_source(tmp_path)
    uploads_dir = tmp_path / "live"
    synced: list[Path] = []

    def track_fsync(path: Path) -> None:
        synced.append(path)

    monkeypatch.setattr(storage_service, "fsync_directory", track_fsync)
    monkeypatch.setattr(restore_service, "fsync_directory", track_fsync)

    import_backup(database_path, backup_uploads, db_session, uploads_dir)

    attachment = db_session.scalar(select(TenantAttachment))
    assert attachment is not None
    target = attachment_path(uploads_dir, attachment.tenant_id, attachment.stored_name)
    assert uploads_dir.parent in synced
    assert uploads_dir in synced
    assert target.parent.parent in synced
    assert target.parent in synced


def test_parallel_imports_are_serialized_and_idempotent(tmp_path: Path) -> None:
    database_path, backup_uploads, _ = _create_source(tmp_path / "source")
    live_database = tmp_path / "live.db"
    run_migrations(Settings(database_path=live_database, debug=True))
    live_engine = create_database_engine(live_database)
    session_factory = create_session_factory(live_engine)
    uploads_dir = tmp_path / "live-uploads"
    barrier = Barrier(2)
    errors: list[Exception] = []
    summaries = []

    def worker() -> None:
        with session_factory() as session:
            barrier.wait(timeout=5)
            try:
                summaries.append(
                    import_backup(database_path, backup_uploads, session, uploads_dir)
                )
            except Exception as error:
                errors.append(error)

    threads = [Thread(target=worker), Thread(target=worker)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=10)
    assert all(not thread.is_alive() for thread in threads)
    assert errors == []
    assert len(summaries) == 2
    with session_factory() as session:
        assert session.scalar(select(func.count()).select_from(Apartment)) == 1
        assert session.scalar(select(func.count()).select_from(TenantAttachment)) == 1
    live_engine.dispose()
