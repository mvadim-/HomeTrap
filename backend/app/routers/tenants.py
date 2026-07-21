from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Request,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import get_db, get_write_db, require_auth
from app.models import Apartment, Tenant, TenantAttachment
from app.schemas import TenantAttachmentOut, TenantEndContract, TenantIn, TenantOut
from app.services.storage import (
    MAX_ATTACHMENT_FILES,
    MAX_ATTACHMENT_SIZE,
    attachment_path,
    delete_attachment,
    delete_staged_tenant_files,
    pending_tenant_file_deletions,
    restore_staged_tenant_files,
    save_attachment,
    stage_tenant_files,
    validate_file_type,
)

router = APIRouter(tags=["tenants"], dependencies=[Depends(require_auth)])


def _commit_tenant(session: Session) -> None:
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        if "tenants.apartment_id" in str(error.orig):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Apartment already has an active tenant",
            ) from error
        raise


def _ensure_contract_does_not_overlap(
    session: Session,
    apartment_id: int,
    payload: TenantIn,
    tenant_id: int | None = None,
) -> None:
    query = select(Tenant.id).where(
        Tenant.apartment_id == apartment_id,
        or_(
            Tenant.contract_end.is_(None),
            Tenant.contract_end >= payload.contract_start,
        ),
    )
    if payload.contract_end is not None:
        query = query.where(Tenant.contract_start <= payload.contract_end)
    if tenant_id is not None:
        query = query.where(Tenant.id != tenant_id)
    if session.scalar(query.limit(1)) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Tenant contract overlaps an existing contract",
        )


def _get_apartment(session: Session, apartment_id: int) -> Apartment:
    apartment = session.get(Apartment, apartment_id)
    if apartment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Apartment not found",
        )
    return apartment


def _get_tenant(session: Session, tenant_id: int) -> Tenant:
    tenant = session.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found",
        )
    return tenant


def _get_attachment(session: Session, attachment_id: int) -> TenantAttachment:
    attachment = session.get(TenantAttachment, attachment_id)
    if attachment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attachment not found",
        )
    return attachment


@router.get(
    "/api/apartments/{apartment_id}/tenants",
    response_model=list[TenantOut],
)
def list_tenants(
    apartment_id: int,
    session: Session = Depends(get_db),
) -> list[Tenant]:
    _get_apartment(session, apartment_id)
    return list(
        session.scalars(
            select(Tenant)
            .where(Tenant.apartment_id == apartment_id)
            .order_by(
                Tenant.contract_end.is_not(None),
                Tenant.contract_start.desc(),
                Tenant.id.desc(),
            )
        ).all()
    )


@router.post(
    "/api/apartments/{apartment_id}/tenants",
    response_model=TenantOut,
    status_code=status.HTTP_201_CREATED,
)
def create_tenant(
    apartment_id: int,
    payload: TenantIn,
    session: Session = Depends(get_write_db),
) -> Tenant:
    _get_apartment(session, apartment_id)
    active_tenant = session.scalar(
        select(Tenant).where(
            Tenant.apartment_id == apartment_id,
            Tenant.contract_end.is_(None),
        )
    )
    if active_tenant is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Apartment already has an active tenant",
        )

    _ensure_contract_does_not_overlap(session, apartment_id, payload)
    tenant = Tenant(apartment_id=apartment_id, **payload.model_dump())
    session.add(tenant)
    _commit_tenant(session)
    return tenant


@router.put("/api/tenants/{tenant_id}", response_model=TenantOut)
def update_tenant(
    tenant_id: int,
    payload: TenantIn,
    session: Session = Depends(get_write_db),
) -> Tenant:
    tenant = _get_tenant(session, tenant_id)
    if payload.contract_end is None:
        other_active_tenant = session.scalar(
            select(Tenant).where(
                Tenant.apartment_id == tenant.apartment_id,
                Tenant.contract_end.is_(None),
                Tenant.id != tenant.id,
            )
        )
        if other_active_tenant is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Apartment already has an active tenant",
            )
    _ensure_contract_does_not_overlap(
        session,
        tenant.apartment_id,
        payload,
        tenant.id,
    )
    for field, value in payload.model_dump().items():
        setattr(tenant, field, value)
    _commit_tenant(session)
    return tenant


@router.post("/api/tenants/{tenant_id}/end-contract", response_model=TenantOut)
def end_contract(
    tenant_id: int,
    payload: TenantEndContract,
    session: Session = Depends(get_write_db),
) -> Tenant:
    tenant = _get_tenant(session, tenant_id)
    if tenant.contract_end is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Tenant contract is already ended",
        )
    if payload.contract_end < tenant.contract_start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="contract_end must be on or after contract_start",
        )

    tenant.contract_end = payload.contract_end
    session.commit()
    return tenant


