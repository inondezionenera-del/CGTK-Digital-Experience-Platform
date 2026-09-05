"""QR module.

Owns the QRCredential entity. Issued exactly once, only as the final
step of the confirmation cascade, only after Participant is ACTIVE
(2.2/2.5 SETTLED). GET-style read endpoints must never issue a new
credential (2.9 SETTLED) - a missing QR on an ACTIVE Participant is an
invariant-violation/recovery condition, not something to silently fix
here.
"""
