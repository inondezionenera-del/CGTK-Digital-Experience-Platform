from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.database import get_db
from src.exceptions import ForbiddenError
from src.modules.participants.models import Participant
from src.modules.qr.models import QRCredential
from src.modules.qr.schemas import QRCredentialResponse
from src.security.auth import get_current_account_id

router = APIRouter(prefix="/v1/me/qr", tags=["qr"])


@router.get("", response_model=QRCredentialResponse)
def get_my_qr(account_id: UUID = Depends(get_current_account_id), db: Session = Depends(get_db)):
    """Read-only. This never issues a credential — if a Participant is
    ACTIVE but somehow has no QR row, that's a bug to investigate
    (broken invariant), not something to paper over here.
    """
    participant = db.execute(
        select(Participant).where(Participant.account_id == account_id)
    ).scalar_one_or_none()
    if participant is None:
        raise ForbiddenError("No active participant for this account")

    qr = db.execute(
        select(QRCredential).where(QRCredential.participant_id == participant.id)
    ).scalar_one_or_none()
    if qr is None:
        raise ForbiddenError("No active participant for this account")

    return QRCredentialResponse(credential_value=qr.credential_value)
