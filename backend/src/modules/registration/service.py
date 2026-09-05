import secrets
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.exceptions import StateConflictError, ValidationFailedError
from src.modules.audit.models import ActorType, Sensitivity
from src.modules.audit.service import record_event
from src.modules.registration.models import Registration, RegistrationStatus


def _generate_registration_code() -> str:
    """Placeholder format — CGTK-<random hex>, not a settled convention."""
    return f"CGTK-{secrets.token_hex(3).upper()}"


def create_registration(
    db: Session,
    *,
    full_name: str,
    contact_email: str | None = None,
    contact_phone: str | None = None,
) -> Registration:
    """Just Registration + code. Never touches Account."""
    if not contact_email and not contact_phone:
        raise ValidationFailedError("Provide at least an email or a phone number")

    registration = Registration(
        registration_code=_generate_registration_code(),
        full_name=full_name,
        contact_email=contact_email,
        contact_phone=contact_phone,
    )
    db.add(registration)
    db.flush()
    return registration


def find_registration_by_code_and_contact(
    db: Session, *, registration_code: str, contact: str
) -> Registration | None:
    """Public lookup path. Deliberately returns None for both "no such
    code" and "code exists but contact doesn't match" — the caller must
    not let those two cases produce different responses, or the lookup
    becomes an oracle for guessing valid codes.
    """
    registration = db.execute(
        select(Registration).where(Registration.registration_code == registration_code)
    ).scalar_one_or_none()

    if registration is None:
        return None
    if contact not in (registration.contact_email, registration.contact_phone):
        return None
    return registration


def cancel_registration(
    db: Session, *, registration_id: UUID, actor_id: str, actor_type: ActorType, reason: str | None = None
) -> Registration:
    registration = db.get(Registration, registration_id)
    if registration is None:
        from src.exceptions import NotFoundError

        raise NotFoundError(f"Registration {registration_id} not found")

    if registration.status != RegistrationStatus.PENDING_PAYMENT:
        raise StateConflictError(
            f"Registration {registration_id} is {registration.status}, cannot cancel"
        )

    registration.status = RegistrationStatus.CANCELLED

    record_event(
        db,
        event_name="registration.cancelled",
        actor_type=actor_type,
        actor_identifier=actor_id,
        target_type="registration",
        target_id=str(registration.id),
        sensitivity=Sensitivity.MEDIUM,
        reason=reason,
        state_transition="PENDING_PAYMENT->CANCELLED",
    )
    return registration
