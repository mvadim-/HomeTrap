from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from hashlib import sha256
from pathlib import Path
from shutil import copyfile
import sqlite3
from typing import Any

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.models import (
    Apartment,
    ExchangeRate,
    Invoice,
    InvoiceLine,
    Service,
    Tariff,
    Tenant,
    TenantAttachment,
)
from app.services.storage import attachment_path


ENTITY_NAMES = (
    "apartments",
    "services",
    "tariffs",
    "tenants",
    "tenant_attachments",
    "invoices",
    "invoice_lines",
    "exchange_rates",
)


class RestoreValidationError(ValueError):
    """Raised when an extracted backup cannot be safely imported."""


@dataclass
class ImportSummary:
    added: dict[str, int] = field(
        default_factory=lambda: dict.fromkeys(ENTITY_NAMES, 0)
    )
    skipped: dict[str, int] = field(
        default_factory=lambda: dict.fromkeys(ENTITY_NAMES, 0)
    )


def _file_sha256(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_manifest(
    manifest: object,
    current_revision: str,
    database_path: Path,
) -> None:
    """Validate an extracted backup manifest and its database snapshot."""
    if not isinstance(manifest, dict):
        raise RestoreValidationError("Backup manifest must be a JSON object")

    required_string_fields = (
        "app_version",
        "alembic_revision",
        "created_at",
        "db_sha256",
    )
    for field_name in required_string_fields:
        if not isinstance(manifest.get(field_name), str) or not manifest[field_name]:
            raise RestoreValidationError(
                f"Backup manifest field '{field_name}' is missing or invalid"
            )

    if manifest["alembic_revision"] != current_revision:
        raise RestoreValidationError(
            "Backup database revision is incompatible with the current database"
        )

    try:
        created_at = datetime.fromisoformat(manifest["created_at"])
    except ValueError as error:
        raise RestoreValidationError(
            "Backup manifest field 'created_at' is invalid"
        ) from error
    if created_at.tzinfo is None:
        raise RestoreValidationError(
            "Backup manifest field 'created_at' must include a timezone"
        )

    expected_sha256 = manifest["db_sha256"].lower()
    if len(expected_sha256) != 64 or any(
        character not in "0123456789abcdef" for character in expected_sha256
    ):
        raise RestoreValidationError("Backup manifest field 'db_sha256' is invalid")
    if not database_path.is_file():
        raise RestoreValidationError("Backup database file is missing")
    if _file_sha256(database_path) != expected_sha256:
        raise RestoreValidationError("Backup database checksum does not match manifest")

    try:
        with sqlite3.connect(f"file:{database_path}?mode=ro", uri=True) as connection:
            row = connection.execute(
                "SELECT version_num FROM alembic_version"
            ).fetchone()
    except sqlite3.Error as error:
        raise RestoreValidationError("Backup database is invalid") from error
    if row is None or str(row[0]) != manifest["alembic_revision"]:
        raise RestoreValidationError("Backup database revision does not match manifest")


def _copy_columns(source: Any, *column_names: str) -> dict[str, Any]:
    return {column_name: getattr(source, column_name) for column_name in column_names}


def _existing_or_add(
    live_session: Session,
    summary: ImportSummary,
    entity_name: str,
    statement: Any,
    new_entity: Any,
) -> Any:
    existing = live_session.scalar(statement)
    if existing is not None:
        summary.skipped[entity_name] += 1
        return existing
    live_session.add(new_entity)
    live_session.flush()
    summary.added[entity_name] += 1
    return new_entity


def _remove_empty_parents(path: Path, uploads_dir: Path) -> None:
    parent = path.parent
    uploads_root = uploads_dir.resolve()
    while parent != uploads_root and parent.is_relative_to(uploads_root):
        if not parent.is_dir() or any(parent.iterdir()):
            break
        parent.rmdir()
        parent = parent.parent


def import_backup(
    database_path: Path,
    backup_uploads_dir: Path,
    live_session: Session,
    uploads_dir: Path,
) -> ImportSummary:
    """Merge missing backup rows and attachment files into the live store."""
    source_engine = create_engine(
        f"sqlite:///file:{database_path.resolve()}?mode=ro&uri=true",
        connect_args={"check_same_thread": False},
    )
    source_session = sessionmaker(bind=source_engine)()
    summary = ImportSummary()
    copied_paths: list[Path] = []
    pending_files: list[tuple[Path, Path]] = []

    try:
        apartment_map: dict[int, Apartment] = {}
        for source in source_session.scalars(select(Apartment).order_by(Apartment.id)):
            apartment = _existing_or_add(
                live_session,
                summary,
                "apartments",
                select(Apartment).where(
                    Apartment.name == source.name,
                    Apartment.address == source.address,
                ),
                Apartment(
                    **_copy_columns(
                        source,
                        "name",
                        "address",
                        "rent_amount",
                        "rent_currency",
                        "notes",
                        "is_active",
                    )
                ),
            )
            apartment_map[source.id] = apartment

        service_map: dict[int, Service] = {}
        for source in source_session.scalars(select(Service).order_by(Service.id)):
            apartment = apartment_map[source.apartment_id]
            service = _existing_or_add(
                live_session,
                summary,
                "services",
                select(Service).where(
                    Service.apartment_id == apartment.id,
                    Service.name == source.name,
                ),
                Service(
                    apartment_id=apartment.id,
                    **_copy_columns(
                        source,
                        "name",
                        "kind",
                        "unit",
                        "provider_account",
                        "sort_order",
                        "is_active",
                    ),
                ),
            )
            service_map[source.id] = service

        for source in source_session.scalars(select(Tariff).order_by(Tariff.id)):
            service = service_map[source.service_id]
            _existing_or_add(
                live_session,
                summary,
                "tariffs",
                select(Tariff).where(
                    Tariff.service_id == service.id,
                    Tariff.valid_from == source.valid_from,
                ),
                Tariff(
                    service_id=service.id,
                    **_copy_columns(source, "value", "valid_from"),
                ),
            )

        tenant_map: dict[int, Tenant] = {}
        for source in source_session.scalars(select(Tenant).order_by(Tenant.id)):
            apartment = apartment_map[source.apartment_id]
            existing = live_session.scalar(
                select(Tenant).where(
                    Tenant.apartment_id == apartment.id,
                    Tenant.full_name == source.full_name,
                    Tenant.contract_start == source.contract_start,
                )
            )
            if existing is not None:
                summary.skipped["tenants"] += 1
                tenant_map[source.id] = existing
                continue
            if (
                source.contract_end is None
                and live_session.scalar(
                    select(Tenant).where(
                        Tenant.apartment_id == apartment.id,
                        Tenant.contract_end.is_(None),
                    )
                )
                is not None
            ):
                summary.skipped["tenants"] += 1
                continue
            tenant = Tenant(
                apartment_id=apartment.id,
                **_copy_columns(
                    source,
                    "full_name",
                    "phone",
                    "email",
                    "contract_start",
                    "contract_end",
                    "billing_day",
                    "notes",
                ),
            )
            live_session.add(tenant)
            live_session.flush()
            summary.added["tenants"] += 1
            tenant_map[source.id] = tenant

        for source in source_session.scalars(
            select(TenantAttachment).order_by(TenantAttachment.id)
        ):
            tenant = tenant_map.get(source.tenant_id)
            if tenant is None:
                summary.skipped["tenant_attachments"] += 1
                continue
            existing = live_session.scalar(
                select(TenantAttachment).where(
                    TenantAttachment.tenant_id == tenant.id,
                    TenantAttachment.stored_name == source.stored_name,
                )
            )
            if existing is not None:
                summary.skipped["tenant_attachments"] += 1
                continue
            live_session.add(
                TenantAttachment(
                    tenant_id=tenant.id,
                    **_copy_columns(
                        source,
                        "original_name",
                        "stored_name",
                        "content_type",
                        "size_bytes",
                        "uploaded_at",
                    ),
                )
            )
            summary.added["tenant_attachments"] += 1
            source_path = attachment_path(
                backup_uploads_dir, source.tenant_id, source.stored_name
            )
            target_path = attachment_path(uploads_dir, tenant.id, source.stored_name)
            if not target_path.exists():
                pending_files.append((source_path, target_path))

        invoice_map: dict[int, Invoice] = {}
        new_invoice_ids: set[int] = set()
        for source in source_session.scalars(select(Invoice).order_by(Invoice.id)):
            apartment = apartment_map[source.apartment_id]
            existing = live_session.scalar(
                select(Invoice).where(
                    Invoice.apartment_id == apartment.id,
                    Invoice.period == source.period,
                )
            )
            if existing is not None:
                summary.skipped["invoices"] += 1
                invoice_map[source.id] = existing
                continue
            invoice = Invoice(
                apartment_id=apartment.id,
                **_copy_columns(
                    source,
                    "period",
                    "status",
                    "issued_at",
                    "paid_at",
                    "exchange_rate",
                    "rent_amount_usd",
                    "rent_amount_uah",
                    "utilities_total",
                    "grand_total",
                ),
            )
            live_session.add(invoice)
            live_session.flush()
            summary.added["invoices"] += 1
            invoice_map[source.id] = invoice
            new_invoice_ids.add(source.id)

        for source in source_session.scalars(
            select(InvoiceLine).order_by(InvoiceLine.id)
        ):
            if source.invoice_id not in new_invoice_ids:
                summary.skipped["invoice_lines"] += 1
                continue
            line = InvoiceLine(
                invoice_id=invoice_map[source.invoice_id].id,
                service_id=service_map[source.service_id].id,
                **_copy_columns(
                    source,
                    "service_name",
                    "service_kind",
                    "prev_reading",
                    "curr_reading",
                    "consumed",
                    "tariff_value",
                    "amount",
                ),
            )
            live_session.add(line)
            summary.added["invoice_lines"] += 1

        for source in source_session.scalars(
            select(ExchangeRate).order_by(ExchangeRate.id)
        ):
            _existing_or_add(
                live_session,
                summary,
                "exchange_rates",
                select(ExchangeRate).where(
                    ExchangeRate.date == source.date,
                    ExchangeRate.currency == source.currency,
                ),
                ExchangeRate(**_copy_columns(source, "date", "currency", "rate")),
            )

        live_session.flush()
        for source_path, target_path in pending_files:
            if not source_path.is_file():
                raise FileNotFoundError(
                    f"Backup attachment is missing: {source_path.name}"
                )
            target_path.parent.mkdir(parents=True, exist_ok=True)
            temporary_path = target_path.with_name(f".{target_path.name}.tmp")
            try:
                copyfile(source_path, temporary_path)
                temporary_path.replace(target_path)
            except Exception:
                temporary_path.unlink(missing_ok=True)
                raise
            copied_paths.append(target_path)

        live_session.commit()
        return summary
    except Exception:
        for path in reversed(copied_paths):
            path.unlink(missing_ok=True)
            _remove_empty_parents(path, uploads_dir)
        live_session.rollback()
        raise
    finally:
        source_session.close()
        source_engine.dispose()
