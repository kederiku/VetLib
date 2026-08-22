"""Routeur FastAPI /admin/auth : session du back-office plateforme.

Troisieme espace d'authentification du produit, et le seul dont l'isolation
ne repose PAS sur la Row-Level Security : ses routes voient tous les tenants.
D'ou deux precautions visibles ici et nulle part ailleurs.

1. AUCUNE inscription. Il n'existe pas de POST /admin/auth/register, et il
   ne doit pas en exister : les comptes se creent par la commande locale
   `make create-admin`. Le depot etant public, un compte creable par HTTP
   serait un compte creable par n'importe qui le jour d'un oubli de garde.

2. Une LIMITATION DE DEBIT sur le login. Quelques comptes, un mot de passe
   pour seule barriere, et un acces a toutes les donnees de toutes les
   cliniques : l'attaque en ligne est le scenario realiste. Elle est posee
   dans la route et non dans le use case, parce qu'elle raisonne en adresses
   IP et en requetes HTTP -- deux notions que la couche application ignore.

Ce routeur est le SEUL de l'espace admin a ne pas porter la dependance
d'authentification : ce sont les routes qui servent a l'obtenir. Toute
nouvelle route ici est un evenement de revue -- c'est le point d'entree
naturel d'une regression de securite.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from vetolib.identity.application.dto import LoginCommand
from vetolib.identity.application.use_cases.admin import (
    AuthenticateAdmin,
    RefreshAdminToken,
)
from vetolib.identity.domain.errors import AdminInactiveError, InvalidCredentialsError
from vetolib.identity.infrastructure.login_throttle import login_throttle_keys
from vetolib.identity.presentation.admin_dependencies import (
    CurrentAdminDep,
    LoginThrottleDep,
    get_authenticate_admin,
    get_refresh_admin_token,
)
from vetolib.identity.presentation.admin_schemas import AdminResponse
from vetolib.identity.presentation.cookies import (
    ADMIN_REFRESH_COOKIE,
    clear_admin_auth_cookies,
    set_admin_auth_cookies,
)
from vetolib.identity.presentation.dependencies import SettingsDep
from vetolib.identity.presentation.schemas import LoginRequest

router = APIRouter(prefix="/admin/auth", tags=["admin-auth"])

# Message unique, quel que soit le motif du blocage : dire "ce compte est
# temporairement bloque" confirmerait son existence.
_MESSAGE_TROP_DE_TENTATIVES = "Trop de tentatives de connexion. Réessayez dans quelques minutes."


@router.post("/login", operation_id="adminLogin")
async def admin_login(
    request: Request,
    body: LoginRequest,
    response: Response,
    use_case: Annotated[AuthenticateAdmin, Depends(get_authenticate_admin)],
    throttle: LoginThrottleDep,
    settings: SettingsDep,
) -> AdminResponse:
    """Ouvre une session de back-office (cookies HttpOnly, path restreint).

    Le compteur d'echecs encadre l'appel : verification avant, incrementation
    en cas de refus, remise a zero en cas de succes. Un Redis injoignable
    laisse passer (fail-open assume, voir login_throttle.py) : une panne du
    cache ne doit pas fermer le back-office a clef.
    """
    cles = login_throttle_keys(
        # request.client est None derriere certains transports de test :
        # la cle retombe alors sur une valeur fixe, ce qui reste correct.
        ip=request.client.host if request.client is not None else None,
        email=body.email,
    )
    delai = await throttle.seconds_until_retry(cles)
    if delai is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=_MESSAGE_TROP_DE_TENTATIVES,
            headers={"Retry-After": str(delai)},
        )

    try:
        pair, current = await use_case.execute(
            LoginCommand(email=body.email, password=body.password.get_secret_value())
        )
    except (InvalidCredentialsError, AdminInactiveError):
        # On compte les DEUX : un compte revoque dont le mot de passe est
        # connu reste une cible interessante pour un attaquant.
        await throttle.record_failure(cles)
        raise

    await throttle.reset(cles)
    set_admin_auth_cookies(response, pair, settings)
    return AdminResponse.from_current_admin(current)


@router.post("/refresh", operation_id="adminRefreshToken")
async def admin_refresh(
    request: Request,
    response: Response,
    use_case: Annotated[RefreshAdminToken, Depends(get_refresh_admin_token)],
    settings: SettingsDep,
) -> AdminResponse:
    """Renouvelle la session (rotation des deux cookies).

    Le cookie vetolib_admin_refresh n'est envoye par le navigateur que sur ce
    chemin exact : on le lit donc a la main, comme dans les deux autres
    espaces.
    """
    token = request.cookies.get(ADMIN_REFRESH_COOKIE)
    if token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Non authentifié.")
    pair, current = await use_case.execute(token)
    set_admin_auth_cookies(response, pair, settings)
    return AdminResponse.from_current_admin(current)


@router.post("/logout", operation_id="adminLogout", status_code=status.HTTP_204_NO_CONTENT)
async def admin_logout(response: Response, settings: SettingsDep) -> None:
    """Ferme la session en expirant les deux cookies.

    Sans dependance d'authentification, comme les deux autres espaces : une
    deconnexion doit reussir meme avec un jeton deja expire.
    """
    clear_admin_auth_cookies(response, settings)


@router.get("/me", operation_id="getCurrentAdmin")
async def admin_me(current: CurrentAdminDep) -> AdminResponse:
    """Profil du super-admin connecte (hook Orval useGetCurrentAdmin).

    Seule route de ce routeur a exiger le cookie d'access : c'est l'appel que
    le back-office fait au chargement pour savoir si une session est ouverte.
    """
    return AdminResponse.from_current_admin(current)
