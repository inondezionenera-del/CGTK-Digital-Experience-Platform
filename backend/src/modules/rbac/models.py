import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, DateTime, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from src.database import Base


class Role(Base):
    """2.6 SETTLED role set: PARTICIPANT, STAFF, CAMPUS_REPRESENTATIVE,
    REGISTRATION_STAFF, ADMIN, SUPER_ADMIN. Stored as data, not a Python
    enum, so OD-19 (assignment mechanism, still OPEN) can evolve without
    a schema change — but the six settled role *names* are seeded via
    migration, not invented ad hoc.
    """

    __tablename__ = "roles"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(50), unique=True)


class Permission(Base):
    """Dot-notation permission codes per 2.6, e.g. "payment.cash.verify".
    A permission grants who may REQUEST an action — it never implies the
    action is valid; business invariants are still enforced by the
    domain/service layer regardless of permission (2.6 patched
    principle).
    """

    __tablename__ = "permissions"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    code: Mapped[str] = mapped_column(String(100), unique=True)


class RolePermission(Base):
    """Explicit role -> permission grant. No automatic inheritance
    between roles exists anywhere in this schema (2.6 SETTLED default
    deny).
    """

    __tablename__ = "role_permissions"
    __table_args__ = (UniqueConstraint("role_id", "permission_id"),)

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    role_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("roles.id"))
    permission_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("permissions.id")
    )


class AccountRole(Base):
    """Explicit account -> role assignment. OD-19 (who/how assignment
    happens administratively) is OPEN — this table is the minimal
    structure needed regardless of that answer; it does not presume a
    self-service admin UI vs manual seeding.
    """

    __tablename__ = "account_roles"
    __table_args__ = (UniqueConstraint("account_id", "role_id"),)

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("accounts.id"), index=True
    )
    role_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("roles.id"))
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
