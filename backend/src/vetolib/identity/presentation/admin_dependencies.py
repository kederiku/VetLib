"""Composition root de l'espace PLATEFORME (back-office des fondateurs).

Fichier separe de dependencies.py, qui fait deja plus de trois cents lignes :
le cablage le plus sensible du projet merite de tenir sur un ecran et d'etre
relisible d'un bloc. C'est ici qu'on decide qui a le droit d'entrer dans un
espace qui voit les donnees de tous les tenants.

Deux points a garder en tete en modifiant ce fichier :

1. `get_current_admin` est pose sur les ROUTEURS admin, pas route par route
   (voir routers/admin_auth.py). Une route ajoutee demain a un routeur admin
   est donc protegee par construction ; l'oubli exige une action deliberee.
2. Les use cases admin tournent sous UoW SYSTEME. C'est le meme mode que le
   login staff, mais utilise pour lire massivement au lieu de resoudre une
   identite : la RLS ne protege plus rien ici, la barriere est ce fichier.
   Le test d'integration test_admin_routes_protected.py enumere toutes les
   routes /api/v1/admin/* de l'application et exige un 401 sans cookie --
   c'est la contrepartie automatisee de ce choix.
"""

from typing import Annotated

import structlog
from fastapi import Depends, HTTPException, Request, status

from vetolib.identity.application.dto import AdminActor, CurrentAdmin
from vetolib.identity.application.ports import LoginThrottle
from vetolib.identity.application.use_cases.admin import (
    AuthenticateAdmin,
    ChangeAdminStaffRole,
    CreateAdminClinic,
    CreateAdminStaff,
    GetAdminClinic,
    GetAdminOwner,
    GetCurrentAdmin,
    GetPlatformStats,
    ListAdminClinics,
    ListAdminOwners,
    ListAdminStaff,
    RefreshAdminToken,
    SetAdminClinicStatus,
    SetAdminOwnerStatus,
    SetAdminStaffStatus,
    UpdateAdminClinic,
    UpdateAdminOwner,
)
from vetolib.identity.infrastructure.login_throttle import RedisLoginThrottle
from vetolib.identity.infrastructure.password_hasher import PwdlibPasswordHasher
from vetolib.identity.infrastructure.token_provider import PyJWTPlatformAdminTokenProvider
from vetolib.identity.presentation.cookies import ADMIN_ACCESS_COOKIE
from vetolib.identity.presentation.dependencies import (
    BreachCheckerDep,
    SettingsDep,
    UoWFactoryDep,
    get_clock,
    get_password_hasher,
)
from vetolib.shared.infrastructure.clock import SystemClock


def get_platform_admin_token_provider(settings: SettingsDep) -> PyJWTPlatformAdminTokenProvider:
    """Provider de jetons admin (kind="platform", refresh a TTL dedie)."""
    return PyJWTPlatformAdminTokenProvider(settings, get_clock())


AdminTokenProviderDep = Annotated[
    PyJWTPlatformAdminTokenProvider, Depends(get_platform_admin_token_provider)
]


def get_login_throttle(request: Request, settings: SettingsDep) -> LoginThrottle:
    """Limiteur de debit du login admin, adosse au Redis du lifespan."""
    return RedisLoginThrottle(
        request.app.state.redis,
        max_attempts=settings.admin_login_max_attempts,
        window_seconds=settings.admin_login_window_seconds,
    )


LoginThrottleDep = Annotated[LoginThrottle, Depends(get_login_throttle)]


def get_authenticate_admin(
    uow_factory: UoWFactoryDep,
    hasher: Annotated[PwdlibPasswordHasher, Depends(get_password_hasher)],
    tokens: AdminTokenProviderDep,
    clock: Annotated[SystemClock, Depends(get_clock)],
) -> AuthenticateAdmin:
    return AuthenticateAdmin(uow_factory, hasher, tokens, clock)


def get_refresh_admin_token(
    uow_factory: UoWFactoryDep, tokens: AdminTokenProviderDep
) -> RefreshAdminToken:
    return RefreshAdminToken(uow_factory, tokens)


def get_get_current_admin(
    uow_factory: UoWFactoryDep, tokens: AdminTokenProviderDep
) -> GetCurrentAdmin:
    return GetCurrentAdmin(uow_factory, tokens)


