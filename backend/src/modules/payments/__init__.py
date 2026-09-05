"""Payments module.

Owns the Payment/Order entity and its state machine (2.4 SETTLED):
PENDING -> PAID | FAILED | EXPIRED | CANCELLED, PAID -> REFUNDED.

Also owns the authoritative payment confirmation orchestrator (2.1/2.5
SETTLED) that every confirmation source (webhook, reconciliation, cash
verification, override) must go through, and the gateway adapter
boundary (Phase D) that isolates the undecided provider (OD-4 OPEN).
"""
