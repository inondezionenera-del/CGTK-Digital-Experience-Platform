from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.database import get_db
from src.exceptions import NotFoundError
from src.modules.audit.models import ActorType
from src.modules.registration import service
from src.modules.registration.schemas import (
    RegistrationCancelResponse,
    RegistrationCreateRequest,
    RegistrationCreateResponse,
    RegistrationStatusResponse,
)
from src.security.rate_limit import registration_lookup_rate_limiter

router = APIRouter(prefix="/v1/registrations", tags=["registration"])


@router.post("", response_model=RegistrationCreateResponse, status_code=201)
def create_registration(payload: RegistrationCreateRequest, db: Session = Depends(get_db)):
    registration = service.create_registration(
        db,
        full_name=payload.full_name,
        contact_email=payload.contact_email,
        contact_phone=payload.contact_phone,
    )
    db.commit()
    return RegistrationCreateResponse(
        registration_code=registration.registration_code, status=registration.status
    )


@router.get("/{code}", response_model=RegistrationStatusResponse)
def lookup_registration(
    code: str,
    contact: str,
    db: Session = Depends(get_db),
    _rate_limit: None = Depends(registration_lookup_rate_limiter),
):
    registration = service.find_registration_by_code_and_contact(
        db, registration_code=code, contact=contact
    )
    if registration is None:
        # Same error for "no such code" and "wrong contact" on purpose.
        raise NotFoundError("Registration not found")
    return RegistrationStatusResponse(
        registration_code=registration.registration_code,
        status=registration.status,
        full_name=registration.full_name,
    )


@router.post("/{registration_id}/cancel", response_model=RegistrationCancelResponse)
def cancel_registration(registration_id: UUID, db: Session = Depends(get_db)):
    # Self-cancel isn't wired up yet (no participant-facing auth to
    # attribute it to) — this is the admin path only for now.
    registration = service.cancel_registration(
        db,
        registration_id=registration_id,
        actor_id="admin",
        actor_type=ActorType.HUMAN,
    )
    db.commit()
    return RegistrationCancelResponse(
        registration_code=registration.registration_code, status=registration.status
    )
