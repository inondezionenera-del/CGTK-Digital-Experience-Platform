"""Who's making this request.

OD-2 (session vs JWT) hasn't been decided yet, so there's no real login
flow here — just enough to identify "which Account is calling" so the
rest of the authorization stack (permissions, object-level checks) can
be built and tested against something real. The header format below
(`Authorization: Bearer <account-id>`) is a stand-in and should be
swapped for whatever OD-2 lands on without touching anything that
depends on get_current_account_id.
"""

from uuid import UUID

from fastapi import Header

from src.exceptions import UnauthorizedError


def get_current_account_id(authorization: str | None = Header(default=None)) -> UUID:
    if not authorization or not authorization.startswith("Bearer "):
        raise UnauthorizedError("Missing or malformed Authorization header")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        return UUID(token)
    except ValueError:
        raise UnauthorizedError("Invalid credentials") from None


def get_current_account_id_optional(authorization: str | None = Header(default=None)) -> UUID | None:
    if not authorization:
        return None
    return get_current_account_id(authorization)