@router.delete(
    "/api/tenants/{tenant_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_tenant(
    tenant_id: int,
    request: Request,
    session: Session = Depends(get_write_db),
) -> Response:
    uploads_dir = request.app.state.settings.uploads_dir
    pending_deletions = pending_tenant_file_deletions(uploads_dir, tenant_id)
    tenant = session.get(Tenant, tenant_id)
    if tenant is None:
        if not pending_deletions:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tenant not found",
            )
        for staged in pending_deletions:
            delete_staged_tenant_files(uploads_dir, staged)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    staged = stage_tenant_files(uploads_dir, tenant_id)
    if staged is not None:
        pending_deletions.append(staged)
    session.delete(tenant)
    try:
        session.commit()
    except Exception:
        session.rollback()
        if staged is not None:
            restore_staged_tenant_files(uploads_dir, tenant_id, staged)
        raise
    for staged in pending_deletions:
        delete_staged_tenant_files(uploads_dir, staged)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/api/tenants/{tenant_id}/attachments",
    response_model=list[TenantAttachmentOut],
    status_code=status.HTTP_201_CREATED,
)
def upload_attachments(
    tenant_id: int,
    request: Request,
    files: list[UploadFile] = File(...),
    session: Session = Depends(get_write_db),
) -> list[TenantAttachment]:
    _get_tenant(session, tenant_id)
    if not files:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="At least one attachment is required",
        )
    if len(files) > MAX_ATTACHMENT_FILES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"No more than {MAX_ATTACHMENT_FILES} attachments are allowed per request",
        )

    prepared_files: list[tuple[UploadFile, str, bytes]] = []
    try:
        for file in files:
            content_type = validate_file_type(file.filename or "", file.content_type)
            content = file.file.read(MAX_ATTACHMENT_SIZE + 1)
            if len(content) > MAX_ATTACHMENT_SIZE:
                raise HTTPException(
                    status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                    detail="Attachment exceeds 10 MB",
                )
            prepared_files.append((file, content_type, content))
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=str(error),
        ) from error

    saved_paths = []
    attachments = []
    try:
        for file, content_type, content in prepared_files:
            stored_name, saved_path = save_attachment(
                request.app.state.settings.uploads_dir,
                tenant_id,
                content_type,
                content,
            )
            saved_paths.append(saved_path)
            attachment = TenantAttachment(
                tenant_id=tenant_id,
                original_name=file.filename,
                stored_name=stored_name,
                content_type=content_type,
                size_bytes=len(content),
            )
            session.add(attachment)
            attachments.append(attachment)
        session.commit()
    except Exception:
        session.rollback()
        for path in saved_paths:
            path.unlink(missing_ok=True)
        raise
    return attachments


@router.get(
    "/api/tenants/{tenant_id}/attachments",
    response_model=list[TenantAttachmentOut],
)
def list_attachments(
    tenant_id: int,
    session: Session = Depends(get_db),
) -> list[TenantAttachment]:
    _get_tenant(session, tenant_id)
    return list(
        session.scalars(
            select(TenantAttachment)
            .where(TenantAttachment.tenant_id == tenant_id)
            .order_by(TenantAttachment.uploaded_at.desc(), TenantAttachment.id.desc())
        ).all()
    )


@router.get("/api/attachments/{attachment_id}", response_class=FileResponse)
def download_attachment(
    attachment_id: int,
    request: Request,
    session: Session = Depends(get_db),
) -> FileResponse:
    attachment = _get_attachment(session, attachment_id)
    try:
        path = attachment_path(
            request.app.state.settings.uploads_dir,
            attachment.tenant_id,
            attachment.stored_name,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attachment file not found",
        ) from error
    if not path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attachment file not found",
        )
    return FileResponse(
        path,
        media_type=attachment.content_type,
        filename=attachment.original_name,
        content_disposition_type="inline",
    )


@router.delete(
    "/api/attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_attachment(
    attachment_id: int,
    request: Request,
    session: Session = Depends(get_write_db),
) -> Response:
    attachment = _get_attachment(session, attachment_id)
    tenant_id = attachment.tenant_id
    stored_name = attachment.stored_name
    session.delete(attachment)
    try:
        session.commit()
    except Exception:
        session.rollback()
        raise
    try:
        delete_attachment(
            request.app.state.settings.uploads_dir,
            tenant_id,
            stored_name,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attachment file not found",
        ) from error
    return Response(status_code=status.HTTP_204_NO_CONTENT)
