import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from src.database import Base


class Account(Base):
    """Authentication identity (OD-1 SETTLED — Model B: created ONLY as
    part of the authoritative confirmation cascade, after Registration
    reaches PAID. Never created at registration submission.

    OD-2 (authentication mechanism) is OPEN — this model deliberately
    does NOT store a password hash, session secret, or any credential
    material yet. Login/credential fields are added when OD-2 is
    settled, behind app/modules/accounts/auth.py (not yet implemented).
    """

    __tablename__ = "accounts"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # One Account per Registration for PARTICIPANT-side accounts (Model
    # B, created post-payment). NULLABLE because staff/admin identities
    # (STAFF/ADMIN/SUPER_ADMIN/REGISTRATION_STAFF/CAMPUS_REPRESENTATIVE,
    # per 2.6) are provisioned separately, never via Registration/Payment
    # — this table is the shared authentication identity for both kinds,
    # distinguished by role assignment (app/modules/rbac), not by a
    # separate table. OD-1 only settles timing for the participant path.
    registration_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("registrations.id"), unique=True, nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
