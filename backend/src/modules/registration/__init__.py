"""Registration module.

Owns the Registration entity and its state machine (2.3 SETTLED):
PENDING_PAYMENT -> PAID | EXPIRED | CANCELLED.

Does not own Account, Participant, or QR — those are separate modules
even though Registration is the anchor they reference.
"""
