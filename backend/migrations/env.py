import asyncio
import os

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

# L'import des models enregistre les tables dans Base.metadata — tout nouveau
# contexte doit être importé ici, sinon l'autogenerate le rate.
import vetolib.identity.infrastructure.models
import vetolib.shared.infrastructure.outbox.model  # noqa: F401
from vetolib.config import get_settings
from vetolib.shared.infrastructure.db.base import Base

config = context.config

target_metadata = Base.metadata


def _database_url() -> str:
    """Priorité : -x/config explicite > env ALEMBIC_DATABASE_URL > settings.

    Les migrations se connectent en rôle propriétaire/superuser (jamais le
    rôle applicatif vetolib_app).
    """
    return (
        config.get_main_option("sqlalchemy.url")
        or os.environ.get("ALEMBIC_DATABASE_URL")
        or get_settings().alembic_database_url
    )


def run_migrations_offline() -> None:
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = _database_url()
    connectable = async_engine_from_config(
        configuration, prefix="sqlalchemy.", poolclass=pool.NullPool
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
