from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.database import get_db
from src.modules.attendance import service
from src.modules.attendance.schemas import ScanRequest, ScanResponse
from src.security.authz import require_permission

router = APIRouter(prefix="/v1/scanner", tags=["scanner"])


@router.post("/attendance/scan", response_model=ScanResponse)
def scan_attendance(
    payload: ScanRequest,
    db: Session = Depends(get_db),
    staff_account_id: UUID = Depends(require_permission("qr.scan.attendance")),
):
    result = service.scan_for_attendance(
        db, credential_value=payload.credential_value, staff_account_id=str(staff_account_id)
    )
    db.commit()
    return ScanResponse(result=result.status, display_name=result.display_name)
