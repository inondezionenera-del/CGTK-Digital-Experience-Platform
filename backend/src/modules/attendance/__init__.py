"""Event check-in scanning. Simplified: no Event/Session model yet (that
was never part of the Registration/Payment/Account/QR work), so this is
"has this participant checked in at all" rather than per-session
tracking. Extending to real sessions later just means adding a
session_id column and changing the uniqueness constraint — the scan
flow itself doesn't change.
"""
