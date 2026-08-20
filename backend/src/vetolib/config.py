from functools import lru_cache
from typing import Literal

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEV_JWT_SECRET = "dev-only-secret-change-me-0123456789"  # noqa: S105
_DEV_PG_CREDENTIALS = "postgres:postgres@"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: Literal["dev", "test", "prod"] = "dev"

    # Le pool applicatif se connecte en rôle propriétaire ; les transactions
    # tenant basculent sur `app_db_role` (SET LOCAL ROLE) pour activer la RLS.
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/vetolib"
    alembic_database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/vetolib"
    app_db_role: str = "vetolib_app"

    redis_url: str = "redis://localhost:6379/0"

    # Défaut de dev uniquement — le validateur ci-dessous refuse de démarrer
    # en prod avec ce secret, ou avec un secret < 32 octets (HS256, RFC 7518).
    jwt_secret: SecretStr = SecretStr(_DEV_JWT_SECRET)
    jwt_issuer: str = "vetolib"
    jwt_audience: str = "vetolib"
    jwt_access_ttl_seconds: int = 900
    jwt_refresh_ttl_seconds: int = 604_800

    cookie_secure: bool = True
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:3001"]

    s3_endpoint_url: str = "http://localhost:9000"
    s3_bucket_documents: str = "vetolib-documents"

    log_json: bool = False

    @model_validator(mode="after")
    def _refuse_dev_defaults_in_prod(self) -> "Settings":
        if self.env != "prod":
            return self
        secret = self.jwt_secret.get_secret_value()
        if secret == _DEV_JWT_SECRET or len(secret.encode()) < 32:
            raise ValueError(
                "ENV=prod : JWT_SECRET doit être défini, différent du défaut de dev "
                "et faire au moins 32 octets."
            )
        if _DEV_PG_CREDENTIALS in self.database_url or _DEV_PG_CREDENTIALS in (
            self.alembic_database_url
        ):
            raise ValueError("ENV=prod : identifiants PostgreSQL par défaut interdits.")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
