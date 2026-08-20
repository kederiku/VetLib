"""Traduction centralisée des erreurs de domaine en réponses HTTP.

Couche presentation "partagée" de l'architecture hexagonale : le domaine
(domain/) lève des exceptions métier (DomainError et ses sous-classes) sans
rien connaître de HTTP ni de FastAPI -- c'est la règle "zéro import
framework". La conversion exception métier -> code de statut + corps JSON
se fait ici, et uniquement ici.

Pourquoi centraliser plutôt qu'attraper les erreurs dans chaque route ?
- les use cases et les routeurs restent courts : ils laissent simplement
  remonter les exceptions au lieu de multiplier les try/except ;
- le format d'erreur de l'API est uniforme ({"code": ..., "detail": ...}),
  ce que les frontends (clients générés par Orval) peuvent exploiter de
  façon fiable ;
- ajouter une nouvelle erreur métier ne demande qu'une entrée dans un
  mapping, sans toucher aux routes existantes.

Ce module est branché une seule fois dans main.py via
register_error_handlers(app, ...) ; chaque bounded context (identity,
patients, ...) fournit son propre mapping d'erreurs spécifiques.
"""

from collections.abc import Mapping

import structlog
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from vetolib.shared.domain.errors import (
    ConflictError,
    DomainError,
    DomainValidationError,
    EntityNotFoundError,
    PermissionDeniedError,
)

logger = structlog.get_logger(__name__)

# Statuts HTTP par défaut pour les familles d'erreurs génériques du domaine
# partagé. Chaque contexte peut les compléter ou les surcharger via le
# paramètre status_by_error de register_error_handlers (exemple concret :
# IDENTITY_ERROR_STATUS dans identity/presentation/router.py).
DEFAULT_STATUS_BY_ERROR: dict[type[DomainError], int] = {
    DomainValidationError: status.HTTP_422_UNPROCESSABLE_CONTENT,
    EntityNotFoundError: status.HTTP_404_NOT_FOUND,
    ConflictError: status.HTTP_409_CONFLICT,
    PermissionDeniedError: status.HTTP_403_FORBIDDEN,
}


def register_error_handlers(app: FastAPI, status_by_error: Mapping[type[DomainError], int]) -> None:
    """Mapping DomainError -> HTTP. Chaque contexte fournit ses statuts
    spécifiques ; la résolution suit le MRO (l'entrée la plus précise gagne).

    Concrètement : FastAPI appellera handle_domain_error dès qu'une exception
    héritant de DomainError traverse une route sans être attrapée. On remonte
    alors la chaîne d'héritage de l'exception (MRO, Method Resolution Order)
    et on retient le premier statut trouvé : une sous-classe mappée
    explicitement l'emporte donc toujours sur le statut de sa classe mère.
    """
    # Le mapping du contexte est fusionné apres les défauts : en cas de clé
    # identique, c'est bien la valeur fournie par le contexte qui gagne.
    resolved: dict[type[DomainError], int] = {**DEFAULT_STATUS_BY_ERROR, **status_by_error}

    @app.exception_handler(DomainError)
    async def handle_domain_error(_request: Request, exc: DomainError) -> JSONResponse:
        """Convertit une DomainError non attrapée en réponse JSON uniforme."""
        http_status: int | None = None
        # __mro__ liste la classe de l'exception puis ses parents, dans
        # l'ordre : parcourir cette liste suffit pour que "l'entrée la plus
        # précise gagne", sans logique de résolution compliquée.
        for klass in type(exc).__mro__:
            if klass in resolved:
                http_status = resolved[klass]
                break
        if http_status is None:
            # Aucun mapping trouvé : c'est un oubli de configuration (une
            # nouvelle erreur métier non déclarée), pas une faute du client.
            # On répond donc 500 et on trace pour corriger le mapping.
            http_status = status.HTTP_500_INTERNAL_SERVER_ERROR
            logger.error("unmapped_domain_error", code=exc.code, error=str(exc))
        return JSONResponse(
            status_code=http_status,
            # Contrat d'erreur de l'API : "code" est un identifiant stable
            # machine-readable (les frontends peuvent switcher dessus),
            # "detail" est le message lisible par un humain.
            content={"code": exc.code, "detail": str(exc)},
        )
