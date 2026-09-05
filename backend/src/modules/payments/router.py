from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.database import get_db
from src.exceptions import ForbiddenError, ValidationFailedError
from src.modules.payments import service as payments_service
from src.modules.payments.entrypoints import (
    cash_verify_payment,
    confirm_payment_from_webhook,
    override_payment,
)
from src.modules.payments.gateway import SignatureVerificationError, get_payment_gateway
from src.modules.payments.models import Payment
from src.modules.payments.schemas import (
    OverrideRequest,
    PaymentCreateRequest,
    PaymentResponse,
    RefundRequest,
    RegistrationAdminDetail,
)
from src.modules.registration.models import Registration
from src.security.auth import get_current_account_id
from src.security.authz import require_permission

router = APIRouter(prefix="/v1", tags=["payments"])


def _to_response(payment: Payment, qr_payload: str | None = None) -> PaymentResponse:
    return PaymentResponse(
        id=payment.id,
        registration_id=payment.registration_id,
        method=payment.method,
        status=payment.status,
        amount=float(payment.amount),
        expires_at=payment.expires_at,
        qr_payload=qr_payload,
    )


@router.post("/registrations/{registration_id}/payments", response_model=PaymentResponse, status_code=201)
def create_payment(registration_id: UUID, payload: PaymentCreateRequest, db: Session = Depends(get_db)):
    payment, qr_payload = payments_service.create_payment_attempt(
        db, registration_id=registration_id, method=payload.method
    )
    db.commit()
    return _to_response(payment, qr_payload)


@router.post("/webhooks/payment-gateway", status_code=200)
async def payment_webhook(request: Request, db: Session = Depends(get_db)):
    gateway = get_payment_gateway()
    raw_body = await request.body()
    signature = request.headers.get("X-Signature", "")

    try:
        gateway.verify_webhook_signature(payload=raw_body, signature_header=signature)
    except SignatureVerificationError:
        # No trust extended, nothing processed — respond non-2xx so this
        # never looks like a successful ack.
        raise ValidationFailedError("Invalid webhook signature")

    event = gateway.parse_webhook_event(raw_body)
    if event.status != "SUCCESS":
        return {"received": True}

    payment = db.execute(
        select(Payment).where(Payment.gateway_reference == event.gateway_reference)
    ).scalar_one_or_none()
    if payment is None:
        raise ValidationFailedError("Unknown gateway_reference")

    confirm_payment_from_webhook(
        db,
        gateway_identifier=event.gateway_identifier,
        event_id=event.event_id,
        payment_id=payment.id,
        source_reference=event.event_id,
    )
    db.commit()
    return {"received": True}


@router.post("/admin/payments/{payment_id}/cash-verify", response_model=PaymentResponse)
def cash_verify(
    payment_id: UUID,
    db: Session = Depends(get_db),
    staff_account_id: UUID = Depends(require_permission("payment.cash.verify")),
):
    outcome = cash_verify_payment(db, payment_id=payment_id, staff_account_id=str(staff_account_id))
    db.commit()
    return _to_response(outcome.payment)


@router.post("/admin/payments/{payment_id}/override", response_model=PaymentResponse)
def override(
    payment_id: UUID,
    payload: OverrideRequest,
    db: Session = Depends(get_db),
    staff_account_id: UUID = Depends(require_permission("payment.override")),
):
    outcome = override_payment(
        db, payment_id=payment_id, super_admin_account_id=str(staff_account_id), reason=payload.reason
    )
    db.commit()
    return _to_response(outcome.payment)


@router.post("/admin/payments/{payment_id}/refund", response_model=PaymentResponse)
def refund(
    payment_id: UUID,
    payload: RefundRequest,
    db: Session = Depends(get_db),
    staff_account_id: UUID = Depends(require_permission("payment.refund")),
):
    payment = payments_service.refund_payment(
        db, payment_id=payment_id, actor_id=str(staff_account_id), reason=payload.reason
    )
    db.commit()
    return _to_response(payment)


@router.get("/me/payment", response_model=PaymentResponse)
def get_my_payment(account_id: UUID = Depends(get_current_account_id), db: Session = Depends(get_db)):
    registration = db.execute(
        select(Registration).where(Registration.account_id == account_id)
    ).scalar_one()
    payment = db.execute(
        select(Payment)
        .where(Payment.registration_id == registration.id)
        .order_by(Payment.created_at.desc())
    ).scalars().first()
    if payment is None:
        raise ForbiddenError("No payment found for this account")
    return _to_response(payment)


@router.get(
    "/admin/registrations/{registration_id}",
    response_model=RegistrationAdminDetail,
    dependencies=[Depends(require_permission("registration.read_any")), Depends(require_permission("payment.read_any"))],
)
def get_registration_admin_detail(registration_id: UUID, db: Session = Depends(get_db)):
    registration = db.get(Registration, registration_id)
    if registration is None:
        raise ForbiddenError("Registration not found")
    payments = db.execute(
        select(Payment).where(Payment.registration_id == registration_id)
    ).scalars().all()
    return RegistrationAdminDetail(
        registration_id=registration.id,
        registration_code=registration.registration_code,
        full_name=registration.full_name,
        registration_status=registration.status.value,
        payments=[_to_response(p) for p in payments],
    )
