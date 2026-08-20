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

DEFAULT_STATUS_BY_ERROR: dict[type[DomainError], int] = {
    DomainValidationError: status.HTTP_422_UNPROCESSABLE_CONTENT,
    EntityNotFoundError: status.HTTP_404_NOT_FOUND,
    ConflictError: status.HTTP_409_CONFLICT,
    PermissionDeniedError: status.HTTP_403_FORBIDDEN,
}


def register_error_handlers(app: FastAPI, status_by_error: Mapping[type[DomainError], int]) -> None:
    """Mapping DomainError -> HTTP. Chaque contexte fournit ses statuts
    spécifiques ; la résolution suit le MRO (l'entrée la plus précise gagne)."""
    resolved: dict[type[DomainError], int] = {**DEFAULT_STATUS_BY_ERROR, **status_by_error}

    @app.exception_handler(DomainError)
    async def handle_domain_error(_request: Request, exc: DomainError) -> JSONResponse:
        http_status: int | None = None
        for klass in type(exc).__mro__:
            if klass in resolved:
                http_status = resolved[klass]
                break
        if http_status is None:
            http_status = status.HTTP_500_INTERNAL_SERVER_ERROR
            logger.error("unmapped_domain_error", code=exc.code, error=str(exc))
        return JSONResponse(
            status_code=http_status,
            content={"code": exc.code, "detail": str(exc)},
        )
