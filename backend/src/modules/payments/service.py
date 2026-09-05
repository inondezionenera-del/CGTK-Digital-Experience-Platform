import uuid
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.exceptions import NotFoundError, StateConflictError, ValidationFailedError
from src.modules.audit.models import ActorType, Sensitivity
from src.modules.audit.service import record_event
from src.modules.payments.gateway import PaymentGateway, get_payment_gateway
from src.modules.payments.models import Payment, PaymentMethod, PaymentStatus
from src.modules.payments.policy import ExpiryPolicy, FixedWindowExpiryPolicy, FlatPricingPolicy, PricingPolicy
from src.modules.registration.models import Registration, RegistrationStatus


def create_payment_attempt(
    db: Session,
    *,
    registration_id: UUID,
    method: PaymentMethod,
    pricing_policy: PricingPolicy | None = None,
    expiry_policy: ExpiryPolicy | None = None,
    gateway: PaymentGateway | None = None,
) -> tuple[Payment, str | None]:
    """Retrying after FAILED/EXPIRED/CANCELLED always creates a NEW row —
    never reopens an old one. Returns (payment, qr_payload); qr_payload
    is only set for QRIS.
    """
    pricing_policy = pricing_policy or FlatPricingPolicy()
    expiry_policy = expiry_policy or FixedWindowExpiryPolicy()

    registration = db.get(Registration, registration_id)
    if registration is None:
        raise NotFoundError(f"Registration {registration_id} not found")
    if registration.status != RegistrationStatus.PENDING_PAYMENT:
        raise StateConflictError(
            f"Registration {registration_id} is {registration.status}, "
            "cannot accept new payment attempts"
        )

    existing_paid = db.execute(
        select(Payment).where(
            Payment.registration_id == registration_id,
            Payment.status == PaymentStatus.PAID,
        )
    ).scalar_one_or_none()
    if existing_paid is not None:
        raise StateConflictError(f"Registration {registration_id} already has an accepted payment")

    amount = pricing_policy.amount_for(method)
    expires_at = expiry_policy.expires_at_for(method)

    # Call the gateway BEFORE opening any DB write for this attempt —
    # the payment id is generated here so it can be handed to the
    # gateway without an INSERT (and its implicit row lock) sitting open
    # for however long that network call takes. The mock adapter is
    # instant so this doesn't matter today, but it will the moment a
    # real provider (OD-4) is wired in.
    payment_id = uuid.uuid4()
    gateway_reference = None
    qr_payload = None
    if method == PaymentMethod.QRIS:
        gateway = gateway or get_payment_gateway()
        order = gateway.create_order(payment_id=payment_id, amount=float(amount))
        gateway_reference = order.gateway_reference
        if order.expires_at is not None:
            expires_at = order.expires_at
        qr_payload = order.qr_payload

    payment = Payment(
        id=payment_id,
        registration_id=registration_id,
        method=method,
        status=PaymentStatus.PENDING,
        amount=amount,
        expires_at=expires_at,
        gateway_reference=gateway_reference,
    )
    db.add(payment)
    db.flush()

    return payment, qr_payload


def refund_payment(db: Session, *, payment_id: UUID, actor_id: str, reason: str) -> Payment:
    """OD-10 (what a refund does to Registration/Participant/QR) is
    still open — for now this only flips the Payment itself. Access
    doesn't get revoked here; don't add that without OD-10 actually
    being decided.
    """
    if not reason or not reason.strip():
        raise ValidationFailedError("Refund reason is mandatory")

    payment = db.get(Payment, payment_id)
    if payment is None:
        raise NotFoundError(f"Payment {payment_id} not found")
    if payment.status != PaymentStatus.PAID:
        raise StateConflictError(f"Payment {payment_id} is {payment.status}, cannot refund")

    payment.status = PaymentStatus.REFUNDED

    record_event(
        db,
        event_name="payment.refunded",
        actor_type=ActorType.HUMAN,
        actor_identifier=actor_id,
        target_type="payment",
        target_id=str(payment.id),
        sensitivity=Sensitivity.HIGH,
        reason=reason,
        state_transition="PAID->REFUNDED",
    )
    return payment
