"""Dépendances FastAPI du contexte identity : le "composition root" du contexte.

C'est ici que l'architecture hexagonale se referme : les use cases de la
couche application ne connaissent que des ports (interfaces abstraites :
UoW, PasswordHasher, TokenProvider, Clock) ; ce module choisit les adapters
concrets de la couche infrastructure (SQLAlchemy, pwdlib/Argon2, PyJWT) et
les injecte via le système Depends de FastAPI.

Comment lire une dépendance FastAPI (DI = injection de dépendances) :
- une fonction get_xxx() déclare ses propres besoins en paramètres annotés
  Depends(...) ; FastAPI construit récursivement tout l'arbre à chaque
  requête, en mettant en cache chaque dépendance au sein de la requête ;
- les alias Annotated[Type, Depends(...)] (SettingsDep, CurrentUserDep...)
  évitent de répéter la déclaration dans chaque signature de route.

Résolution de l'utilisateur courant (get_current_user, tout en bas) :
cookie vetolib_access -> décodage JWT -> rechargement du user en base ->
CurrentUser injecté dans la route. Toute route qui déclare CurrentUserDep
est donc automatiquement protégée (401 sans cookie valide).
"""

from collections.abc import Callable, Coroutine
from typing import Annotated

import structlog
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from vetolib.identity.application.dto import CurrentOwner, CurrentUser
from vetolib.identity.application.ports import IdentityUnitOfWork, IdentityUoWFactory
from vetolib.identity.application.use_cases import (
    AuthenticateOwner,
    AuthenticateUser,
    GetClinicProfile,
    GetCurrentOwner,
    GetCurrentUser,
    ListPublicClinics,
    RefreshOwnerToken,
    RefreshToken,
    RegisterClinic,
    RegisterOwner,
    UpdateClinicProfile,
    UpdateOwnerProfile,
)
from vetolib.identity.infrastructure.password_hasher import PwdlibPasswordHasher
from vetolib.identity.infrastructure.token_provider import (
    PyJWTOwnerTokenProvider,
    PyJWTTokenProvider,
)
from vetolib.identity.infrastructure.uow import SqlAlchemyIdentityUnitOfWork
from vetolib.identity.presentation.cookies import ACCESS_COOKIE, OWNER_ACCESS_COOKIE
from vetolib.shared.infrastructure.clock import SystemClock

# Plomberie transverse remontée dans shared : ré-exportée ici (X as X =
# re-export explicite pour mypy strict) pour ne pas casser les imports
# existants. Les nouveaux contextes importent depuis shared directement.
from vetolib.shared.presentation.dependencies import (
    SettingsDep as SettingsDep,
)
from vetolib.shared.presentation.dependencies import (
    get_sessionmaker as get_sessionmaker,
)

# Composition root minimaliste : FastAPI Depends suffit à cette taille — les
# singletons coûteux (engine, sessionmaker) vivent dans app.state (lifespan),
# le reste se compose ici. Les use cases restent instanciables à la main en test.

_clock = SystemClock()
_hasher = PwdlibPasswordHasher()  # singleton : pré-calcule le dummy hash Argon2

# Pourquoi un singleton pour le hasher : Argon2 est volontairement coûteux, et
# l'adapter pré-calcule un "dummy hash" utilisé quand l'email est inconnu, pour
# que login prenne le même temps que l'email existe ou non (anti-énumération).


def get_clock() -> SystemClock:
    """Horloge injectable : les tests peuvent substituer un temps figé."""
    return _clock


def get_password_hasher() -> PwdlibPasswordHasher:
    return _hasher


def get_token_provider(settings: SettingsDep) -> PyJWTTokenProvider:
    """Adapter JWT (PyJWT) : encode/décode les access et refresh tokens."""
    return PyJWTTokenProvider(settings, _clock)


def get_system_uow_factory(
    sessionmaker: Annotated[async_sessionmaker[AsyncSession], Depends(get_sessionmaker)],
    settings: SettingsDep,
) -> IdentityUoWFactory:
    """UoW système (rôle propriétaire, RLS non appliquée) : réservé aux flux
    pré-tenant du contexte identity (login, refresh, register).

    Pourquoi "système" : au moment du login on ne sait pas encore à quelle
    clinique (tenant) appartient l'utilisateur, on doit donc chercher son
    email dans TOUTES les cliniques - impossible sous RLS, qui filtre chaque
    requête par app.clinic_id. Les autres contextes (patients, scheduling...)
    utiliseront tenant_uow(clinic_id), qui fait SET LOCAL ROLE vetolib_app
    (rôle NOBYPASSRLS) + SET LOCAL app.clinic_id pour activer l'isolation.

    On injecte une fabrique (et pas une UoW déjà ouverte) : c'est le use case
    qui décide quand ouvrir/fermer la transaction (async with uow_factory()).
    """

    def factory() -> IdentityUnitOfWork:
        return SqlAlchemyIdentityUnitOfWork(sessionmaker, app_db_role=settings.app_db_role)

    return factory


UoWFactoryDep = Annotated[IdentityUoWFactory, Depends(get_system_uow_factory)]
TokenProviderDep = Annotated[PyJWTTokenProvider, Depends(get_token_provider)]

# Les fabriques ci-dessous assemblent chaque use case avec ses adapters.
# Une par use case : la route déclare Depends(get_xxx) et reçoit un objet
# prêt à l'emploi, sans jamais connaître SQLAlchemy ni PyJWT.


def get_register_clinic(
    uow_factory: UoWFactoryDep,
    hasher: Annotated[PwdlibPasswordHasher, Depends(get_password_hasher)],
    clock: Annotated[SystemClock, Depends(get_clock)],
) -> RegisterClinic:
    return RegisterClinic(uow_factory, hasher, clock)


