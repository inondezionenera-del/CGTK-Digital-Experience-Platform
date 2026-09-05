import uuid

from src.modules.accounts.models import Account
from tests.rbac_seed import grant_permission


def _make_staff_account(db, *, role_name: str, permission_code: str) -> str:
    staff = Account(registration_id=None)
    db.add(staff)
    db.commit()
    grant_permission(db, account_id=staff.id, role_name=role_name, permission_code=permission_code)
    return str(staff.id)


def _register_pay_and_login(client, db):
    create_resp = client.post(
        "/v1/registrations",
        json={"full_name": "Siti", "contact_email": "siti@example.com"},
    )
    assert create_resp.status_code == 201, create_resp.text
    registration_code = create_resp.json()["registration_code"]

    payment_resp = client.post(
        f"/v1/registrations/{_registration_id(db, registration_code)}/payments",
        json={"method": "CASH"},
    )
    assert payment_resp.status_code == 201, payment_resp.text
    payment_id = payment_resp.json()["id"]

    staff_token = _make_staff_account(db, role_name="REGISTRATION_STAFF", permission_code="payment.cash.verify")
    verify_resp = client.post(
        f"/v1/admin/payments/{payment_id}/cash-verify",
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    assert verify_resp.status_code == 200, verify_resp.text
    assert verify_resp.json()["status"] == "PAID"

    login_resp = client.post(
        "/v1/auth/login",
        json={"registration_code": registration_code, "contact": "siti@example.com"},
    )
    assert login_resp.status_code == 200, login_resp.text
    return login_resp.json()["access_token"]


def _registration_id(db, registration_code: str) -> str:
    from src.modules.registration.models import Registration

    return str(db.query(Registration).filter_by(registration_code=registration_code).one().id)


def test_full_registration_to_qr_flow(client, db):
    token = _register_pay_and_login(client, db)

    me_resp = client.get("/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    assert me_resp.json()["participant_status"] == "ACTIVE"
    assert me_resp.json()["has_qr"] is True

    qr_resp = client.get("/v1/me/qr", headers={"Authorization": f"Bearer {token}"})
    assert qr_resp.status_code == 200
    assert qr_resp.json()["credential_value"]


def test_login_before_payment_is_rejected(client):
    create_resp = client.post(
        "/v1/registrations",
        json={"full_name": "Belum Bayar", "contact_email": "belum@example.com"},
    )
    registration_code = create_resp.json()["registration_code"]

    login_resp = client.post(
        "/v1/auth/login",
        json={"registration_code": registration_code, "contact": "belum@example.com"},
    )
    # No Account exists before payment (Model B) — login can't succeed.
    assert login_resp.status_code == 401


def test_registration_lookup_uses_uniform_response_for_wrong_contact(client):
    create_resp = client.post(
        "/v1/registrations",
        json={"full_name": "Dedi", "contact_email": "dedi@example.com"},
    )
    code = create_resp.json()["registration_code"]

    wrong_contact = client.get(f"/v1/registrations/{code}", params={"contact": "wrong@example.com"})
    unknown_code = client.get("/v1/registrations/CGTK-DOESNOTEXIST", params={"contact": "dedi@example.com"})

    assert wrong_contact.status_code == unknown_code.status_code == 404
    assert wrong_contact.json() == unknown_code.json()


def test_scanner_requires_permission(client, db):
    token = _register_pay_and_login(client, db)
    qr_value = client.get("/v1/me/qr", headers={"Authorization": f"Bearer {token}"}).json()["credential_value"]

    unauthorized_scan = client.post(
        "/v1/scanner/attendance/scan",
        json={"credential_value": qr_value},
        headers={"Authorization": f"Bearer {uuid.uuid4()}"},
    )
    assert unauthorized_scan.status_code in (401, 403)


def test_scanner_success_then_already_scanned(client, db):
    token = _register_pay_and_login(client, db)
    qr_value = client.get("/v1/me/qr", headers={"Authorization": f"Bearer {token}"}).json()["credential_value"]

    staff_token = _make_staff_account(db, role_name="STAFF", permission_code="qr.scan.attendance")
    first_scan = client.post(
        "/v1/scanner/attendance/scan",
        json={"credential_value": qr_value},
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    assert first_scan.status_code == 200
    assert first_scan.json()["result"] == "SUCCESS"

    second_scan = client.post(
        "/v1/scanner/attendance/scan",
        json={"credential_value": qr_value},
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    assert second_scan.json()["result"] == "ALREADY_SCANNED"


def test_override_requires_super_admin_permission_and_reason(client, db):
    create_resp = client.post(
        "/v1/registrations",
        json={"full_name": "Darurat", "contact_email": "darurat@example.com"},
    )
    registration_id = _registration_id(db, create_resp.json()["registration_code"])
    payment_resp = client.post(f"/v1/registrations/{registration_id}/payments", json={"method": "QRIS"})
    payment_id = payment_resp.json()["id"]

    super_admin_token = _make_staff_account(db, role_name="SUPER_ADMIN", permission_code="payment.override")

    missing_reason = client.post(
        f"/v1/admin/payments/{payment_id}/override",
        json={"reason": ""},
        headers={"Authorization": f"Bearer {super_admin_token}"},
    )
    assert missing_reason.status_code == 400

    with_reason = client.post(
        f"/v1/admin/payments/{payment_id}/override",
        json={"reason": "Gateway down during event, verified payment manually"},
        headers={"Authorization": f"Bearer {super_admin_token}"},
    )
    assert with_reason.status_code == 200
    assert with_reason.json()["status"] == "PAID"
