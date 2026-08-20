from typing import Any

import orjson
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)


def _json_dumps(obj: Any) -> str:
    return orjson.dumps(obj, default=str).decode()


def create_engine_and_sessionmaker(
    database_url: str,
) -> tuple[AsyncEngine, async_sessionmaker[AsyncSession]]:
    engine = create_async_engine(
        database_url,
        pool_pre_ping=True,
        json_serializer=_json_dumps,
        json_deserializer=orjson.loads,
    )
    return engine, async_sessionmaker(engine, expire_on_commit=False)
