"""Domain-level exceptions shared by every module.

These carry no HTTP knowledge themselves (no status codes) — that mapping
lives in src/main.py's exception handlers, so domain/service code never
imports FastAPI. Keeps the domain core testable and framework-agnostic.
"""


class DomainError(Exception):
    """Base class for all domain-level errors."""

    code: str = "domain_error"

    def __init__(self, message: str, *, code: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        if code:
            self.code = code


class NotFoundError(DomainError):
    code = "not_found"


class StateConflictError(DomainError):
    """Raised when an action is attempted against an object in the wrong
    state for that action (e.g. cancelling a Registration that's already
    PAID). Maps to HTTP 409.
    """

    code = "state_conflict"


class UnauthorizedError(DomainError):
    """No valid authenticated subject. Maps to HTTP 401."""

    code = "unauthorized"


class ForbiddenError(DomainError):
    """Authenticated, but not permitted (RBAC/object-level authorization
    failure). Maps to HTTP 403.
    """

    code = "forbidden"


class ValidationFailedError(DomainError):
    """Domain-level validation failure distinct from request-shape
    validation (which Pydantic already handles at the API boundary).
    """

    code = "validation_failed"


class RateLimitedError(DomainError):
    code = "rate_limited"
