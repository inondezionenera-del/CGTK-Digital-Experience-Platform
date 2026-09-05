"""Payment gateway integration boundary (OD-4 OPEN, OD-5 SETTLED: dynamic
QRIS per Payment is mandatory).

Everything in app/modules/payments/{confirmation,entrypoints,service}.py
is written against this interface, never against a specific vendor SDK.
Swapping providers later means writing one new class here and changing
one config value (settings.payment_gateway_adapter) — nothing else in
the domain core should need to change.
"""

import hashlib
import hmac
import json
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Protocol
from uuid import UUID

from src.config import get_settings


@dataclass
class GatewayOrder:
    """Result of creating a dynamic per-Payment order with the gateway."""

    gateway_reference: str
    qr_payload: str  # what actually gets rendered as a QR code to the participant
    expires_at: datetime | None


@dataclass
class GatewayWebhookEvent:
    gateway_identifier: str
    event_id: str
    gateway_reference: str
    status: str  # "SUCCESS" | "FAILED"


class SignatureVerificationError(Exception):
    pass


class PaymentGateway(Protocol):
    identifier: str

    def create_order(self, *, payment_id: UUID, amount: float) -> GatewayOrder: ...

    def verify_webhook_signature(self, *, payload: bytes, signature_header: str) -> None:
        """Must raise SignatureVerificationError if invalid. Called BEFORE
        any webhook payload is trusted (2.1/2.7 SETTLED)."""
        ...

    def parse_webhook_event(self, payload: bytes) -> GatewayWebhookEvent: ...

    def query_status(self, gateway_reference: str) -> GatewayWebhookEvent | None:
        """Reconciliation backup (2.1 SETTLED) — returns the current known
        status for an order, or None if unknown to the gateway."""
        ...


class MockPaymentGateway:
    """Placeholder adapter for OD-4 (no provider selected yet). Signs
    webhook payloads with HMAC-SHA256 using the configured shared secret
    so signature-verification code can be exercised realistically
    without depending on any real vendor.

    NOT a production gateway — has no real payment rail behind it.
    """

    identifier = "mock"

    def __init__(self, webhook_secret: str) -> None:
        self._webhook_secret = webhook_secret.encode()
        self._orders: dict[str, dict] = {}

    def create_order(self, *, payment_id: UUID, amount: float) -> GatewayOrder:
        gateway_reference = f"mock-order-{secrets.token_hex(8)}"
        self._orders[gateway_reference] = {
            "payment_id": str(payment_id),
            "amount": amount,
            "status": "PENDING",
        }
        return GatewayOrder(
            gateway_reference=gateway_reference,
            qr_payload=f"MOCKQRIS|{gateway_reference}|{amount}",
            expires_at=None,
        )

    def sign(self, payload: bytes) -> str:
        """Test/dev helper to produce a valid signature for a given
        payload — a real gateway would sign server-side; this exists so
        tests can simulate an authentic webhook call end-to-end."""
        return hmac.new(self._webhook_secret, payload, hashlib.sha256).hexdigest()

    def verify_webhook_signature(self, *, payload: bytes, signature_header: str) -> None:
        expected = self.sign(payload)
        if not hmac.compare_digest(expected, signature_header):
            raise SignatureVerificationError("Invalid webhook signature")

    def parse_webhook_event(self, payload: bytes) -> GatewayWebhookEvent:
        data = json.loads(payload)
        return GatewayWebhookEvent(
            gateway_identifier=self.identifier,
            event_id=data["event_id"],
            gateway_reference=data["gateway_reference"],
            status=data["status"],
        )

    def query_status(self, gateway_reference: str) -> GatewayWebhookEvent | None:
        order = self._orders.get(gateway_reference)
        if order is None:
            return None
        return GatewayWebhookEvent(
            gateway_identifier=self.identifier,
            event_id=f"reconcile-{gateway_reference}",
            gateway_reference=gateway_reference,
            status=order["status"],
        )

    def _simulate_gateway_marks_paid(self, gateway_reference: str) -> None:
        """Test-only helper — a real gateway has no such method."""
        if gateway_reference in self._orders:
            self._orders[gateway_reference]["status"] = "SUCCESS"


def get_payment_gateway() -> PaymentGateway:
    settings = get_settings()
    if settings.payment_gateway_adapter == "mock":
        return MockPaymentGateway(webhook_secret=settings.payment_gateway_webhook_secret)
    raise ValueError(
        f"Unknown payment_gateway_adapter '{settings.payment_gateway_adapter}' "
        "(OD-4 not yet settled — only 'mock' is implemented)"
    )
