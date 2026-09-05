from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.database import get_db
from src.modules.accounts import service
from src.modules.accounts.schemas import LoginRequest, LoginResponse, MeResponse
from src.modules.qr.models import QRCredential
from src.modules.registration.models import Registration
from src.security.auth import get_current_account_id
from src.security.rate_limit import registration_lookup_rate_limiter

router = APIRouter(prefix="/v1", tags=["accounts"])


@router.post("/auth/login", response_model=LoginResponse)
def login(
    payload: LoginRequest,
    db: Session = Depends(get_db),
    _rate_limit: None = Depends(registration_lookup_rate_limiter),
):
    account_id = service.resolve_login(db, registration_code=payload.registration_code, contact=payload.contact)
    # Not a real signed token yet — see accounts/service.py resolve_login.
    return LoginResponse(access_token=str(account_id), account_id=account_id)


@router.get("/me", response_model=MeResponse)
def get_me(account_id: UUID = Depends(get_current_account_id), db: Session = Depends(get_db)):
    account = service.get_account_or_raise(db, account_id)
    registration = db.execute(
        select(Registration).where(Registration.account_id == account.id)
    ).scalar_one()
    participant = service.get_participant_for_account(db, account_id)

    has_qr = False
    if participant is not None:
        has_qr = (
            db.execute(select(QRCredential).where(QRCredential.participant_id == participant.id)).scalar_one_or_none()
            is not None
        )

    return MeResponse(
        account_id=account.id,
        registration_code=registration.registration_code,
        full_name=registration.full_name,
        registration_status=registration.status.value,
        participant_status=participant.status.value if participant else None,
        has_qr=has_qr,
    )
