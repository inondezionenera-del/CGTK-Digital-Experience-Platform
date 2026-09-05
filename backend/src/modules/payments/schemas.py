from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from src.modules.payments.models import PaymentMethod, PaymentStatus


class PaymentCreateRequest(BaseModel):
    method: PaymentMethod


class PaymentResponse(BaseModel):
    id: UUID
    registration_id: UUID
    method: PaymentMethod
    status: PaymentStatus
    amount: float
    expires_at: datetime | None
    qr_payload: str | None = None  # only set for a freshly created QRIS attempt


class OverrideRequest(BaseModel):
    reason: str


class RefundRequest(BaseModel):
    reason: str


class WebhookPayload(BaseModel):
    event_id: str
    gateway_reference: str
    status: str
    payment_id: UUID


class RegistrationAdminDetail(BaseModel):
    registration_id: UUID
    registration_code: str
    full_name: str
    registration_status: str
    payments: list[PaymentResponse]
