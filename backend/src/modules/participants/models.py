import enum
import uuid
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, String, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from src.database import Base


class ParticipantStatus(str, enum.Enum):
    # Only one value on purpose — a row only ever gets created already
    # ACTIVE, by the confirmation cascade. Kept as an enum rather than
    # dropped entirely so a future state (e.g. some kind of revocation,
    # if that's ever decided) is additive, not a column-type migration.
    ACTIVE = "ACTIVE"


class Participant(Base):
    """Created/activated only by the confirmation cascade, strictly
    after Registration reaches PAID. No endpoint creates or activates
    this directly.

    Linked to Account via account_id, but the two remain independent —
    nothing here assumes "Account exists" means "Participant ACTIVE".
    """

    __tablename__ = "participants"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    registration_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("registrations.id"), unique=True, nullable=False
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("accounts.id"), unique=True, nullable=False
    )

    status: Mapped[ParticipantStatus] = mapped_column(
        Enum(ParticipantStatus, name="participant_status"),
        default=ParticipantStatus.ACTIVE,
        nullable=False,
    )

    # Support-editable, e.g. fixing a typo'd name at check-in. Defaults
    # to whatever was on the Registration; kept separate so correcting
    # it here never touches Registration's own record.
    display_name: Mapped[str | None] = mapped_column(String(200), nullable=True)

    activated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
