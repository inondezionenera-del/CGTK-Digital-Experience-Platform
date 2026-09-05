from uuid import UUID

from sqlalchemy.orm import Session

from src.exceptions import NotFoundError, ValidationFailedError
from src.modules.audit.models import ActorType, Sensitivity
from src.modules.audit.service import record_event
from src.modules.participants.models import Participant


def update_participant(
    db: Session, *, participant_id: UUID, actor_id: str, reason: str, display_name: str | None
) -> Participant:
    if not reason or not reason.strip():
        raise ValidationFailedError("Reason is mandatory for administrative participant changes")

    participant = db.get(Participant, participant_id)
    if participant is None:
        raise NotFoundError(f"Participant {participant_id} not found")

    before = participant.display_name
    if display_name is not None:
        participant.display_name = display_name

    record_event(
        db,
        event_name="participant.updated",
        actor_type=ActorType.HUMAN,
        actor_identifier=actor_id,
        target_type="participant",
        target_id=str(participant.id),
        sensitivity=Sensitivity.MEDIUM,
        reason=reason,
        state_transition=f"display_name:{before!r}->{participant.display_name!r}",
    )
    return participant