def get_authenticate_user(
    uow_factory: UoWFactoryDep,
    hasher: Annotated[PwdlibPasswordHasher, Depends(get_password_hasher)],
    tokens: TokenProviderDep,
) -> AuthenticateUser:
    return AuthenticateUser(uow_factory, hasher, tokens)


def get_refresh_token(uow_factory: UoWFactoryDep, tokens: TokenProviderDep) -> RefreshToken:
    return RefreshToken(uow_factory, tokens)


def get_get_current_user(uow_factory: UoWFactoryDep, tokens: TokenProviderDep) -> GetCurrentUser:
    return GetCurrentUser(uow_factory, tokens)


# Fiche clinique et annuaire public : ces use cases tournent sur la UoW
# systeme (la table clinics, celle des tenants eux-memes, est hors RLS ;
# l'acces se fait par PK = cid du token, ou en liste pour l'annuaire).


def get_get_clinic_profile(uow_factory: UoWFactoryDep) -> GetClinicProfile:
    return GetClinicProfile(uow_factory)


def get_update_clinic_profile(uow_factory: UoWFactoryDep) -> UpdateClinicProfile:
    return UpdateClinicProfile(uow_factory)


def get_list_public_clinics(uow_factory: UoWFactoryDep) -> ListPublicClinics:
    return ListPublicClinics(uow_factory)


async def get_current_user(
    request: Request,
    use_case: Annotated[GetCurrentUser, Depends(get_get_current_user)],
) -> CurrentUser:
    """Résout l'utilisateur courant depuis le cookie d'access token.

    Chaîne complète : cookie HttpOnly vetolib_access (posé par login/refresh)
    -> décodage/vérification du JWT -> rechargement du user en base (pour
    refléter une désactivation récente) -> CurrentUser. Un JWT invalide ou
    expiré lève InvalidTokenError, traduite en 401 par les error handlers.
    """
    token = request.cookies.get(ACCESS_COOKIE)
    if token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Non authentifié.")
    current = await use_case.execute(token)
    # Enrichit tous les logs de la requête avec user_id/clinic_id (structlog
    # contextvars) : indispensable pour tracer une requête par tenant.
    structlog.contextvars.bind_contextvars(
        user_id=str(current.id), clinic_id=str(current.clinic_id)
    )
    return current


# À déclarer dans toute route protégée : injecte le user et impose le 401.
CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]


def require_permission(
    permission: str,
) -> Callable[[CurrentUser], Coroutine[None, None, CurrentUser]]:
    """Fabrique de dépendance d'autorisation, ex :
    `Depends(require_permission("clinic:manage"))`.

    Distinction classique : get_current_user fait l'authentification (qui
    êtes-vous ? sinon 401), cette fabrique ajoute l'autorisation (en avez-vous
    le droit ? sinon 403). Les permissions dérivent du rôle de l'utilisateur.
    """

    async def checker(current: CurrentUserDep) -> CurrentUser:
        if permission not in current.permissions:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission refusée.")
        return current

    return checker


# --- Dépendances des PROPRIETAIRES (portail B2C) ---------------------------
# Chaîne parallèle à celle du staff : même UoW système, même hasher, mais un
# provider de jetons DEDIE (kind="owner") et un cookie distinct. Le typage
# des ports rend impossible d'injecter le provider staff dans un use case
# owner (et réciproquement).


def get_owner_token_provider(settings: SettingsDep) -> PyJWTOwnerTokenProvider:
    """Provider de jetons owner : leger, construit à la requête."""
    return PyJWTOwnerTokenProvider(settings, _clock)


OwnerTokenProviderDep = Annotated[PyJWTOwnerTokenProvider, Depends(get_owner_token_provider)]


def get_register_owner(
    uow_factory: UoWFactoryDep,
    hasher: Annotated[PwdlibPasswordHasher, Depends(get_password_hasher)],
    clock: Annotated[SystemClock, Depends(get_clock)],
) -> RegisterOwner:
    return RegisterOwner(uow_factory, hasher, clock)


def get_authenticate_owner(
    uow_factory: UoWFactoryDep,
    hasher: Annotated[PwdlibPasswordHasher, Depends(get_password_hasher)],
    tokens: OwnerTokenProviderDep,
) -> AuthenticateOwner:
    return AuthenticateOwner(uow_factory, hasher, tokens)


def get_refresh_owner_token(
    uow_factory: UoWFactoryDep, tokens: OwnerTokenProviderDep
) -> RefreshOwnerToken:
    return RefreshOwnerToken(uow_factory, tokens)


def get_get_current_owner(
    uow_factory: UoWFactoryDep, tokens: OwnerTokenProviderDep
) -> GetCurrentOwner:
    return GetCurrentOwner(uow_factory, tokens)


def get_update_owner_profile(uow_factory: UoWFactoryDep) -> UpdateOwnerProfile:
    return UpdateOwnerProfile(uow_factory)


async def get_current_owner(
    request: Request,
    use_case: Annotated[GetCurrentOwner, Depends(get_get_current_owner)],
) -> CurrentOwner:
    """Résout la session owner : cookie vetolib_owner_access -> CurrentOwner.

    Toute route qui déclare CurrentOwnerDep est automatiquement protégée
    (401 sans cookie owner valide). Un cookie STAFF posé au même endroit
    serait rejeté par le décodage (kind != "owner").
    """
    token = request.cookies.get(OWNER_ACCESS_COOKIE)
    if token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Non authentifié.")
    current = await use_case.execute(token)
    structlog.contextvars.bind_contextvars(owner_id=str(current.id))
    return current


CurrentOwnerDep = Annotated[CurrentOwner, Depends(get_current_owner)]
