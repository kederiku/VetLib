"""Point d'entrée Alembic : comment les migrations se connectent et s'exécutent.

Alembic exécute ce fichier à chaque commande (upgrade, revision...). Deux modes :
- offline (`alembic upgrade head --sql`) : aucune connexion, Alembic émet le
  SQL brut à rejouer à la main (revue DBA, environnements verrouillés) ;
- online (mode normal) : connexion réelle à PostgreSQL via le moteur asyncio
  (même driver asyncpg que l'app), migrations exécutées dans une transaction.

Sécurité des rôles : les migrations se connectent via ALEMBIC_DATABASE_URL en
superuser/propriétaire, JAMAIS avec le rôle applicatif vetolib_app. C'est
voulu : créer des rôles, poser des policies RLS et des GRANT exigent des
privilèges élevés que l'application ne doit pas détenir au runtime (principe
du moindre privilège : vetolib_app est NOBYPASSRLS et sans droits DDL).
"""

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

# Objet de configuration Alembic (contenu d'alembic.ini + options -x de la CLI).
config = context.config

# Schéma de référence pour `alembic revision --autogenerate` : Alembic compare
# ces métadonnées (remplies par les imports de modèles ci-dessus) à la base.
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
    """Mode offline : émet le SQL sans connexion (literal_binds inline les valeurs)."""
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    """Corps synchrone des migrations, exécuté dans la connexion async via run_sync."""
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Mode online : ouvre un moteur asyncpg jetable et déroule les migrations.

    L'API d'Alembic est synchrone : on passe donc par run_sync pour exécuter
    do_run_migrations à l'intérieur de la connexion asynchrone.
    """
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = _database_url()
    # NullPool : une connexion unique et jetable ; un pool n'aurait aucun sens
    # pour un script de migration qui se termine aussitôt.
    connectable = async_engine_from_config(
        configuration, prefix="sqlalchemy.", poolclass=pool.NullPool
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


# Alembic importe ce module comme un script : le mode est choisi ici, selon
# la présence du flag --sql sur la ligne de commande.
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
