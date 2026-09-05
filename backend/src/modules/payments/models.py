import enum
import uuid
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, Numeric, String, DateTime, Index, text, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from src.database import Base


class PaymentMethod(str, enum.Enum):
    QRIS = "QRIS"
    CASH = "CASH"


class PaymentStatus(str, enum.Enum):
    PENDING = "PENDING"
    PAID = "PAID"
    FAILED = "FAILED"
    EXPIRED = "EXPIRED"
    CANCELLED = "CANCELLED"
    REFUNDED = "REFUNDED"  # only reachable from PAID


class PaymentConfirmationSource(str, enum.Enum):
    WEBHOOK = "WEBHOOK"
    RECONCILIATION = "RECONCILIATION"
    CASH_VERIFICATION = "CASH_VERIFICATION"
    OVERRIDE = "OVERRIDE"


class Payment(Base):
    """One attempt to pay for a Registration. A Registration can rack up
    many of these (retries after FAILED/EXPIRED); the partial unique
    index below is what actually stops more than one from being PAID at
    the same time — the confirmation cascade's row lock handles the
    concurrent case, this is the last line of defense.
    """

    __tablename__ = "payments"
    __table_args__ = (
        Index(
            "uq_payments_registration_id_one_paid",
            "registration_id",
            unique=True,
            postgresql_where=text("status = 'PAID'"),
            sqlite_where=text("status = 'PAID'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    registration_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("registrations.id"), nullable=False, index=True
    )

    method: Mapped[PaymentMethod] = mapped_column(Enum(PaymentMethod, name="payment_method"))
    status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus, name="payment_status"),
        default=PaymentStatus.PENDING,
        nullable=False,
    )

    # Amount charged for THIS attempt, resolved once at creation time by
    # a PricingPolicy (see policy.py) — not a fixed catalog price.
    amount: Mapped[float] = mapped_column(Numeric(12, 2))

    # Set when a QRIS order is created with the gateway, so an incoming
    # webhook can be matched back to this row before we know anything
    # else about it.
    gateway_reference: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True, index=True)

    confirmation_source: Mapped[PaymentConfirmationSource | None] = mapped_column(
        Enum(PaymentConfirmationSource, name="payment_confirmation_source"), nullable=True
    )
    # Meaning depends on confirmation_source: gateway event id for
    # WEBHOOK/RECONCILIATION, acting staff account id for
    # CASH_VERIFICATION/OVERRIDE.
    confirmation_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)

    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
