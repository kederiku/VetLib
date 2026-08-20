from fastapi import APIRouter, status

from vetolib.identity.domain.errors import (
    EmailAlreadyExistsError,
    InvalidCredentialsError,
    InvalidTokenError,
    UserInactiveError,
)
from vetolib.identity.presentation.routers.auth import router as auth_router
from vetolib.identity.presentation.routers.clinics import router as clinics_router
from vetolib.shared.domain.errors import DomainError

# Point d'inclusion unique du contexte pour main.py.
identity_router = APIRouter()
identity_router.include_router(auth_router)
identity_router.include_router(clinics_router)

# Statuts HTTP spécifiques au contexte (fusionnés avec les défauts par main.py).
IDENTITY_ERROR_STATUS: dict[type[DomainError], int] = {
    InvalidCredentialsError: status.HTTP_401_UNAUTHORIZED,
    InvalidTokenError: status.HTTP_401_UNAUTHORIZED,
    UserInactiveError: status.HTTP_403_FORBIDDEN,
    EmailAlreadyExistsError: status.HTTP_409_CONFLICT,
}
