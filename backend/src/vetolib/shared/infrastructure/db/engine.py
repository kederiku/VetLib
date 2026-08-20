"""Fabrique de l'engine SQLAlchemy async et de sa fabrique de sessions.

Couche `shared/infrastructure/db`. L'engine encapsule le pool de
connexions vers PostgreSQL : il est créé une seule fois au démarrage
(lifespan FastAPI dans `main.py`) puis rangé dans `app.state`. Les
sessions, elles, sont jetables : le UnitOfWork en ouvre une par
transaction via le `async_sessionmaker` retourné ici.
"""

from typing import Any

import orjson
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)


def _json_dumps(obj: Any) -> str:
    """Sérialiseur JSON des colonnes JSONB (ex : payloads de l'outbox).

    orjson est bien plus rapide que le module `json` standard mais renvoie
    des bytes -> `.decode()` car SQLAlchemy attend une str. `default=str`
    couvre les types absents du JSON natif (UUID, datetime, Decimal).
    """
    return orjson.dumps(obj, default=str).decode()


def create_engine_and_sessionmaker(
    database_url: str,
) -> tuple[AsyncEngine, async_sessionmaker[AsyncSession]]:
    """Construit l'engine (pool de connexions) et la fabrique de sessions."""
    engine = create_async_engine(
        database_url,
        # Ping de la connexion avant de la sortir du pool : évite les
        # erreurs "connexion fermée" après un redémarrage de PostgreSQL
        # ou une coupure réseau (la connexion morte est remplacée).
        pool_pre_ping=True,
        json_serializer=_json_dumps,
        json_deserializer=orjson.loads,
    )
    # expire_on_commit=False : après un commit, les objets déjà chargés
    # gardent leurs attributs au lieu d'être marqués "expirés".
    # Indispensable en async : un rechargement paresseux post-commit
    # déclencherait de l'IO implicite (interdite hors `await`), et cela
    # permet de renvoyer au client les données lues pendant la
    # transaction une fois celle-ci commitée.
    return engine, async_sessionmaker(engine, expire_on_commit=False)
