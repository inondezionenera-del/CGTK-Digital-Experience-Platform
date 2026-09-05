"""Participants module.

Owns the Participant entity. Participant is created/activated ONLY as
part of the authoritative confirmation cascade, strictly after
Registration reaches PAID (2.5 SETTLED). No endpoint may activate a
Participant directly.
"""
