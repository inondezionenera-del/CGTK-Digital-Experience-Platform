import json
import uuid

import pytest

from src.modules.payments.gateway import MockPaymentGateway, SignatureVerificationError


@pytest.fixture
def gateway() -> MockPaymentGateway:
    return MockPaymentGateway(webhook_secret="test-secret")


def test_create_order_is_dynamic_per_payment(gateway):
    order_a = gateway.create_order(payment_id=uuid.uuid4(), amount=150_000)
    order_b = gateway.create_order(payment_id=uuid.uuid4(), amount=150_000)

    # OD-5 SETTLED: dynamic QRIS per Payment — two orders must never
    # collapse to the same reference/QR payload even with identical amount.
    assert order_a.gateway_reference != order_b.gateway_reference
    assert order_a.qr_payload != order_b.qr_payload


def test_valid_signature_is_accepted(gateway):
    payload = json.dumps({"event_id": "evt-1", "gateway_reference": "ref-1", "status": "SUCCESS"}).encode()
    signature = gateway.sign(payload)

    gateway.verify_webhook_signature(payload=payload, signature_header=signature)  # must not raise


def test_invalid_signature_is_rejected(gateway):
    payload = json.dumps({"event_id": "evt-1", "gateway_reference": "ref-1", "status": "SUCCESS"}).encode()

    with pytest.raises(SignatureVerificationError):
        gateway.verify_webhook_signature(payload=payload, signature_header="not-the-right-signature")


def test_query_status_reflects_simulated_gateway_state(gateway):
    order = gateway.create_order(payment_id=uuid.uuid4(), amount=150_000)
    assert gateway.query_status(order.gateway_reference).status == "PENDING"

    gateway._simulate_gateway_marks_paid(order.gateway_reference)
    assert gateway.query_status(order.gateway_reference).status == "SUCCESS"