async def get_current_admin(
    request: Request,
    use_case: Annotated[GetCurrentAdmin, Depends(get_get_current_admin)],
) -> CurrentAdmin:
    """Resout la session super-admin : cookie vetolib_admin_access -> CurrentAdmin.

    Un cookie staff ou proprietaire recopie sous ce nom est rejete au
    decodage (kind != "platform"), et reciproquement. Le compte est relu en
    base a chaque requete : une revocation prend effet immediatement.

    A poser sur le ROUTEUR (dependencies=[Depends(get_current_admin)]) et non
    sur chaque route : c'est ce qui supprime la classe de bug "j'ai oublie la
    dependance en ajoutant un endpoint".
    """
    token = request.cookies.get(ADMIN_ACCESS_COOKIE)
    if token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Non authentifié.")
    current = await use_case.execute(token)
    # Toute action du back-office devient tracable dans les logs, correlee au
    # request_id pose par le middleware. Jamais l'email : le depot est public
    # et les journaux finissent dans des copies d'ecran.
    structlog.contextvars.bind_contextvars(platform_admin_id=str(current.id))
    return current


CurrentAdminDep = Annotated[CurrentAdmin, Depends(get_current_admin)]


# --- Use cases du back-office ------------------------------------------------
# Un `get_` par use case, comme dans dependencies.py. La route declare
# Depends(get_xxx) et recoit un objet pret a l'emploi, sans jamais connaitre
# SQLAlchemy ni PyJWT.


def get_list_admin_clinics(uow_factory: UoWFactoryDep) -> ListAdminClinics:
    return ListAdminClinics(uow_factory)


def get_list_admin_owners(uow_factory: UoWFactoryDep) -> ListAdminOwners:
    return ListAdminOwners(uow_factory)


def get_list_admin_staff(uow_factory: UoWFactoryDep) -> ListAdminStaff:
    return ListAdminStaff(uow_factory)


def get_platform_stats(uow_factory: UoWFactoryDep) -> GetPlatformStats:
    return GetPlatformStats(uow_factory)


def get_get_admin_clinic(uow_factory: UoWFactoryDep) -> GetAdminClinic:
    return GetAdminClinic(uow_factory)


def get_create_admin_clinic(
    uow_factory: UoWFactoryDep,
    hasher: Annotated[PwdlibPasswordHasher, Depends(get_password_hasher)],
    clock: Annotated[SystemClock, Depends(get_clock)],
    breaches: BreachCheckerDep,
) -> CreateAdminClinic:
    return CreateAdminClinic(uow_factory, hasher, clock, breaches)


def get_update_admin_clinic(
    uow_factory: UoWFactoryDep, clock: Annotated[SystemClock, Depends(get_clock)]
) -> UpdateAdminClinic:
    return UpdateAdminClinic(uow_factory, clock)


def get_set_admin_clinic_status(
    uow_factory: UoWFactoryDep, clock: Annotated[SystemClock, Depends(get_clock)]
) -> SetAdminClinicStatus:
    return SetAdminClinicStatus(uow_factory, clock)


def get_create_admin_staff(
    uow_factory: UoWFactoryDep,
    hasher: Annotated[PwdlibPasswordHasher, Depends(get_password_hasher)],
    clock: Annotated[SystemClock, Depends(get_clock)],
    breaches: BreachCheckerDep,
) -> CreateAdminStaff:
    return CreateAdminStaff(uow_factory, hasher, clock, breaches)


def get_change_admin_staff_role(
    uow_factory: UoWFactoryDep, clock: Annotated[SystemClock, Depends(get_clock)]
) -> ChangeAdminStaffRole:
    return ChangeAdminStaffRole(uow_factory, clock)


def get_set_admin_staff_status(
    uow_factory: UoWFactoryDep, clock: Annotated[SystemClock, Depends(get_clock)]
) -> SetAdminStaffStatus:
    return SetAdminStaffStatus(uow_factory, clock)


def get_get_admin_owner(uow_factory: UoWFactoryDep) -> GetAdminOwner:
    return GetAdminOwner(uow_factory)


def get_update_admin_owner(
    uow_factory: UoWFactoryDep, clock: Annotated[SystemClock, Depends(get_clock)]
) -> UpdateAdminOwner:
    return UpdateAdminOwner(uow_factory, clock)


def get_set_admin_owner_status(
    uow_factory: UoWFactoryDep, clock: Annotated[SystemClock, Depends(get_clock)]
) -> SetAdminOwnerStatus:
    return SetAdminOwnerStatus(uow_factory, clock)


def get_admin_actor(current: CurrentAdminDep) -> AdminActor:
    """Projette la session courante en ACTEUR pour le journal d'audit.

    Dependance a part entiere plutot que conversion dans chaque route : une
    mutation du back-office sans acteur identifie serait une mutation qu'on
    ne pourrait pas expliquer six mois plus tard. La rendre disponible en une
    annotation supprime la tentation de l'oublier.
    """
    return AdminActor(id=current.id, email=current.email)


AdminActorDep = Annotated[AdminActor, Depends(get_admin_actor)]
