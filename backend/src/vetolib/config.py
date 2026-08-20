"""Configuration centrale de VetoLib, portée par Pydantic Settings.

Rôle dans l'architecture : point d'entrée unique de la configuration. Aucune
autre couche ne lit `os.environ` directement ; tout passe par `get_settings()`,
ce qui rend la config typée, validée au démarrage et facile à substituer en test.

D'où viennent les valeurs (ordre de priorité pydantic-settings) :
1. variables d'environnement du processus (celles que docker-compose injecte
   quand l'API tourne en conteneur) ;
2. fichier `.env` du répertoire courant, c'est-à-dire `backend/.env` quand le
   backend est lancé hors Docker (`make dev`, alembic) -- à ne pas confondre
   avec le `.env` racine, qui ne sert qu'à l'interpolation de docker-compose ;
3. défauts déclarés ci-dessous : des valeurs de DEV uniquement, refusées en
   prod par le validateur en bas de fichier.
"""

from functools import lru_cache
from typing import Literal

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEV_JWT_SECRET = "dev-only-secret-change-me-0123456789"  # noqa: S105
_DEV_PG_CREDENTIALS = "postgres:postgres@"


class Settings(BaseSettings):
    """Schéma typé de toutes les variables d'environnement du backend.

    Chaque attribut correspond à une variable d'environnement homonyme,
    insensible à la casse : `database_url` <- DATABASE_URL, etc.
    `extra="ignore"` tolère les variables inconnues présentes dans le .env
    (par exemple celles destinées uniquement à docker-compose).
    """

    # env_file est relatif au répertoire de lancement : backend/.env en pratique.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Environnement d'exécution ; "prod" déclenche les garde-fous du validateur.
    env: Literal["dev", "test", "prod"] = "dev"

    # Le pool applicatif se connecte en rôle propriétaire ; les transactions
    # tenant basculent sur `app_db_role` (SET LOCAL ROLE) pour activer la RLS.
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/vetolib"
    # URL réservée aux migrations Alembic (superuser/propriétaire) : créer des
    # rôles et poser la RLS exigent des privilèges que l'app n'a pas au runtime.
    alembic_database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/vetolib"
    # Rôle non-superuser NOBYPASSRLS endossé par tenant_uow() : c'est lui qui
    # subit les policies RLS (le propriétaire des tables bypasse les siennes).
    app_db_role: str = "vetolib_app"

    # Redis sert de broker TaskIQ (streams) et de result backend pour le worker.
    redis_url: str = "redis://localhost:6379/0"

    # Défaut de dev uniquement — le validateur ci-dessous refuse de démarrer
    # en prod avec ce secret, ou avec un secret < 32 octets (HS256, RFC 7518).
    jwt_secret: SecretStr = SecretStr(_DEV_JWT_SECRET)
    jwt_issuer: str = "vetolib"
    jwt_audience: str = "vetolib"
    jwt_access_ttl_seconds: int = 900  # 15 min : durée du cookie vetolib_access
    jwt_refresh_ttl_seconds: int = 604_800  # 7 jours : durée du cookie vetolib_refresh

    # Secure par défaut (cookies transmis en HTTPS seulement) ; à désactiver
    # en dev local http via COOKIE_SECURE=false dans backend/.env.
    cookie_secure: bool = True
    # Origines des deux frontends Next.js (B2C :3000, B2B :3001) : liste exacte
    # obligatoire car l'auth par cookies impose allow_credentials (cf. main.py).
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:3001"]

    # Stockage objet compatible S3 (MinIO en local via docker-compose).
    s3_endpoint_url: str = "http://localhost:9000"
    s3_bucket_documents: str = "vetolib-documents"

    # False : rendu console lisible (dev) ; True : JSON structuré (prod).
    log_json: bool = False

    @model_validator(mode="after")
    def _refuse_dev_defaults_in_prod(self) -> "Settings":
        """Fail-fast : en prod, refuse les secrets et identifiants de dev.

        Mieux vaut un crash immédiat et explicite au démarrage qu'une prod
        qui tourne silencieusement avec un secret JWT connu de tous.
        """
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
    """Instance unique par processus (lru_cache) : l'env n'est lu qu'une fois.

    Les tests peuvent appeler `get_settings.cache_clear()` pour forcer une
    relecture après avoir modifié l'environnement.
    """
    return Settings()
