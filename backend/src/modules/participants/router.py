from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.database import get_db
from src.modules.participants import service
from src.modules.participants.schemas import ParticipantResponse, ParticipantUpdateRequest
from src.security.authz import require_permission

router = APIRouter(prefix="/v1/admin/participants", tags=["participants-admin"])


@router.patch("/{participant_id}", response_model=ParticipantResponse)
def update_participant(
    participant_id: UUID,
    payload: ParticipantUpdateRequest,
    db: Session = Depends(get_db),
    admin_account_id: UUID = Depends(require_permission("participant.manage")),
):
    participant = service.update_participant(
        db,
        participant_id=participant_id,
        actor_id=str(admin_account_id),
        reason=payload.reason,
        display_name=payload.display_name,
    )
    db.commit()
    return ParticipantResponse(
        id=participant.id,
        registration_id=participant.registration_id,
        account_id=participant.account_id,
        status=participant.status.value,
    )
