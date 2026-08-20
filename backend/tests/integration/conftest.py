"""Tests d'intégration sur PostgreSQL réel (testcontainers) — jamais SQLite :
RLS, SET LOCAL, JSONB et index partiels ne sont pas émulables."""

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
    with PostgresContainer("postgres:18.6-trixie", driver="asyncpg") as container:
        yield container


@pytest.fixture(scope="session")
def redis_container() -> Iterator[RedisContainer]:
    with RedisContainer("redis:8.10.0-alpine3.23") as container:
        yield container


@pytest.fixture(scope="session")
def app_env(
    postgres_container: PostgresContainer, redis_container: RedisContainer
) -> dict[str, str]:
    """Pose l'environnement AVANT tout import de vetolib.main/broker,
    puis applique les migrations Alembic (une fois par session)."""
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
    }
    os.environ.update(env)

    from vetolib.config import get_settings

    get_settings.cache_clear()

    from alembic import command
    from alembic.config import Config

    config = Config()
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    config.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(config, "head")
    return env


@pytest.fixture
async def client(app_env: dict[str, str]) -> AsyncIterator[httpx.AsyncClient]:
    """Client HTTP sur l'app ASGI, base vidée avant chaque test, lifespan actif
    (engine + broker démarrés comme en prod)."""
    engine = create_async_engine(app_env["DATABASE_URL"])
    async with engine.begin() as connection:
        await connection.execute(text("TRUNCATE users, clinics, outbox_events"))
    await engine.dispose()

    from vetolib.main import create_app

    app = create_app()
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as http_client:
            yield http_client
