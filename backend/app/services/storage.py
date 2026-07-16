from pathlib import Path
from shutil import rmtree
from uuid import uuid4


CONTENT_TYPE_EXTENSIONS = {
    "image/jpeg": {".jpg", ".jpeg"},
    "image/png": {".png"},
    "image/webp": {".webp"},
    "application/pdf": {".pdf"},
}
STORED_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
}
MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024


def normalize_content_type(content_type: str | None) -> str:
    return (content_type or "").partition(";")[0].strip().lower()


def validate_file_type(original_name: str, content_type: str | None) -> str:
    normalized_type = normalize_content_type(content_type)
    allowed_extensions = CONTENT_TYPE_EXTENSIONS.get(normalized_type)
    if allowed_extensions is None or Path(original_name).suffix.lower() not in allowed_extensions:
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
    stored_name = f"{uuid4().hex}{STORED_EXTENSIONS[content_type]}"
    target = attachment_path(uploads_dir, tenant_id, stored_name)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
    return stored_name, target


def delete_attachment(uploads_dir: Path, tenant_id: int, stored_name: str) -> None:
    path = attachment_path(uploads_dir, tenant_id, stored_name)
    path.unlink(missing_ok=True)
    tenant_dir = tenant_directory(uploads_dir, tenant_id)
    if tenant_dir.is_dir() and not any(tenant_dir.iterdir()):
        tenant_dir.rmdir()


def delete_tenant_files(uploads_dir: Path, tenant_id: int) -> None:
    directory = tenant_directory(uploads_dir, tenant_id)
    if directory.is_dir():
        rmtree(directory)
