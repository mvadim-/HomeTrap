from collections.abc import Iterator
from contextlib import contextmanager
import os
from pathlib import Path
import re
from shutil import rmtree
from threading import Lock
from uuid import uuid4

from sqlalchemy.orm import Session, sessionmaker

from app.models import Tenant


ATTACHMENT_TYPES = {
    "image/jpeg": (".jpg", {".jpg", ".jpeg"}),
    "image/png": (".png", {".png"}),
    "image/webp": (".webp", {".webp"}),
    "application/pdf": (".pdf", {".pdf"}),
}
MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024
MAX_ATTACHMENT_FILES = 10
_DATA_STORE_LOCK = Lock()


@contextmanager
def data_store_lock() -> Iterator[None]:
    """Serialize database snapshots/imports with attachment filesystem changes."""
    with _DATA_STORE_LOCK:
        yield


@contextmanager
def write_session(
    source: Session | sessionmaker[Session],
) -> Iterator[Session]:
    """Run a database mutation under the shared data-store coordination lock.

    A factory-backed session is committed and closed here. Callers that provide an
    existing session keep control of its explicit commit boundary (restore needs
    this to coordinate its durable file journal with the database commit).
    """
    owns_session = not isinstance(source, Session)
    session = source() if owns_session else source
    with data_store_lock():
        try:
            yield session
            if owns_session and session.in_transaction():
                session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            if owns_session:
                session.close()


def fsync_directory(path: Path) -> None:
    """Persist directory-entry changes made inside path."""
    directory_fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)


def ensure_directory_durable(path: Path) -> None:
    """Create a directory tree and persist every newly added parent entry."""
    missing = []
    current = path
    while not current.exists():
        missing.append(current)
        current = current.parent
    for directory in reversed(missing):
        directory.mkdir()
        fsync_directory(directory.parent)


def normalize_content_type(content_type: str | None) -> str:
    return (content_type or "").partition(";")[0].strip().lower()


def validate_file_type(original_name: str, content_type: str | None) -> str:
    normalized_type = normalize_content_type(content_type)
    attachment_type = ATTACHMENT_TYPES.get(normalized_type)
    if attachment_type is None or Path(original_name).suffix.lower() not in attachment_type[1]:
        raise ValueError("Unsupported attachment type")
    return normalized_type


def _resolve_within(base: Path, *parts: str) -> Path:
    resolved_base = base.resolve()
    resolved_path = resolved_base.joinpath(*parts).resolve()
    if not resolved_path.is_relative_to(resolved_base):
        raise ValueError("Attachment path escapes uploads directory")
    return resolved_path


def tenant_directory(uploads_dir: Path, tenant_id: int) -> Path:
    return _resolve_within(uploads_dir, "tenants", str(tenant_id))


def attachment_path(uploads_dir: Path, tenant_id: int, stored_name: str) -> Path:
    tenant_dir = tenant_directory(uploads_dir, tenant_id)
    return _resolve_within(tenant_dir, stored_name)


def save_attachment(
    uploads_dir: Path,
    tenant_id: int,
    content_type: str,
    content: bytes,
) -> tuple[str, Path]:
    stored_name = f"{uuid4().hex}{ATTACHMENT_TYPES[content_type][0]}"
    target = attachment_path(uploads_dir, tenant_id, stored_name)
    temporary = target.with_name(f".{stored_name}.tmp")
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        temporary.write_bytes(content)
        temporary.replace(target)
    except Exception:
        temporary.unlink(missing_ok=True)
        target.unlink(missing_ok=True)
        if target.parent.is_dir() and not any(target.parent.iterdir()):
            target.parent.rmdir()
        raise
    return stored_name, target


def delete_attachment(uploads_dir: Path, tenant_id: int, stored_name: str) -> None:
    path = attachment_path(uploads_dir, tenant_id, stored_name)
    path.unlink(missing_ok=True)
    tenant_dir = tenant_directory(uploads_dir, tenant_id)
    if tenant_dir.is_dir() and not any(tenant_dir.iterdir()):
        tenant_dir.rmdir()


def pending_tenant_file_deletions(uploads_dir: Path, tenant_id: int) -> list[Path]:
    staging_root = _resolve_within(uploads_dir, ".deleting")
    if not staging_root.is_dir():
        return []
    prefix = f"tenant-{tenant_id}-"
    return sorted(
        path
        for path in staging_root.iterdir()
        if path.is_dir() and path.name.startswith(prefix)
    )


def stage_tenant_files(uploads_dir: Path, tenant_id: int) -> Path | None:
    directory = tenant_directory(uploads_dir, tenant_id)
    if not directory.is_dir():
        return None
    staging_root = _resolve_within(uploads_dir, ".deleting")
    ensure_directory_durable(staging_root)
    staged = _resolve_within(
        uploads_dir,
        ".deleting",
        f"tenant-{tenant_id}-{uuid4().hex}",
    )
    directory.replace(staged)
    fsync_directory(directory.parent)
    fsync_directory(staging_root)
    return staged


def restore_staged_tenant_files(
    uploads_dir: Path,
    tenant_id: int,
    staged: Path,
) -> None:
    directory = tenant_directory(uploads_dir, tenant_id)
    ensure_directory_durable(directory.parent)
    if directory.exists():
        raise RuntimeError("Tenant attachment directory already exists")
    staged.replace(directory)
    fsync_directory(staged.parent)
    fsync_directory(directory.parent)
    staging_root = _resolve_within(uploads_dir, ".deleting")
    if staging_root.is_dir() and not any(staging_root.iterdir()):
        staging_root.rmdir()
        fsync_directory(staging_root.parent)


def delete_staged_tenant_files(uploads_dir: Path, staged: Path) -> None:
    if staged.is_dir():
        rmtree(staged)
        fsync_directory(staged.parent)
    staging_root = _resolve_within(uploads_dir, ".deleting")
    if staging_root.is_dir() and not any(staging_root.iterdir()):
        staging_root.rmdir()
        fsync_directory(staging_root.parent)


def recover_tenant_file_deletions(uploads_dir: Path, session_factory) -> None:
    """Resolve tenant directories left in .deleting across process crashes."""
    staging_root = _resolve_within(uploads_dir, ".deleting")
    if not staging_root.is_dir():
        return
    pattern = re.compile(r"tenant-(\d+)-[0-9a-f]{32}")
    with write_session(session_factory) as session:
        for staged in sorted(staging_root.iterdir()):
            match = pattern.fullmatch(staged.name)
            if not staged.is_dir() or match is None:
                continue
            tenant_id = int(match.group(1))
            if session.get(Tenant, tenant_id) is None:
                delete_staged_tenant_files(uploads_dir, staged)
            else:
                restore_staged_tenant_files(uploads_dir, tenant_id, staged)
        if staging_root.is_dir() and not any(staging_root.iterdir()):
            staging_root.rmdir()
            fsync_directory(staging_root.parent)
