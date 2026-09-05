"""Audit module.

Owns AuditEvent (historical business/security trail) and the technical
dedup ledgers, kept as explicitly separate concepts (2.8 SETTLED):
- AuditEvent: human-triggered and system-triggered events.
- Webhook/Event Dedup Record: technical processing ledger for
  (gateway, event_id).
- API Request Idempotency Record: technical ledger for client request
  idempotency keys.

Never stores secrets/tokens. Append-only by principle; enforcement
mechanism is OD-17 OPEN.
"""
