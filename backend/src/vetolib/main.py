from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from vetolib.config import get_settings
from vetolib.identity.presentation.router import IDENTITY_ERROR_STATUS, identity_router
from vetolib.logging import configure_logging
from vetolib.shared.infrastructure.db.engine import create_engine_and_sessionmaker
from vetolib.shared.infrastructure.taskiq.broker import broker
from vetolib.shared.presentation.error_handlers import register_error_handlers
from vetolib.shared.presentation.health import router as health_router
from vetolib.shared.presentation.middleware import request_context_middleware

# Contrainte taskiq-fastapi : le worker importe `vetolib.main:app`, ce module
# doit donc rester importable sans side effects (pas de connexion à l'import).


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(log_json=settings.log_json)
    engine, sessionmaker = create_engine_and_sessionmaker(settings.database_url)
    app.state.engine = engine
    app.state.sessionmaker = sessionmaker
    app.state.redis = aioredis.Redis.from_url(settings.redis_url)
    if not broker.is_worker_process:
        await broker.startup()
    yield
    if not broker.is_worker_process:
        await broker.shutdown()
    await app.state.redis.aclose()
    await engine.dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    # Pas de default_response_class : depuis FastAPI 0.14x, la sérialisation
    # passe directement par Pydantic quand un type de retour est déclaré.
    app = FastAPI(title="VetoLib API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,  # indispensable : l'auth passe par des cookies
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.middleware("http")(request_context_middleware)
    register_error_handlers(app, IDENTITY_ERROR_STATUS)
    app.include_router(health_router)
    app.include_router(identity_router, prefix="/api/v1")
    return app


app = create_app()
