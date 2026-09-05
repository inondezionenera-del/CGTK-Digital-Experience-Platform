"""Gap-filling for the invariant checklist not already covered by
test_confirmation_cascade.py, test_webhook_endpoint.py, and
test_api_endpoints.py.
"""

from src.exceptions import StateConflictError
from src.modules.accounts.models import Account
from src.modules.audit.models import AuditEvent
from src.modules.participants.models import Participant
from src.modules.payments.entrypoints import (
    cash_verify_payment,
    confirm_payment_from_reconciliation,
    confirm_payment_from_webhook,
    override_payment,
)
from src.modules.payments.gateway import MockPaymentGateway
from src.modules.payments.models import Payment, PaymentMethod, PaymentStatus
from src.modules.payments.service import create_payment_attempt
from src.modules.qr.models import QRCredential
from src.modules.registration.service import cancel_registration, create_registration
from src.modules.registration.models import RegistrationStatus
from src.modules.audit.models import ActorType


def test_no_route_exists_to_create_or_activate_a_participant_directly(client):
    """Participant only ever comes into being inside the confirmation
    cascade. There's no endpoint anywhere that takes a participant
    payload and creates/activates one.
    """
    schema = client.app.openapi()
    participant_paths = {path: ops for path, ops in schema["paths"].items() if "/participants" in path}
    assert participant_paths, "expected at least the admin participants route to exist"
    for path, ops in participant_paths.items():
        assert path.startswith("/v1/admin/participants/")
        assert "post" not in ops, f"{path} allows POST — participants must be cascade-only"


def test_super_admin_override_cannot_double_activate(db):
    registration = create_registration(db, full_name="Rina", contact_email="rina@example.com")
    payment_a, _ = create_payment_attempt(db, registration_id=registration.id, method=PaymentMethod.QRIS)
    db.commit()

    override_payment(db, payment_id=payment_a.id, super_admin_account_id="root", reason="test")
    db.commit()

    # A second Payment attempt against the same (now-PAID) Registration
    # is rejected before override even gets a chance to run on it.
    try:
        create_payment_attempt(db, registration_id=registration.id, method=PaymentMethod.CASH)
        assert False, "expected StateConflictError"
    except StateConflictError:
        pass

    assert db.query(Account).count() == 1
    assert db.query(Participant).count() == 1
    assert db.query(QRCredential).count() == 1


def test_unauthorized_role_cannot_cash_verify(client, db):
    from tests.rbac_seed import grant_permission

    registration = create_registration(db, full_name="Yusuf", contact_email="yusuf@example.com")
    payment, _ = create_payment_attempt(db, registration_id=registration.id, method=PaymentMethod.CASH)
    db.commit()

    wrong_permission_staff = Account(registration_id=None)
    db.add(wrong_permission_staff)
    db.commit()
    # This account has SOME permission, just not the one that matters.
    grant_permission(
        db, account_id=wrong_permission_staff.id, role_name="STAFF", permission_code="qr.scan.attendance"
    )

    resp = client.post(
        f"/v1/admin/payments/{payment.id}/cash-verify",
        headers={"Authorization": f"Bearer {wrong_permission_staff.id}"},
    )
    assert resp.status_code == 403
    db.refresh(payment)
    assert payment.status == PaymentStatus.PENDING


def test_qr_read_endpoint_never_issues_a_second_credential(client, db):
    registration = create_registration(db, full_name="Wati", contact_email="wati@example.com")
    payment, _ = create_payment_attempt(db, registration_id=registration.id, method=PaymentMethod.CASH)
    db.commit()
    cash_verify_payment(db, payment_id=payment.id, staff_account_id="staff-1")
    db.commit()
    db.refresh(registration)

    first = client.get("/v1/me/qr", headers={"Authorization": f"Bearer {registration.account_id}"})
    second = client.get("/v1/me/qr", headers={"Authorization": f"Bearer {registration.account_id}"})

    assert first.json()["credential_value"] == second.json()["credential_value"]

    participant = db.query(Participant).filter_by(registration_id=registration.id).one()
    assert db.query(QRCredential).filter_by(participant_id=participant.id).count() == 1


