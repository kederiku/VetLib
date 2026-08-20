from functools import lru_cache
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: Literal["dev", "test", "prod"] = "dev"

    # Le pool applicatif se connecte en rôle propriétaire ; les transactions
    # tenant basculent sur `app_db_role` (SET LOCAL ROLE) pour activer la RLS.
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/vetolib"
    alembic_database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/vetolib"
    app_db_role: str = "vetolib_app"

    redis_url: str = "redis://localhost:6379/0"

    # >= 32 octets requis pour HS256 (RFC 7518) — à surcharger en prod.
    jwt_secret: SecretStr = SecretStr("dev-only-secret-change-me-0123456789")
    jwt_issuer: str = "vetolib"
    jwt_audience: str = "vetolib"
    jwt_access_ttl_seconds: int = 900
    jwt_refresh_ttl_seconds: int = 604_800

    cookie_secure: bool = True
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:3001"]

    s3_endpoint_url: str = "http://localhost:9000"
    s3_bucket_documents: str = "vetolib-documents"

    log_json: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
