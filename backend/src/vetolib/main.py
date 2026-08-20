"""Composition de l'application FastAPI : le point d'entrée HTTP du backend.

C'est LE fichier d'assemblage de l'architecture hexagonale : il ne contient
aucune logique métier, il branche les pièces entre elles :
- les routeurs presentation/ de chaque contexte (identity pour l'instant) ;
- les error handlers qui traduisent les erreurs du domaine en statuts HTTP ;
- le middleware de contexte de requête (request_id pour les logs) ;
- les ressources de longue durée (engine SQLAlchemy, client Redis, broker
  TaskIQ), ouvertes et fermées par le lifespan.

Lancé par uvicorn (`uvicorn vetolib.main:app`) ; également importé par le
worker TaskIQ pour partager la même app (cf. contrainte plus bas).
"""

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
    """Cycle de vie : ouvre les ressources partagées au démarrage, les ferme après.

    Tout ce qui vit aussi longtemps que le processus (pool de connexions DB,
    client Redis, broker) est créé ici puis rangé dans `app.state`, d'où les
    dépendances FastAPI le récupèrent (Request -> request.app.state).
    """
    settings = get_settings()
    configure_logging(log_json=settings.log_json)
    engine, sessionmaker = create_engine_and_sessionmaker(settings.database_url)
    app.state.engine = engine
    app.state.sessionmaker = sessionmaker
    app.state.redis = aioredis.Redis.from_url(settings.redis_url)
    # Côté API, le broker sert uniquement à ENVOYER des tâches (.kiq). Dans le
    # processus worker, TaskIQ gère lui-même startup/shutdown : pas de doublon.
    if not broker.is_worker_process:
        await broker.startup()
    # Avant le yield : démarrage. Après : arrêt propre, en ordre inverse.
    yield
    if not broker.is_worker_process:
        await broker.shutdown()
    await app.state.redis.aclose()
    await engine.dispose()


def create_app() -> FastAPI:
    """Factory de l'app : les tests peuvent construire une app neuve et isolée."""
    settings = get_settings()
    # Pas de default_response_class : depuis FastAPI 0.14x, la sérialisation
    # passe directement par Pydantic quand un type de retour est déclaré.
    app = FastAPI(title="VetoLib API", version="0.1.0", lifespan=lifespan)
    # CORS : les frontends Next.js (B2C :3000, B2B :3001) appellent l'API depuis
    # une autre origine ; le navigateur exige ces en-têtes pour l'autoriser.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,  # indispensable : l'auth passe par des cookies
        allow_methods=["*"],
        allow_headers=["*"],
    )
    # Pose request_id et contexte structlog : corrèle les logs d'une requête.
    app.middleware("http")(request_context_middleware)
    # Traduit les erreurs du domaine en réponses HTTP : le domaine ignore HTTP,
    # c'est la table IDENTITY_ERROR_STATUS qui porte le mapping erreur -> code.
    register_error_handlers(app, IDENTITY_ERROR_STATUS)
    # /healthz hors /api/v1 : sonde technique (Docker, orchestrateur), pas métier.
    app.include_router(health_router)
    # Versionnement par le chemin : toutes les routes métier vivent sous /api/v1.
    app.include_router(identity_router, prefix="/api/v1")
    return app


# Instance module-level : cible d'uvicorn ("vetolib.main:app") et du worker
# TaskIQ via taskiq_fastapi (d'où l'interdiction de side effects à l'import).
app = create_app()
