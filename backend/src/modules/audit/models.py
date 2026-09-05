import enum
import uuid
from datetime import datetime

from sqlalchemy import Enum, String, Text, DateTime, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from src.database import Base


class ActorType(str, enum.Enum):
    HUMAN = "HUMAN"
    SYSTEM = "SYSTEM"


class Sensitivity(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class AuditEvent(Base):
    """Historical business/security trail (2.8 SETTLED) — distinct from
    the technical dedup ledgers below. Append-only by convention: no
    update/delete method exists anywhere in this module. DB-level
    enforcement (OD-17) is deferred to physical/infra design.

    Never stores secret/token values (2.8 SETTLED) — target_id /
    correlation_reference / source_reference must only ever hold
    references (UUIDs, gateway event ids, staff account ids), never raw
    QR tokens, webhook secrets, or session/auth tokens.
    """

    __tablename__ = "audit_events"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # e.g. "payment.cash_verified", "participant.activated" — see 2.8
    # taxonomy. Deliberately a plain string, not a DB enum: the
    # taxonomy is expected to grow (e.g. a possible future
    # "account.activated" event noted but not added during OD-1
    # reconciliation) without a migration each time.
    event_name: Mapped[str] = mapped_column(String(100), index=True)

    actor_type: Mapped[ActorType] = mapped_column(Enum(ActorType, name="audit_actor_type"))
    # HUMAN: account id of the actor. SYSTEM: named source, e.g.
    # "webhook_confirmation" / "reconciliation_job" /
    # "confirmation_orchestrator" / "scheduled_expiry_job" — never the
    # bare string "SYSTEM" (2.8 patched requirement).
    actor_identifier: Mapped[str] = mapped_column(String(255))

    target_type: Mapped[str] = mapped_column(String(50))
    target_id: Mapped[str] = mapped_column(String(255))

    correlation_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)

    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    state_transition: Mapped[str | None] = mapped_column(String(100), nullable=True)

    sensitivity: Mapped[Sensitivity] = mapped_column(Enum(Sensitivity, name="audit_sensitivity"))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WebhookDedupRecord(Base):
    """Technical processing ledger for (gateway, event_id) — checked
    BEFORE processing a webhook, distinct from AuditEvent which is
    recorded as/after the result (2.8 SETTLED distinction).
    """

    __tablename__ = "webhook_dedup_records"
    __table_args__ = (UniqueConstraint("gateway_identifier", "event_id"),)

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    gateway_identifier: Mapped[str] = mapped_column(String(100))
    event_id: Mapped[str] = mapped_column(String(255))
    outcome: Mapped[str] = mapped_column(String(50))  # "applied" | "noop"
    processed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ApiRequestIdempotencyRecord(Base):
    """Technical ledger for client-supplied API idempotency keys on
    creation requests (e.g. POST /registrations/{id}/payments) —
    distinct from WebhookDedupRecord (different layer/purpose, per
    patch 2.9 #1 / 2.10 patch #3).
    """

    __tablename__ = "api_request_idempotency_records"
    __table_args__ = (UniqueConstraint("idempotency_key"),)

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    idempotency_key: Mapped[str] = mapped_column(String(255))
    endpoint: Mapped[str] = mapped_column(String(255))
    resource_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
