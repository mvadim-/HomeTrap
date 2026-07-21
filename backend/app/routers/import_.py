from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.auth import get_db, require_auth
from app.models import Apartment
from app.schemas import ImportReportResponse
from app.services.importer import ImportFormatError, import_xlsx
from app.services.storage import coordinated_write

router = APIRouter(tags=["import"], dependencies=[Depends(require_auth)])


@router.post(
    "/api/apartments/{apartment_id}/import",
    response_model=ImportReportResponse,
    status_code=status.HTTP_200_OK,
)
@coordinated_write
def import_history(
    apartment_id: int,
    file: UploadFile = File(...),
    dry_run: bool = Query(default=False),
    session: Session = Depends(get_db),
) -> ImportReportResponse:
    apartment = session.get(Apartment, apartment_id)
    if apartment is None:
        raise HTTPException(status_code=404, detail="Apartment not found")
    if not file.filename or not file.filename.casefold().endswith(".xlsx"):
        raise HTTPException(status_code=422, detail="Only XLSX files are supported")
    try:
        report = import_xlsx(session, apartment, file.file.read(), dry_run=dry_run)
    except ImportFormatError as error:
        session.rollback()
        raise HTTPException(status_code=422, detail=str(error)) from error
    return ImportReportResponse.model_validate(report, from_attributes=True)
