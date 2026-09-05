import json
import uuid

from src.config import get_settings
from src.modules.payments.gateway import MockPaymentGateway
from src.modules.payments.models import Payment, PaymentMethod
from src.modules.registration.service import create_registration


def _gateway() -> MockPaymentGateway:
    return MockPaymentGateway(webhook_secret=get_settings().payment_gateway_webhook_secret)


def _make_qris_payment(client, db):
    reg = create_registration(db, full_name="Andi", contact_email="andi@example.com")
    db.commit()
    resp = client.post(f"/v1/registrations/{reg.id}/payments", json={"method": "QRIS"})
    assert resp.status_code == 201, resp.text
    payment_id = uuid.UUID(resp.json()["id"])
    payment = db.get(Payment, payment_id)
    return payment


def test_webhook_rejects_bad_signature(client, db):
    payment = _make_qris_payment(client, db)
    body = json.dumps(
        {"event_id": "evt-1", "gateway_reference": payment.gateway_reference, "status": "SUCCESS"}
    ).encode()

    resp = client.post(
        "/v1/webhooks/payment-gateway", content=body, headers={"X-Signature": "not-valid"}
    )
    assert resp.status_code == 400
    db.refresh(payment)
    assert payment.status.value == "PENDING"


def test_webhook_confirms_payment_with_valid_signature(client, db):
    payment = _make_qris_payment(client, db)
    gateway = _gateway()
    body = json.dumps(
        {"event_id": "evt-42", "gateway_reference": payment.gateway_reference, "status": "SUCCESS"}
    ).encode()
    signature = gateway.sign(body)

    resp = client.post("/v1/webhooks/payment-gateway", content=body, headers={"X-Signature": signature})
    assert resp.status_code == 200
    db.refresh(payment)
    assert payment.status.value == "PAID"


def test_duplicate_webhook_event_id_is_a_noop(client, db):
    payment = _make_qris_payment(client, db)
    gateway = _gateway()
    body = json.dumps(
        {"event_id": "evt-dup", "gateway_reference": payment.gateway_reference, "status": "SUCCESS"}
    ).encode()
    signature = gateway.sign(body)

    first = client.post("/v1/webhooks/payment-gateway", content=body, headers={"X-Signature": signature})
    second = client.post("/v1/webhooks/payment-gateway", content=body, headers={"X-Signature": signature})
    assert first.status_code == second.status_code == 200

    from src.modules.participants.models import Participant

    assert db.query(Participant).filter_by(registration_id=payment.registration_id).count() == 1
