from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime
from hashlib import sha256
import json
import os
from pathlib import Path
from shutil import copyfile, rmtree
import sqlite3
from typing import Any
from uuid import uuid4

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker

from app.models import (
    Apartment,
    ExchangeRate,
    Expense,
    Invoice,
    InvoiceLine,
    RestoreAlias,
    Service,
    Tariff,
    Tenant,
    TenantAttachment,
)
from app.services.storage import (
    ATTACHMENT_TYPES,
    MAX_ATTACHMENT_SIZE,
    attachment_path,
    ensure_directory_durable,
    fsync_directory,
    validate_file_type,
    write_session,
)


ENTITY_NAMES = (
    "apartments",
    "services",
    "tariffs",
    "tenants",
    "tenant_attachments",
    "invoices",
    "invoice_lines",
    "exchange_rates",
    "expenses",
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
    except (AttributeError, TypeError, ValueError) as error:
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
    existing_rows = live_session.scalars(statement.limit(2)).all()
    if len(existing_rows) > 1:
        raise RestoreValidationError(
            f"Live database contains ambiguous {entity_name} business keys"
        )
    if existing_rows:
        summary.skipped[entity_name] += 1
        return existing_rows[0]
    live_session.add(new_entity)
    summary.added[entity_name] += 1
    return new_entity


def _stable_existing_or_add(
    live_session: Session,
    summary: ImportSummary,
    entity_name: str,
    restore_key: str,
    fallback_statement: Any,
    allow_fallback: bool,
    new_entity: Any,
    claimed_ids: set[int],
    exact_existing: Any | None,
) -> Any:
    _validate_restore_key(restore_key, entity_name)
    existing = exact_existing
    if existing is None and allow_fallback:
        fallback_rows = live_session.scalars(fallback_statement.limit(2)).all()
        if len(fallback_rows) == 1 and fallback_rows[0].id not in claimed_ids:
            existing = fallback_rows[0]
            live_session.add(
                RestoreAlias(
                    entity_type=entity_name.removesuffix("s"),
                    restore_key=restore_key,
                    target_restore_key=existing.restore_key,
                )
            )
    if existing is not None:
        summary.skipped[entity_name] += 1
        result = existing
    else:
        live_session.add(new_entity)
        summary.added[entity_name] += 1
        result = new_entity
    claimed_ids.add(result.id)
    return result


def _validate_restore_key(restore_key: object, entity_name: str) -> None:
    if (
        not isinstance(restore_key, str)
        or len(restore_key) != 32
        or any(character not in "0123456789abcdef" for character in restore_key)
    ):
        raise RestoreValidationError(
            f"Backup contains an invalid {entity_name} restore key"
        )


def _exact_identity_matches(
    live_session: Session,
    model: Any,
    entity_type: str,
    restore_keys: set[str],
) -> dict[str, Any]:
    canonical = {
        row.restore_key: row
        for row in live_session.scalars(
            select(model).where(model.restore_key.in_(restore_keys))
        )
    }
    aliases = live_session.scalars(
        select(RestoreAlias).where(
            RestoreAlias.entity_type == entity_type,
            RestoreAlias.restore_key.in_(restore_keys),
        )
    ).all()
    if not aliases:
        return canonical
    targets = {
        row.restore_key: row
        for row in live_session.scalars(
            select(model).where(
                model.restore_key.in_({alias.target_restore_key for alias in aliases})
            )
        )
    }
    for alias in aliases:
        target = targets.get(alias.target_restore_key)
        if target is None:
            raise RestoreValidationError("Live database contains a dangling restore alias")
        existing = canonical.get(alias.restore_key)
        if existing is not None and existing is not target:
            raise RestoreValidationError(
                "Live database contains conflicting restore identities"
            )
        canonical[alias.restore_key] = target
    return canonical


def _copy_restore_aliases(
    source_session: Session,
    live_session: Session,
    entity_type: str,
    source_map: dict[int, Any],
    source_rows: list[Any],
) -> None:
    source_by_key = {row.restore_key: row for row in source_rows}
    live_canonical = {
        row.restore_key: row
        for row in live_session.scalars(select(type(source_rows[0]))).all()
    } if source_rows else {}
    live_aliases = {
        alias.restore_key: alias
        for alias in live_session.scalars(
            select(RestoreAlias).where(RestoreAlias.entity_type == entity_type)
        )
    }
    source_aliases = source_session.scalars(
        select(RestoreAlias).where(RestoreAlias.entity_type == entity_type)
    ).all()
    for source_alias in source_aliases:
        _validate_restore_key(source_alias.restore_key, f"{entity_type} alias")
        _validate_restore_key(
            source_alias.target_restore_key,
            f"{entity_type} alias target",
        )
        source_target = source_by_key.get(source_alias.target_restore_key)
        if source_target is None:
            raise RestoreValidationError("Backup contains a dangling restore alias")
        source_collision = source_by_key.get(source_alias.restore_key)
        if source_collision is not None and source_collision is not source_target:
            raise RestoreValidationError(
                "Backup restore alias conflicts with a canonical identity"
            )
        target_key = source_map[source_target.id].restore_key
        if source_alias.restore_key == target_key:
            continue
        canonical_collision = live_canonical.get(source_alias.restore_key)
        if canonical_collision is not None and canonical_collision.restore_key != target_key:
            raise RestoreValidationError("Restore alias conflicts with live identity")
        existing = live_aliases.get(source_alias.restore_key)
        if existing is not None:
            if existing.target_restore_key != target_key:
                raise RestoreValidationError("Restore alias conflicts with live identity")
            continue
        alias = RestoreAlias(
            entity_type=entity_type,
            restore_key=source_alias.restore_key,
            target_restore_key=target_key,
        )
        live_session.add(alias)
        live_aliases[alias.restore_key] = alias


def _source_attachment_path(
    source: TenantAttachment,
    backup_uploads_dir: Path,
) -> Path:
    try:
        normalized_type = validate_file_type(source.original_name, source.content_type)
        if (
            not source.stored_name
            or Path(source.stored_name).name != source.stored_name
            or "\\" in source.stored_name
            or Path(source.stored_name).suffix.lower()
            != ATTACHMENT_TYPES[normalized_type][0]
        ):
            raise ValueError("Unsafe attachment stored name")
        source_path = attachment_path(
            backup_uploads_dir, source.tenant_id, source.stored_name
        )
    except (AttributeError, TypeError, ValueError) as error:
        raise RestoreValidationError("Backup attachment metadata is invalid") from error

    if (
        isinstance(source.size_bytes, bool)
        or not isinstance(source.size_bytes, int)
        or source.size_bytes < 0
        or source.size_bytes > MAX_ATTACHMENT_SIZE
    ):
        raise RestoreValidationError("Backup attachment size is invalid")
    if not source_path.is_file() or source_path.stat().st_size != source.size_bytes:
        raise RestoreValidationError(
            "Backup attachment file is missing or has wrong size"
        )
    return source_path


def _target_attachment_path(
    source: TenantAttachment,
    staged_path: Path,
    uploads_dir: Path,
    target_tenant_id: int,
) -> Path:
    try:
        target_path = attachment_path(uploads_dir, target_tenant_id, source.stored_name)
    except (AttributeError, TypeError, ValueError) as error:
        raise RestoreValidationError("Backup attachment metadata is invalid") from error
    if target_path.exists() and (
        not target_path.is_file()
        or target_path.stat().st_size != source.size_bytes
        or _file_sha256(target_path) != _file_sha256(staged_path)
    ):
        raise RestoreValidationError("Live attachment path contains different content")
    return target_path


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
    store_context = write_session(live_session)
    store_context.__enter__()
    summary = ImportSummary()
    pending_files: list[tuple[Path, Path]] = []
    journal_root = uploads_dir / ".restore-journal"
    journal_dir = journal_root / uuid4().hex
    committed = False

    try:
        ensure_directory_durable(journal_dir)
        staged_files: dict[int, Path] = {}
        staged_hashes: dict[Path, str] = {}
        source_attachments = source_session.scalars(
            select(TenantAttachment).order_by(TenantAttachment.id)
        ).all()
        for source in source_attachments:
            source_path = _source_attachment_path(source, backup_uploads_dir)
            staged_path = journal_dir / str(source.id)
            copyfile(source_path, staged_path)
            _fsync_file(staged_path)
            staged_files[source.id] = staged_path
            staged_hashes[staged_path] = _file_sha256(staged_path)

        with live_session.no_autoflush:
            _import_rows(
                source_session,
                live_session,
                uploads_dir,
                source_attachments,
                staged_files,
                summary,
                pending_files,
            )

        live_session.flush()
        journal = []
        for staged_path, target_path in pending_files:
            journal.append(
                {
                    "staged_name": staged_path.name,
                    "target": target_path.relative_to(uploads_dir).as_posix(),
                    "size": staged_path.stat().st_size,
                    "sha256": staged_hashes[staged_path],
                }
            )
        _write_restore_journal(journal_dir, journal)
        _finish_restore_journal(
            journal_dir,
            uploads_dir,
            live_session,
            remove_journal=False,
        )
        live_session.commit()
        committed = True
        try:
            _remove_restore_journal(journal_dir)
        except OSError:
            # The committed database and canonical files are already durable.
            # Startup recovery can safely remove the leftover journal.
            pass
        return summary
    except Exception:
        live_session.rollback()
        if not committed:
            try:
                _finish_restore_journal(journal_dir, uploads_dir, live_session)
            except Exception:
                # Preserve the import error. A durable journal remains for startup
                # recovery if immediate rollback cleanup cannot complete.
                pass
        raise
    finally:
        source_session.close()
        source_engine.dispose()
        store_context.__exit__(None, None, None)


def _write_restore_journal(journal_dir: Path, entries: list[dict[str, Any]]) -> None:
    temporary = journal_dir / "journal.json.tmp"
    journal_path = journal_dir / "journal.json"
    with temporary.open("w", encoding="utf-8") as target:
        json.dump({"version": 1, "files": entries}, target, sort_keys=True)
        target.flush()
        os.fsync(target.fileno())
    temporary.replace(journal_path)
    fsync_directory(journal_dir)


def _fsync_file(path: Path) -> None:
    with path.open("rb") as source:
        os.fsync(source.fileno())


def _finish_restore_journal(
    journal_dir: Path,
    uploads_dir: Path,
    session: Session,
    *,
    remove_journal: bool = True,
) -> None:
    journal_path = journal_dir / "journal.json"
    if not journal_path.is_file():
        if remove_journal:
            _remove_restore_journal(journal_dir)
        return
    journal = json.loads(journal_path.read_text(encoding="utf-8"))
    entries = journal["files"] if journal.get("version") == 1 else None
    if not isinstance(entries, list):
        raise ValueError("invalid restore journal")
    for entry in entries:
        target = uploads_dir.joinpath(*Path(entry["target"]).parts).resolve()
        if not target.is_relative_to(uploads_dir.resolve()):
            raise ValueError("unsafe restore journal target")
        parts = target.relative_to(uploads_dir.resolve()).parts
        if len(parts) != 3 or parts[0] != "tenants":
            raise ValueError("invalid restore journal target")
        tenant_id = int(parts[1])
        stored_name = parts[2]
        row = session.scalar(
            select(TenantAttachment.id).where(
                TenantAttachment.tenant_id == tenant_id,
                TenantAttachment.stored_name == stored_name,
                TenantAttachment.size_bytes == entry["size"],
            )
        )
        staged = journal_dir / entry["staged_name"]
        if row is None:
            if target.exists():
                if (
                    not target.is_file()
                    or target.stat().st_size != entry["size"]
                    or _file_sha256(target) != entry["sha256"]
                ):
                    raise RestoreValidationError(
                        "Orphan restore target contains different content"
                    )
                target.unlink()
                fsync_directory(target.parent)
                _remove_empty_directories(target.parent, uploads_dir)
            continue
        if target.is_file():
            if (
                target.stat().st_size != entry["size"]
                or _file_sha256(target) != entry["sha256"]
            ):
                raise RestoreValidationError(
                    "Restore journal target contains different content"
                )
            continue
        if not staged.is_file() or _file_sha256(staged) != entry["sha256"]:
            raise RestoreValidationError("Restore journal file is missing")
        ensure_directory_durable(target.parent)
        staged.replace(target)
        fsync_directory(journal_dir)
        fsync_directory(target.parent)
    if remove_journal:
        _remove_restore_journal(journal_dir)


def _remove_restore_journal(journal_dir: Path) -> None:
    if journal_dir.is_dir():
        journal_root = journal_dir.parent
        rmtree(journal_dir)
        fsync_directory(journal_root)
        if not any(journal_root.iterdir()):
            journal_root.rmdir()
            fsync_directory(journal_root.parent)


def _remove_empty_directories(path: Path, stop: Path) -> None:
    current = path
    resolved_stop = stop.resolve()
    while current.resolve() != resolved_stop and not any(current.iterdir()):
        parent = current.parent
        current.rmdir()
        fsync_directory(parent)
        current = parent


def recover_restore_journals(uploads_dir: Path, session_factory: Any) -> None:
    """Finish committed restore files and discard journals without matching rows."""
    journal_root = uploads_dir / ".restore-journal"
    if not journal_root.is_dir():
        return
    with write_session(session_factory) as session:
        for journal_dir in sorted(journal_root.iterdir()):
            if journal_dir.is_dir():
                _finish_restore_journal(journal_dir, uploads_dir, session)
        if journal_root.is_dir() and not any(journal_root.iterdir()):
            journal_root.rmdir()
            fsync_directory(journal_root.parent)


def _import_rows(
    source_session: Session,
    live_session: Session,
    uploads_dir: Path,
    source_attachments: list[TenantAttachment],
    staged_files: dict[int, Path],
    summary: ImportSummary,
    pending_files: list[tuple[Path, Path]],
) -> None:
    context = ImportContext(
        source_session=source_session,
        live_session=live_session,
        uploads_dir=uploads_dir,
        source_attachments=source_attachments,
        staged_files=staged_files,
        summary=summary,
        pending_files=pending_files,
    )
    _import_apartments(context)
    _import_services(context)
    _import_tariffs(context)
    _import_tenants(context)
    _import_tenant_attachments(context)
    _import_invoices(context)
    _import_invoice_lines(context)
    _import_exchange_rates(context)
    _import_expenses(context)


@dataclass
class ImportContext:
    source_session: Session
    live_session: Session
    uploads_dir: Path
    source_attachments: list[TenantAttachment]
    staged_files: dict[int, Path]
    summary: ImportSummary
    pending_files: list[tuple[Path, Path]]
    apartment_map: dict[int, Apartment] = field(default_factory=dict)
    service_map: dict[int, Service] = field(default_factory=dict)
    tenant_map: dict[int, Tenant] = field(default_factory=dict)
    invoice_map: dict[int, Invoice] = field(default_factory=dict)
    new_invoice_ids: set[int] = field(default_factory=set)
    next_ids: dict[type, int] = field(init=False)

    def __post_init__(self) -> None:
        self.next_ids = {
            model: (self.live_session.scalar(select(func.max(model.id))) or 0) + 1
            for model in (Apartment, Service, Tenant, Invoice)
        }

    def allocate_id(self, model: type) -> int:
        allocated = self.next_ids[model]
        self.next_ids[model] += 1
        return allocated


def _import_apartments(context: ImportContext) -> None:
    source_rows = context.source_session.scalars(
        select(Apartment).order_by(Apartment.id)
    ).all()
    key_counts = Counter((source.name, source.address) for source in source_rows)
    exact = _exact_identity_matches(
        context.live_session,
        Apartment,
        "apartment",
        {source.restore_key for source in source_rows},
    )
    claimed_ids = {row.id for row in exact.values()}
    for source in source_rows:
        key = (source.name, source.address)
        context.apartment_map[source.id] = _stable_existing_or_add(
            context.live_session,
            context.summary,
            "apartments",
            source.restore_key,
            select(Apartment).where(
                Apartment.name == source.name,
                Apartment.address == source.address,
            ),
            key_counts[key] == 1,
            Apartment(
                id=context.allocate_id(Apartment),
                **_copy_columns(
                    source,
                    "restore_key",
                    "name",
                    "address",
                    "rent_amount",
                    "rent_currency",
                    "notes",
                    "is_active",
                ),
            ),
            claimed_ids,
            exact.get(source.restore_key),
        )
    _copy_restore_aliases(
        context.source_session,
        context.live_session,
        "apartment",
        context.apartment_map,
        source_rows,
    )


def _import_services(context: ImportContext) -> None:
    source_rows = context.source_session.scalars(
        select(Service).order_by(Service.id)
    ).all()
    key_counts = Counter(
        (source.apartment_id, source.name) for source in source_rows
    )
    exact = _exact_identity_matches(
        context.live_session,
        Service,
        "service",
        {source.restore_key for source in source_rows},
    )
    claimed_ids = {row.id for row in exact.values()}
    for source in source_rows:
        key = (source.apartment_id, source.name)
        apartment = context.apartment_map[source.apartment_id]
        context.service_map[source.id] = _stable_existing_or_add(
            context.live_session,
            context.summary,
            "services",
            source.restore_key,
            select(Service).where(
                Service.apartment_id == apartment.id,
                Service.name == source.name,
            ),
            key_counts[key] == 1,
            Service(
                id=context.allocate_id(Service),
                apartment_id=apartment.id,
                **_copy_columns(
                    source,
                    "restore_key",
                    "name",
                    "kind",
                    "unit",
                    "provider_account",
                    "sort_order",
                    "is_active",
                ),
            ),
            claimed_ids,
            exact.get(source.restore_key),
        )
    _copy_restore_aliases(
        context.source_session,
        context.live_session,
        "service",
        context.service_map,
        source_rows,
    )


def _import_tariffs(context: ImportContext) -> None:
    for source in context.source_session.scalars(select(Tariff).order_by(Tariff.id)):
        service = context.service_map[source.service_id]
        _existing_or_add(
            context.live_session,
            context.summary,
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


def _import_tenants(context: ImportContext) -> None:
    candidates = list(context.live_session.scalars(select(Tenant)).all())
    for source in context.source_session.scalars(select(Tenant).order_by(Tenant.id)):
        apartment = context.apartment_map[source.apartment_id]
        existing = next(
            (
                candidate
                for candidate in candidates
                if candidate.apartment_id == apartment.id
                and candidate.full_name == source.full_name
                and candidate.contract_start == source.contract_start
            ),
            None,
        )
        if existing is not None:
            context.summary.skipped["tenants"] += 1
            context.tenant_map[source.id] = existing
            continue
        overlaps = any(
            candidate.apartment_id == apartment.id
            and (candidate.contract_end is None or candidate.contract_end >= source.contract_start)
            and (
                source.contract_end is None
                or candidate.contract_start <= source.contract_end
            )
            for candidate in candidates
        )
        if overlaps:
            context.summary.skipped["tenants"] += 1
            continue
        tenant = Tenant(
            id=context.allocate_id(Tenant),
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
        context.live_session.add(tenant)
        candidates.append(tenant)
        context.summary.added["tenants"] += 1
        context.tenant_map[source.id] = tenant


def _import_tenant_attachments(context: ImportContext) -> None:
    for source in context.source_attachments:
        tenant = context.tenant_map.get(source.tenant_id)
        if tenant is None:
            context.summary.skipped["tenant_attachments"] += 1
            continue
        staged_path = context.staged_files[source.id]
        target_path = _target_attachment_path(
            source,
            staged_path,
            context.uploads_dir,
            tenant.id,
        )
        existing = context.live_session.scalar(
            select(TenantAttachment).where(
                TenantAttachment.tenant_id == tenant.id,
                TenantAttachment.stored_name == source.stored_name,
            )
        )
        if existing is not None:
            context.summary.skipped["tenant_attachments"] += 1
            if not target_path.exists():
                context.pending_files.append((staged_path, target_path))
            continue
        context.live_session.add(
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
        context.summary.added["tenant_attachments"] += 1
        if not target_path.exists():
            context.pending_files.append((staged_path, target_path))


def _import_invoices(context: ImportContext) -> None:
    for source in context.source_session.scalars(select(Invoice).order_by(Invoice.id)):
        apartment = context.apartment_map[source.apartment_id]
        existing = context.live_session.scalar(
            select(Invoice).where(
                Invoice.apartment_id == apartment.id,
                Invoice.period == source.period,
            )
        )
        if existing is not None:
            context.summary.skipped["invoices"] += 1
            context.invoice_map[source.id] = existing
            continue
        invoice = Invoice(
            id=context.allocate_id(Invoice),
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
        context.live_session.add(invoice)
        context.summary.added["invoices"] += 1
        context.invoice_map[source.id] = invoice
        context.new_invoice_ids.add(source.id)


def _import_invoice_lines(context: ImportContext) -> None:
    for source in context.source_session.scalars(
        select(InvoiceLine).order_by(InvoiceLine.id)
    ):
        if source.invoice_id not in context.new_invoice_ids:
            context.summary.skipped["invoice_lines"] += 1
            continue
        context.live_session.add(
            InvoiceLine(
                invoice_id=context.invoice_map[source.invoice_id].id,
                service_id=context.service_map[source.service_id].id,
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
        )
        context.summary.added["invoice_lines"] += 1


def _import_exchange_rates(context: ImportContext) -> None:
    for source in context.source_session.scalars(
        select(ExchangeRate).order_by(ExchangeRate.id)
    ):
        _existing_or_add(
            context.live_session,
            context.summary,
            "exchange_rates",
            select(ExchangeRate).where(
                ExchangeRate.date == source.date,
                ExchangeRate.currency == source.currency,
            ),
            ExchangeRate(**_copy_columns(source, "date", "currency", "rate")),
        )


def _import_expenses(context: ImportContext) -> None:
    for source in context.source_session.scalars(select(Expense).order_by(Expense.id)):
        _validate_restore_key(source.restore_key, "expenses")
        apartment_id = None
        if source.apartment_id is not None:
            apartment_id = context.apartment_map[source.apartment_id].id
        _existing_or_add(
            context.live_session,
            context.summary,
            "expenses",
            select(Expense).where(Expense.restore_key == source.restore_key),
            Expense(
                apartment_id=apartment_id,
                **_copy_columns(
                    source,
                    "restore_key",
                    "date",
                    "category",
                    "amount",
                    "currency",
                    "notes",
                ),
            ),
        )
