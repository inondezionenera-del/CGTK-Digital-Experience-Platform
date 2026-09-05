import enum
import uuid
from datetime import datetime

from sqlalchemy import Enum, String, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from src.database import Base


class RegistrationStatus(str, enum.Enum):
    PENDING_PAYMENT = "PENDING_PAYMENT"
    PAID = "PAID"
    EXPIRED = "EXPIRED"
    CANCELLED = "CANCELLED"
    # No path back from EXPIRED/CANCELLED to PAID. Whether those should
    # ever be reopenable is a business call, not something we've decided
    # to build — a retry goes through a new Registration instead.


class Registration(Base):
    """The anchor row for a participant's journey. Doesn't own Account,
    Participant, or QR — those live in their own modules and just point
    back here.
    """

    __tablename__ = "registrations"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # Public lookup key. Never doubles as an event-access credential.
    registration_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)

    status: Mapped[RegistrationStatus] = mapped_column(
        Enum(RegistrationStatus, name="registration_status"),
        default=RegistrationStatus.PENDING_PAYMENT,
        nullable=False,
    )

    full_name: Mapped[str] = mapped_column(String(200))

    # Used as the secondary factor when peserta look up their status by
    # code. At least one of the two must be filled in — enforced in
    # service.py, not here (a "one of two nullable columns" rule doesn't
    # map cleanly to a column constraint).
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)

    # Only ever set by the payment confirmation cascade — never at
    # submission time. See modules/payments/confirmation.py.
    account_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("accounts.id"), nullable=True, unique=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
