import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from src.database import Base


class QRCredential(Base):
    """Issued exactly once, only as the final step of the confirmation
    cascade, only after Participant is ACTIVE (2.2/2.5 SETTLED).

    OD-6 (technical mechanism: random opaque vs signed payload) is OPEN.
    `credential_value` here is a random opaque token — see
    app/modules/qr/generator.py for the swappable generator interface.
    Never logged, never stored in AuditEvent.
    """

    __tablename__ = "qr_credentials"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    participant_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("participants.id"), unique=True, nullable=False
    )

    # Opaque, non-sequential, no embedded PII (2.7 SETTLED property).
    credential_value: Mapped[str] = mapped_column(String(64), unique=True, index=True)

    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
