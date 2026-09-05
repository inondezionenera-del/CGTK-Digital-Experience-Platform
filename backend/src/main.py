import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.config import get_settings
from src.exceptions import (
    DomainError,
    ForbiddenError,
    NotFoundError,
    RateLimitedError,
    StateConflictError,
    UnauthorizedError,
    ValidationFailedError,
)
from src.logging_config import configure_logging

logger = logging.getLogger(__name__)

_ERROR_STATUS_MAP: dict[type[DomainError], int] = {
    NotFoundError: 404,
    StateConflictError: 409,
    UnauthorizedError: 401,
    ForbiddenError: 403,
    ValidationFailedError: 400,
    RateLimitedError: 429,
}


def _error_envelope(code: str, message: str) -> dict:
    return {"error": {"code": code, "message": message}}


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.app_debug)

    app = FastAPI(
        title="CGTK Digital Experience Platform API",
        version="0.1.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(DomainError)
    async def domain_error_handler(request: Request, exc: DomainError) -> JSONResponse:
        status_code = 500
        for exc_type, mapped_status in _ERROR_STATUS_MAP.items():
            if isinstance(exc, exc_type):
                status_code = mapped_status
                break
        if status_code == 500:
            logger.exception("Unmapped DomainError", exc_info=exc)
        return JSONResponse(
            status_code=status_code,
            content=_error_envelope(exc.code, exc.message),
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled exception", exc_info=exc)
        return JSONResponse(
            status_code=500,
            content=_error_envelope("internal_error", "An unexpected error occurred."),
        )

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok"}

    return app


app = create_app()
