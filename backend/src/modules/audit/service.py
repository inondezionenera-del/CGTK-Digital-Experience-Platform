"""Append-only write surface for AuditEvent.

Intentionally the ONLY function in this module that touches AuditEvent
rows. There is no update()/delete() anywhere — that omission IS the
(application-level) enforcement of append-only until OD-17 (DB-level
enforcement mechanism) is settled.
"""

from sqlalchemy.orm import Session

from src.modules.audit.models import ActorType, AuditEvent, Sensitivity


def record_event(
    db: Session,
    *,
    event_name: str,
    actor_type: ActorType,
    actor_identifier: str,
    target_type: str,
    target_id: str,
    sensitivity: Sensitivity,
    correlation_reference: str | None = None,
    source_reference: str | None = None,
    reason: str | None = None,
    state_transition: str | None = None,
) -> AuditEvent:
    event = AuditEvent(
        event_name=event_name,
        actor_type=actor_type,
        actor_identifier=actor_identifier,
        target_type=target_type,
        target_id=target_id,
        sensitivity=sensitivity,
        correlation_reference=correlation_reference,
        source_reference=source_reference,
        reason=reason,
        state_transition=state_transition,
    )
    db.add(event)
    db.flush()
    return event
