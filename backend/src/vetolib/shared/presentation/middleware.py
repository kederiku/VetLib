"""Middleware HTTP de corrélation : un request_id unique par requête.

Couche presentation du contexte partagé (shared). Un middleware
FastAPI/Starlette enveloppe chaque requête HTTP : son code s'exécute avant
la route (avant call_next) puis après elle. Celui-ci ne fait qu'une chose,
mais essentielle pour l'observabilité :

1. il récupère l'en-tête X-Request-ID envoyé par le client (un proxy ou un
   frontend peut le fournir pour suivre un appel de bout en bout), ou en
   génère un (UUID) sinon ;
2. il l'attache au contexte structlog via des contextvars : toutes les
   lignes de log émises pendant le traitement de cette requête porteront
   automatiquement ce request_id, quelle que soit la couche qui logge ;
3. il renvoie l'identifiant dans l'en-tête de réponse X-Request-ID, que le
   client peut citer lors d'un signalement de bug.

Les contextvars sont l'équivalent asyncio des variables locales de thread :
chaque requête concurrente garde son propre request_id sans écraser celui
des autres. Le clear_contextvars() en début de requête évite qu'un
identifiant d'une requête précédente ne fuie quand le contexte est réutilisé.

Branché dans main.py via app.middleware("http")(request_context_middleware).
"""

import uuid
from collections.abc import Awaitable, Callable

import structlog
from fastapi import Request, Response


async def request_context_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    """request_id propagé dans les logs (contextvars) et le header de réponse."""
    # Réutilise l'id fourni par le client ou un proxy s'il existe (traçage de
    # bout en bout), sinon en génère un nouveau.
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    # Repart d'un contexte de log vierge : sans cela, des variables liées lors
    # d'une requête précédente pourraient contaminer les logs de celle-ci.
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id=request_id)
    # Passe la main a la suite de la chaîne (autres middlewares, puis la route).
    response = await call_next(request)
    # Renvoyé au client pour qu'il puisse corréler sa requête avec nos logs.
    response.headers["X-Request-ID"] = request_id
    return response
