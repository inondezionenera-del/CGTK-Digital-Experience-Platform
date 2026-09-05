from src.exceptions import StateConflictError
from src.modules.accounts.models import Account
from src.modules.audit.models import AuditEvent
from src.modules.participants.models import Participant
from src.modules.payments.entrypoints import cash_verify_payment
from src.modules.payments.models import Payment, PaymentMethod, PaymentStatus
from src.modules.payments.service import create_payment_attempt
from src.modules.qr.models import QRCredential
from src.modules.registration.models import Registration, RegistrationStatus
from src.modules.registration.service import create_registration


def _register_and_pay(db):
    registration = create_registration(db, full_name="Budi", contact_email="budi@example.com")
    payment, _ = create_payment_attempt(db, registration_id=registration.id, method=PaymentMethod.CASH)
    db.commit()
    outcome = cash_verify_payment(db, payment_id=payment.id, staff_account_id="staff-1")
    db.commit()
    return registration, payment, outcome


def test_registration_creates_no_account(db):
    registration = create_registration(db, full_name="Budi", contact_email="budi@example.com")
    db.commit()

    assert registration.account_id is None
    assert db.query(Account).count() == 0


def test_pending_payment_does_not_create_account(db):
    registration = create_registration(db, full_name="Budi", contact_email="budi@example.com")
    create_payment_attempt(db, registration_id=registration.id, method=PaymentMethod.CASH)
    db.commit()

    assert db.query(Account).count() == 0
    assert db.get(Registration, registration.id).status == RegistrationStatus.PENDING_PAYMENT


def test_cash_verification_confirms_payment_and_activates_cascade(db):
    registration, payment, outcome = _register_and_pay(db)

    assert outcome.applied is True
    refreshed_registration = db.get(Registration, registration.id)
    refreshed_payment = db.get(Payment, payment.id)

    assert refreshed_payment.status == PaymentStatus.PAID
    assert refreshed_registration.status == RegistrationStatus.PAID
    assert refreshed_registration.account_id is not None

    account = db.query(Account).filter_by(registration_id=registration.id).one()
    participant = db.query(Participant).filter_by(account_id=account.id).one()
    qr = db.query(QRCredential).filter_by(participant_id=participant.id).one()

    assert account.id is not None
    assert participant.id is not None
    assert qr.credential_value


def test_participant_gets_exactly_one_qr(db):
    _, _, outcome = _register_and_pay(db)
    participant = db.query(Participant).one()
    assert db.query(QRCredential).filter_by(participant_id=participant.id).count() == 1


def test_duplicate_cash_verification_is_a_noop(db):
    registration, payment, first_outcome = _register_and_pay(db)

    second_outcome = cash_verify_payment(db, payment_id=payment.id, staff_account_id="staff-2")
    db.commit()

    assert second_outcome.applied is False
    assert second_outcome.payment.id == first_outcome.payment.id
    # No second Account/Participant/QR was created.
    assert db.query(Account).count() == 1
    assert db.query(Participant).count() == 1
    assert db.query(QRCredential).count() == 1

    noop_events = db.query(AuditEvent).filter_by(event_name="payment.confirmation_noop").all()
    assert len(noop_events) == 1


def test_cash_verified_human_event_recorded_even_when_already_resolved(db):
    registration, payment, _ = _register_and_pay(db)

    # A second, independent Payment attempt on the same (already PAID)
    # Registration would be rejected by create_payment_attempt in
    # practice; here we exercise cash_verify_payment being called again
    # on the SAME payment id directly (e.g. a retried staff click).
    cash_verify_payment(db, payment_id=payment.id, staff_account_id="staff-3")
    db.commit()

    human_events = db.query(AuditEvent).filter_by(event_name="payment.cash_verified").all()
    # Recorded on every staff action, regardless of outcome (2.8 SETTLED).
    assert len(human_events) == 2


def test_failed_payment_cannot_be_confirmed(db):
    registration = create_registration(db, full_name="Budi", contact_email="budi@example.com")
    payment, _ = create_payment_attempt(db, registration_id=registration.id, method=PaymentMethod.CASH)
    payment.status = PaymentStatus.FAILED
    db.commit()

    outcome = cash_verify_payment(db, payment_id=payment.id, staff_account_id="staff-1")
    db.commit()

    assert outcome.applied is False
    assert db.get(Registration, registration.id).status == RegistrationStatus.PENDING_PAYMENT
    assert db.query(Account).count() == 0


def test_second_payment_attempt_rejected_when_registration_already_paid(db):
    registration, _, _ = _register_and_pay(db)

    try:
        create_payment_attempt(db, registration_id=registration.id, method=PaymentMethod.QRIS)
        assert False, "expected StateConflictError"
    except StateConflictError:
        pass
