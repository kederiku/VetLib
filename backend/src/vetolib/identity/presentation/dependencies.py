from collections.abc import Callable, Coroutine
from typing import Annotated

import structlog
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from vetolib.config import Settings, get_settings
from vetolib.identity.application.dto import CurrentUser
from vetolib.identity.application.ports import IdentityUnitOfWork, IdentityUoWFactory
from vetolib.identity.application.use_cases import (
    AuthenticateUser,
    GetCurrentUser,
    RefreshToken,
    RegisterClinic,
)
from vetolib.identity.infrastructure.password_hasher import PwdlibPasswordHasher
from vetolib.identity.infrastructure.token_provider import PyJWTTokenProvider
from vetolib.identity.infrastructure.uow import SqlAlchemyIdentityUnitOfWork
from vetolib.identity.presentation.cookies import ACCESS_COOKIE
from vetolib.shared.infrastructure.clock import SystemClock

# Composition root minimaliste : FastAPI Depends suffit à cette taille — les
# singletons coûteux (engine, sessionmaker) vivent dans app.state (lifespan),
# le reste se compose ici. Les use cases restent instanciables à la main en test.

_clock = SystemClock()
_hasher = PwdlibPasswordHasher()  # singleton : pré-calcule le dummy hash Argon2


def get_clock() -> SystemClock:
    return _clock


def get_password_hasher() -> PwdlibPasswordHasher:
    return _hasher


SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_sessionmaker(request: Request) -> async_sessionmaker[AsyncSession]:
    sessionmaker: async_sessionmaker[AsyncSession] = request.app.state.sessionmaker
    return sessionmaker


def get_token_provider(settings: SettingsDep) -> PyJWTTokenProvider:
    return PyJWTTokenProvider(settings, _clock)


def get_system_uow_factory(
    sessionmaker: Annotated[async_sessionmaker[AsyncSession], Depends(get_sessionmaker)],
    settings: SettingsDep,
) -> IdentityUoWFactory:
    """UoW système (rôle propriétaire, RLS non appliquée) : réservé aux flux
    pré-tenant du contexte identity (login, refresh, register)."""

    def factory() -> IdentityUnitOfWork:
        return SqlAlchemyIdentityUnitOfWork(sessionmaker, app_db_role=settings.app_db_role)

    return factory


UoWFactoryDep = Annotated[IdentityUoWFactory, Depends(get_system_uow_factory)]
TokenProviderDep = Annotated[PyJWTTokenProvider, Depends(get_token_provider)]


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


async def get_current_user(
    request: Request,
    use_case: Annotated[GetCurrentUser, Depends(get_get_current_user)],
) -> CurrentUser:
    token = request.cookies.get(ACCESS_COOKIE)
    if token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Non authentifié.")
    current = await use_case.execute(token)
    structlog.contextvars.bind_contextvars(
        user_id=str(current.id), clinic_id=str(current.clinic_id)
    )
    return current


CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]


def require_permission(
    permission: str,
) -> Callable[[CurrentUser], Coroutine[None, None, CurrentUser]]:
    """Fabrique de dépendance d'autorisation, ex :
    `Depends(require_permission("clinic:manage"))`."""

    async def checker(current: CurrentUserDep) -> CurrentUser:
        if permission not in current.permissions:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission refusée.")
        return current

    return checker
