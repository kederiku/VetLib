"""Tests d'intégration sur PostgreSQL réel (testcontainers) — jamais SQLite :
RLS, SET LOCAL, JSONB et index partiels ne sont pas émulables.

Place dans la pyramide de tests :
- tests/unit : fakes en mémoire, zéro IO, millisecondes -> valident la logique
  des use cases et du domaine, sans Docker.
- tests/integration (ici) : vrais conteneurs Docker PostgreSQL et Redis
  démarrés par testcontainers, migrations Alembic appliquées, puis exercice de
  l'application FastAPI complète (HTTP -> use case -> SQLAlchemy -> Postgres).
  C'est le seul moyen de prouver la Row-Level Security (RLS), le rôle
  "vetolib_app", SET LOCAL et les index uniques partiels : SQLite ne sait pas
  les émuler, un test SQLite donnerait une fausse confiance.

Coût maîtrisé : les fixtures scope="session" (conteneurs, migrations) ne
tournent qu'une fois pour toute la suite ; l'isolation entre tests est
assurée par un TRUNCATE des tables avant chaque test (fixture "client").
"""

import os
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from testcontainers.community.redis import RedisContainer
from testcontainers.postgres import PostgresContainer

BACKEND_DIR = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="session")
def postgres_container() -> Iterator[PostgresContainer]:
    """Conteneur PostgreSQL jetable, partagé par toute la session de tests.

    driver="asyncpg" : get_connection_url() renverra une URL
    postgresql+asyncpg://..., directement consommable par SQLAlchemy async.
    Le "with" garantit l'arrêt et la suppression du conteneur en fin de suite.
    """
    with PostgresContainer("postgres:18.6-trixie", driver="asyncpg") as container:
        yield container


@pytest.fixture(scope="session")
def redis_container() -> Iterator[RedisContainer]:
    """Conteneur Redis jetable : broker TaskIQ (relais outbox) + healthcheck."""
    with RedisContainer("redis:8.10.0-alpine3.23") as container:
        yield container


@pytest.fixture(scope="session")
def app_env(
    postgres_container: PostgresContainer, redis_container: RedisContainer
) -> dict[str, str]:
    """Pose l'environnement AVANT tout import de vetolib.main/broker,
    puis applique les migrations Alembic (une fois par session).

    L'ordre est crucial : certains modules applicatifs (broker TaskIQ
    notamment) lisent la configuration dès leur import. C'est pourquoi les
    imports de vetolib sont faits ICI, apres os.environ.update(), et non en
    tête de fichier comme d'habitude.
    """
    database_url = postgres_container.get_connection_url()
    redis_host = redis_container.get_container_host_ip()
    redis_port = redis_container.get_exposed_port(6379)
    env = {
        "ENV": "test",
        "DATABASE_URL": database_url,
        "ALEMBIC_DATABASE_URL": database_url,
        "REDIS_URL": f"redis://{redis_host}:{redis_port}/0",
        "JWT_SECRET": "integration-test-secret-0123456789abcdef",
        "COOKIE_SECURE": "false",
        "LOG_JSON": "false",
        # AUCUN appel sortant depuis la suite de tests : la verification
        # anti-compromission des mots de passe se rabat sur sa liste embarquee,
        # sans interroger Have I Been Pwned. Un test ne doit dependre ni du
        # reseau de la CI ni de la disponibilite d'un service tiers.
        "HIBP_ENABLED": "false",
    }
    os.environ.update(env)

    from vetolib.config import get_settings

    # get_settings est mémoïsé (lru_cache) : on purge le cache pour forcer une
    # relecture des variables d'environnement posées juste au-dessus.
    get_settings.cache_clear()

    from alembic import command
    from alembic.config import Config

    # Équivalent programmatique de "alembic upgrade head" : on crée le schéma
    # réel (tables, index partiels, rôle vetolib_app, policies RLS). L'user du
    # conteneur est superuser/propriétaire, comme le superuser réservé aux
    # migrations en production.
    config = Config()
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    config.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(config, "head")
    return env


@pytest.fixture
async def client(app_env: dict[str, str]) -> AsyncIterator[httpx.AsyncClient]:
    """Client HTTP sur l'app ASGI, base vidée avant chaque test, lifespan actif
    (engine + broker démarrés comme en prod).

    - TRUNCATE plutôt que des transactions annulées : les tests exercent de
      vrais commits (index uniques, outbox), on repart donc d'une base vide.
    - ASGITransport parle directement à l'app en mémoire, sans ouvrir de port
      réseau, mais le cycle requête/réponse reste complet (middlewares,
      gestionnaires d'erreurs, cookies conservés par le client entre appels).
    """
    engine = create_async_engine(app_env["DATABASE_URL"])
    async with engine.begin() as connection:
        # CASCADE : PostgreSQL refuse de tronquer une table référencée par une
        # FK d'une table absente de la liste ; CASCADE étend le TRUNCATE aux
        # tables référençantes (appointments -> pets/clinics...) sans devoir
        # tenir cette liste à jour à chaque nouveau contexte.
        await connection.execute(
            text(
                "TRUNCATE users, clinics, owners, pets, appointments, "
                "schedule_exceptions, weekly_schedules, appointment_types, "
                "resources, outbox_events CASCADE"
            )
        )
    await engine.dispose()

    from vetolib.main import create_app

    app = create_app()
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as http_client:
            yield http_client
