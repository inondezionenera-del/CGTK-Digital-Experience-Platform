"""Authoritative payment confirmation cascade (2.1/2.4/2.5 SETTLED).

Every confirmation source funnels through confirm_payment() below:
QRIS webhook, reconciliation, cash verification, manual override. This
is the ONLY code path allowed to transition Payment -> PAID,
Registration -> PAID, create an Account, activate a Participant, or
issue a QR credential. No endpoint, no other service function, may
perform any of those five mutations directly.

All five mutations happen in one local DB transaction (2.5 SETTLED
transaction boundary) — the caller controls commit/rollback, this
module only flushes.
"""

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.exceptions import NotFoundError, StateConflictError
from src.modules.accounts.models import Account
from src.modules.audit.models import ActorType, Sensitivity
from src.modules.audit.service import record_event
from src.modules.participants.models import Participant
from src.modules.payments.models import Payment, PaymentConfirmationSource, PaymentStatus
from src.modules.qr.generator import get_qr_credential_generator
from src.modules.qr.models import QRCredential
from src.modules.registration.models import Registration, RegistrationStatus


@dataclass
class ConfirmationOutcome:
    applied: bool  # False = duplicate/no-op confirmation (2.5 Case C)
    payment: Payment
    registration: Registration


def confirm_payment(
    db: Session,
    *,
    payment_id: UUID,
    source: PaymentConfirmationSource,
    source_reference: str,
    system_actor: str,
) -> ConfirmationOutcome:
    payment = db.get(Payment, payment_id)
    if payment is None:
        raise NotFoundError(f"Payment {payment_id} not found")

    # Row-level lock on Registration serializes concurrent confirmation
    # attempts for the same Registration (2.4 SETTLED concurrency
    # design) — this is what prevents the webhook-vs-reconciliation race
    # from producing two PAID payments.
    registration = db.execute(
        select(Registration).where(Registration.id == payment.registration_id).with_for_update()
    ).scalar_one()

    db.refresh(payment)  # avoid acting on a stale read taken before the lock

    existing_paid = db.execute(
        select(Payment).where(
            Payment.registration_id == registration.id,
            Payment.status == PaymentStatus.PAID,
        )
    ).scalar_one_or_none()

    if existing_paid is not None:
        # Duplicate/no-op confirmation — semantically distinct from a
        # successful transition (2.8 SETTLED patch #2): invocation was
        # valid, no new business state transition occurred.
        record_event(
            db,
            event_name="payment.confirmation_noop",
            actor_type=ActorType.SYSTEM,
            actor_identifier=system_actor,
            target_type="payment",
            target_id=str(payment.id),
            sensitivity=Sensitivity.HIGH,
            source_reference=source_reference,
            correlation_reference=str(existing_paid.id),
        )
        return ConfirmationOutcome(applied=False, payment=existing_paid, registration=registration)

    if payment.status != PaymentStatus.PENDING:
        raise StateConflictError(
            f"Payment {payment.id} is {payment.status}, cannot confirm (expected PENDING)"
        )

    payment.status = PaymentStatus.PAID
    payment.confirmation_source = source
    payment.confirmation_reference = source_reference

    registration.status = RegistrationStatus.PAID

    # Account creation — OD-1 SETTLED (Model B): only here, only now.
    # Independent domain object from Participant (no formal equivalence).
    if registration.account_id is None:
        account = Account(registration_id=registration.id)
        db.add(account)
        db.flush()
        registration.account_id = account.id
    else:
        account = db.get(Account, registration.account_id)

    participant = Participant(
        registration_id=registration.id,
        account_id=account.id,
        display_name=registration.full_name,
    )
    db.add(participant)
    db.flush()

    qr = QRCredential(
        participant_id=participant.id,
        credential_value=get_qr_credential_generator().generate(),
    )
    db.add(qr)
    db.flush()

    record_event(
        db,
        event_name="payment.confirmed",
        actor_type=ActorType.SYSTEM,
        actor_identifier=system_actor,
        target_type="payment",
        target_id=str(payment.id),
        sensitivity=Sensitivity.HIGH,
        source_reference=source_reference,
        state_transition="PENDING->PAID",
    )
    record_event(
        db,
        event_name="participant.activated",
        actor_type=ActorType.SYSTEM,
        actor_identifier=system_actor,
        target_type="participant",
        target_id=str(participant.id),
        sensitivity=Sensitivity.HIGH,
        correlation_reference=str(payment.id),
    )
    record_event(
        db,
        event_name="qr_credential.issued",
        actor_type=ActorType.SYSTEM,
        actor_identifier=system_actor,
        target_type="qr_credential",
        target_id=str(qr.id),
        sensitivity=Sensitivity.HIGH,
        correlation_reference=str(participant.id),
    )

    return ConfirmationOutcome(applied=True, payment=payment, registration=registration)
