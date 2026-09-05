"""Accounts module.

Owns the Account entity (authentication identity). Account is created
ONLY as part of the authoritative confirmation cascade, after Registration
reaches PAID (OD-1 SETTLED - Model B). Never created at registration
submission.

Account and Participant are independent domain objects: there is no
formal invariant equating "Account exists" with "Participant ACTIVE",
even though under Model B they are created in the same cascade
transaction (2.5 SETTLED).
"""
