"""Façade HTTP du contexte identity : agrégation des routeurs + mapping erreurs.

Chaque bounded context expose exactement deux choses à main.py :

1. un routeur unique (identity_router) qui agrège ses sous-routeurs
   (/auth, /clinics) - main.py n'a donc qu'un include_router par contexte,
   et l'intérieur du contexte peut évoluer sans le toucher ;
2. IDENTITY_ERROR_STATUS, la table qui traduit les erreurs métier du domaine
   en statuts HTTP. Le domaine lève des exceptions pures (sans rien savoir
   de HTTP) ; c'est la couche presentation qui décide "cette erreur = 401".
   Les error handlers globaux (shared) consomment cette table, ce qui évite
   des try/except répétés dans chaque route.
"""

from fastapi import APIRouter, status

from vetolib.identity.domain.errors import (
    EmailAlreadyExistsError,
    InvalidCredentialsError,
    InvalidTokenError,
    UserInactiveError,
)
from vetolib.identity.presentation.routers.auth import router as auth_router
from vetolib.identity.presentation.routers.clinics import router as clinics_router
from vetolib.identity.presentation.routers.owner_auth import router as owner_auth_router
from vetolib.identity.presentation.routers.owner_profile import router as owner_profile_router
from vetolib.shared.domain.errors import DomainError

# Point d'inclusion unique du contexte pour main.py.
identity_router = APIRouter()
identity_router.include_router(auth_router)
identity_router.include_router(clinics_router)
# Espace PROPRIETAIRES (B2C) : sessions et cookies distincts du staff.
identity_router.include_router(owner_auth_router)
identity_router.include_router(owner_profile_router)

# Statuts HTTP spécifiques au contexte (fusionnés avec les défauts par main.py).
IDENTITY_ERROR_STATUS: dict[type[DomainError], int] = {
    InvalidCredentialsError: status.HTTP_401_UNAUTHORIZED,  # login : email OU mot de passe faux
    InvalidTokenError: status.HTTP_401_UNAUTHORIZED,  # JWT expiré ou altéré -> se reconnecter
    UserInactiveError: status.HTTP_403_FORBIDDEN,  # compte désactivé (is_active=False)
    EmailAlreadyExistsError: status.HTTP_409_CONFLICT,  # register : conflit d'unicité sur l'email
}
