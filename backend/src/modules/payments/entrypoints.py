"""Per-source entrypoints into the authoritative confirmation cascade.

Each source has different event semantics (2.8 SETTLED):
- Human-triggered (cash verify, override): the human action event is
  recorded regardless of outcome; the system "confirmed" event is
  recorded only if a real state transition happened. A SAVEPOINT keeps
  the human event even when confirm_payment() rejects the attempt as a
  legitimate business state-conflict (e.g. payment already resolved).
- System-triggered (webhook, reconciliation): no human event; technical
  dedup (Webhook/Event Dedup Record) is checked BEFORE calling
  confirm_payment, distinct from AuditEvent (2.8 SETTLED distinction).
"""

from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.exceptions import StateConflictError, ValidationFailedError
from src.modules.audit.models import ActorType, Sensitivity, WebhookDedupRecord
from src.modules.audit.service import record_event
from src.modules.payments.confirmation import ConfirmationOutcome, confirm_payment
from src.modules.payments.models import Payment, PaymentConfirmationSource
from src.modules.registration.models import Registration


def _claim_dedup_slot(db: Session, *, gateway_identifier: str, event_id: str) -> WebhookDedupRecord | None:
    """Insert-first claim on (gateway_identifier, event_id): the unique
    constraint is the actual dedup gate, not the SELECT before it — two
    concurrent deliveries of the same event racing each other resolve
    here instead of both slipping past a check-then-insert window and
    later colliding on commit.
    """
    record = WebhookDedupRecord(gateway_identifier=gateway_identifier, event_id=event_id, outcome="pending")
    try:
        with db.begin_nested():
            db.add(record)
            db.flush()
    except IntegrityError:
        return None
    return record


def _fallback_outcome(db: Session, payment_id: UUID) -> ConfirmationOutcome:
    payment = db.get(Payment, payment_id)
    registration = db.get(Registration, payment.registration_id)
    return ConfirmationOutcome(applied=False, payment=payment, registration=registration)


def cash_verify_payment(db: Session, *, payment_id: UUID, staff_account_id: str) -> ConfirmationOutcome:
    """Endpoint: POST /v1/admin/payments/{id}/cash-verify. Requires
    permission payment.cash.verify (2.6 SETTLED) — enforced by the API
    layer, not here.
    """
    record_event(
        db,
        event_name="payment.cash_verified",
        actor_type=ActorType.HUMAN,
        actor_identifier=staff_account_id,
        target_type="payment",
        target_id=str(payment_id),
        sensitivity=Sensitivity.HIGH,
    )
    try:
        with db.begin_nested():
            return confirm_payment(
                db,
                payment_id=payment_id,
                source=PaymentConfirmationSource.CASH_VERIFICATION,
                source_reference=staff_account_id,
                system_actor="confirmation_orchestrator",
            )
    except StateConflictError:
        return _fallback_outcome(db, payment_id)


def override_payment(
    db: Session, *, payment_id: UUID, super_admin_account_id: str, reason: str
) -> ConfirmationOutcome:
    """Endpoint: POST /v1/admin/payments/{id}/override. Requires
    permission payment.override (SUPER_ADMIN only, 2.6 SETTLED). Reason
    is mandatory (2.7/2.8 SETTLED) — does NOT bypass any invariant
    enforced by confirm_payment().
    """
    if not reason or not reason.strip():
        raise ValidationFailedError("Override reason is mandatory")

    record_event(
        db,
        event_name="payment.overridden",
        actor_type=ActorType.HUMAN,
        actor_identifier=super_admin_account_id,
        target_type="payment",
        target_id=str(payment_id),
        sensitivity=Sensitivity.HIGH,
        reason=reason,
    )
    try:
        with db.begin_nested():
            return confirm_payment(
                db,
                payment_id=payment_id,
                source=PaymentConfirmationSource.OVERRIDE,
                source_reference=super_admin_account_id,
                system_actor="confirmation_orchestrator",
            )
    except StateConflictError:
        return _fallback_outcome(db, payment_id)


def confirm_payment_from_webhook(
    db: Session,
    *,
    gateway_identifier: str,
    event_id: str,
    payment_id: UUID,
    source_reference: str,
) -> ConfirmationOutcome | None:
    """Endpoint: POST /v1/webhooks/payment-gateway. Signature
    verification happens at the API boundary before this is ever called
    (2.1/2.7 SETTLED) — this function assumes the caller is trusted.

    Returns None if the event_id was already claimed by another delivery
    of the same event (pure technical dedup no-op, distinct from a
    business-level confirmation no-op).
    """
    dedup_record = _claim_dedup_slot(db, gateway_identifier=gateway_identifier, event_id=event_id)
    if dedup_record is None:
        return None

    outcome = confirm_payment(
        db,
        payment_id=payment_id,
        source=PaymentConfirmationSource.WEBHOOK,
        source_reference=source_reference,
        system_actor="webhook_confirmation",
    )
    dedup_record.outcome = "applied" if outcome.applied else "noop"
    return outcome


def confirm_payment_from_reconciliation(
    db: Session,
    *,
    gateway_identifier: str,
    event_id: str,
    payment_id: UUID,
    source_reference: str,
) -> ConfirmationOutcome | None:
    """Reconciliation job backup path (2.1 SETTLED) — same technical
    dedup ledger as webhook, since both are system-triggered sources
    reporting the same kind of gateway fact.
    """
    dedup_record = _claim_dedup_slot(db, gateway_identifier=gateway_identifier, event_id=event_id)
    if dedup_record is None:
        return None

    outcome = confirm_payment(
        db,
        payment_id=payment_id,
        source=PaymentConfirmationSource.RECONCILIATION,
        source_reference=source_reference,
        system_actor="reconciliation_job",
    )
    dedup_record.outcome = "applied" if outcome.applied else "noop"
    return outcome
