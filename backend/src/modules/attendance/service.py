from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.modules.attendance.models import Attendance
from src.modules.participants.models import Participant
from src.modules.qr.models import QRCredential


@dataclass
class ScanResult:
    status: str  # SUCCESS | ALREADY_SCANNED | INVALID_QR
    display_name: str | None = None


def scan_for_attendance(db: Session, *, credential_value: str, staff_account_id: str) -> ScanResult:
    qr = db.execute(
        select(QRCredential).where(QRCredential.credential_value == credential_value)
    ).scalar_one_or_none()
    if qr is None:
        return ScanResult(status="INVALID_QR")

    participant = db.get(Participant, qr.participant_id)
    if participant is None:
        return ScanResult(status="INVALID_QR")

    existing = db.execute(
        select(Attendance).where(Attendance.participant_id == participant.id)
    ).scalar_one_or_none()
    if existing is not None:
        return ScanResult(status="ALREADY_SCANNED", display_name=participant.display_name)

    # The unique constraint on participant_id is the real guard against
    # two scanners racing on the same person — the check above is just
    # for a fast, friendly response in the common case.
    try:
        with db.begin_nested():
            db.add(Attendance(participant_id=participant.id, scanned_by=staff_account_id))
            db.flush()
    except IntegrityError:
        return ScanResult(status="ALREADY_SCANNED", display_name=participant.display_name)

    return ScanResult(status="SUCCESS", display_name=participant.display_name)
