from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central application configuration, loaded from environment/.env.

    Kept intentionally flat and boring: this is the one place allowed to
    read raw environment values. Everything else in the app receives
    already-typed config via dependency injection, not os.environ directly.
    """

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "development"
    app_debug: bool = True

    database_url: str = "postgresql+psycopg://cgtk:cgtk@localhost:5432/cgtk"

    cors_origins: str = "http://localhost:3000"

    registration_lookup_rate_limit_per_minute: int = 5

    # OD-4 OPEN: provider not settled. "mock" is the only adapter implemented
    # so far (Phase D). Swapping this value must never require touching
    # domain/payment core code — see app/modules/payments/gateway.py.
    payment_gateway_adapter: str = "mock"
    payment_gateway_webhook_secret: str = "change-me-in-real-deployment"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