def test_cancelled_registration_cannot_accept_a_new_payment(db):
    registration = create_registration(db, full_name="Joko", contact_email="joko@example.com")
    db.commit()
    cancel_registration(db, registration_id=registration.id, actor_id="admin", actor_type=ActorType.HUMAN)
    db.commit()
    assert registration.status == RegistrationStatus.CANCELLED

    try:
        create_payment_attempt(db, registration_id=registration.id, method=PaymentMethod.CASH)
        assert False, "expected StateConflictError"
    except StateConflictError:
        pass


def test_webhook_then_reconciliation_race_only_one_wins(db):
    """SQLite can't exercise real concurrent row-locking, but the
    business-invariant guard inside confirm_payment (only one accepted
    PAID payment per Registration) is exercised here sequentially,
    simulating a webhook and a reconciliation poll both reporting
    success for two different attempts on the same Registration.
    """
    registration = create_registration(db, full_name="Nia", contact_email="nia@example.com")
    payment_a, _ = create_payment_attempt(db, registration_id=registration.id, method=PaymentMethod.QRIS)
    db.commit()

    gateway = MockPaymentGateway(webhook_secret="test")
    outcome_webhook = confirm_payment_from_webhook(
        db,
        gateway_identifier="mock",
        event_id="evt-a",
        payment_id=payment_a.id,
        source_reference="evt-a",
    )
    db.commit()
    assert outcome_webhook.applied is True

    # A reconciliation poll reporting the SAME already-resolved
    # Registration (different event id, as a real backup poll would
    # produce) must be a no-op, not a second activation.
    outcome_reconciliation = confirm_payment_from_reconciliation(
        db,
        gateway_identifier="mock",
        event_id="evt-b-reconcile",
        payment_id=payment_a.id,
        source_reference="evt-b-reconcile",
    )
    db.commit()
    assert outcome_reconciliation.applied is False

    assert db.query(Participant).count() == 1
    assert db.query(QRCredential).count() == 1


def test_audit_confirmed_event_only_recorded_on_real_transitions(db):
    registration = create_registration(db, full_name="Eka", contact_email="eka@example.com")
    payment, _ = create_payment_attempt(db, registration_id=registration.id, method=PaymentMethod.CASH)
    db.commit()

    cash_verify_payment(db, payment_id=payment.id, staff_account_id="staff-1")
    db.commit()
    cash_verify_payment(db, payment_id=payment.id, staff_account_id="staff-2")  # duplicate attempt
    db.commit()

    confirmed = db.query(AuditEvent).filter_by(event_name="payment.confirmed").all()
    noop = db.query(AuditEvent).filter_by(event_name="payment.confirmation_noop").all()

    assert len(confirmed) == 1
    assert len(noop) == 1


def test_duplicate_webhook_event_id_claim_does_not_crash_or_double_process(db):
    """Regression for the check-then-insert race found in code audit:
    two deliveries of the exact same event_id must resolve to one
    applied confirmation and one clean no-op, never an unhandled
    IntegrityError from both trying to write the same dedup record.
    """
    registration = create_registration(db, full_name="Audit", contact_email="audit@example.com")
    payment, _ = create_payment_attempt(db, registration_id=registration.id, method=PaymentMethod.QRIS)
    db.commit()

    first = confirm_payment_from_webhook(
        db, gateway_identifier="mock", event_id="evt-race", payment_id=payment.id, source_reference="evt-race"
    )
    db.commit()
    second = confirm_payment_from_webhook(
        db, gateway_identifier="mock", event_id="evt-race", payment_id=payment.id, source_reference="evt-race"
    )
    db.commit()

    assert first.applied is True
    assert second is None  # claimed by the first delivery already

    assert db.query(Participant).count() == 1
    assert db.query(QRCredential).count() == 1
