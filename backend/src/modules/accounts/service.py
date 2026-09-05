from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.exceptions import UnauthorizedError
from src.modules.accounts.models import Account
from src.modules.participants.models import Participant
from src.modules.registration.models import Registration


def resolve_login(db: Session, *, registration_code: str, contact: str) -> UUID:
    """Placeholder for OD-2. There's no password to check yet — an
    Account only exists once payment has gone through (Model B), so
    proving you know the registration code + contact used at signup is
    enough to hand back the account id for now. Replace this whole
    function once OD-2 is actually decided; nothing that calls it should
    need to change.
    """
    registration = db.execute(
        select(Registration).where(Registration.registration_code == registration_code)
    ).scalar_one_or_none()

    if registration is None or contact not in (registration.contact_email, registration.contact_phone):
        raise UnauthorizedError("Invalid credentials")

    if registration.account_id is None:
        raise UnauthorizedError("Invalid credentials")

    return registration.account_id


def get_account_or_raise(db: Session, account_id: UUID) -> Account:
    account = db.get(Account, account_id)
    if account is None:
        raise UnauthorizedError("Invalid credentials")
    return account


def get_participant_for_account(db: Session, account_id: UUID) -> Participant | None:
    return db.execute(select(Participant).where(Participant.account_id == account_id)).scalar_one_or_none()
