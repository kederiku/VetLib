"""Routes d'authentification des PROPRIETAIRES (portail B2C).

Miroir de routers/auth.py pour l'espace owner : mêmes conventions (cookies
HttpOnly, jamais de token dans un body JSON, operation_id explicites pour
Orval), mais cookies et jetons DISTINCTS de ceux du staff — les deux
sessions coexistent sur le même host sans se marcher dessus, et un jeton
copié d'un espace vers l'autre est rejeté (claim kind).
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from vetolib.identity.application.dto import LoginCommand, RegisterOwnerCommand
from vetolib.identity.application.use_cases import (
    AuthenticateOwner,
    RefreshOwnerToken,
    RegisterOwner,
)
from vetolib.identity.presentation.cookies import (
    OWNER_REFRESH_COOKIE,
    clear_owner_auth_cookies,
    set_owner_auth_cookies,
)
from vetolib.identity.presentation.dependencies import (
    CurrentOwnerDep,
    SettingsDep,
    get_authenticate_owner,
    get_refresh_owner_token,
    get_register_owner,
)
from vetolib.identity.presentation.schemas import (
    LoginRequest,
    OwnerRegisteredResponse,
    OwnerResponse,
    RegisterOwnerRequest,
)

router = APIRouter(prefix="/owner/auth", tags=["owner-auth"])


@router.post("/register", operation_id="registerOwner", status_code=status.HTTP_201_CREATED)
async def register_owner(
    body: RegisterOwnerRequest,
    use_case: Annotated[RegisterOwner, Depends(get_register_owner)],
) -> OwnerRegisteredResponse:
    """Inscription : ne connecte PAS (pas de cookies) — le front enchaîne
    un login avec les identifiants saisis, comme pour le staff."""
    result = await use_case.execute(
        RegisterOwnerCommand(
            email=body.email,
            password=body.password.get_secret_value(),
            first_name=body.first_name,
            last_name=body.last_name,
            phone=body.phone,
        )
    )
    return OwnerRegisteredResponse(owner_id=result.owner_id)


@router.post("/login", operation_id="ownerLogin")
async def owner_login(
    body: LoginRequest,
    response: Response,
    use_case: Annotated[AuthenticateOwner, Depends(get_authenticate_owner)],
    settings: SettingsDep,
) -> OwnerResponse:
    """Login owner : pose les cookies vetolib_owner_* et retourne le profil
    (évite au front un aller-retour /me)."""
    pair, current = await use_case.execute(
        LoginCommand(email=body.email, password=body.password.get_secret_value())
    )
    set_owner_auth_cookies(response, pair, settings)
    return OwnerResponse.from_current_owner(current)


@router.post("/refresh", operation_id="ownerRefreshToken")
async def owner_refresh(
    request: Request,
    response: Response,
    use_case: Annotated[RefreshOwnerToken, Depends(get_refresh_owner_token)],
    settings: SettingsDep,
) -> OwnerResponse:
    """Rotation de session : lit le cookie refresh owner (path restreint à
    cette URL), ré-émet une paire complète et repose les deux cookies."""
    token = request.cookies.get(OWNER_REFRESH_COOKIE)
    if token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Non authentifié.")
    pair, current = await use_case.execute(token)
    set_owner_auth_cookies(response, pair, settings)
    return OwnerResponse.from_current_owner(current)


@router.post("/logout", operation_id="ownerLogout", status_code=status.HTTP_204_NO_CONTENT)
async def owner_logout(response: Response, settings: SettingsDep) -> None:
    """Déconnexion : purge les cookies owner. Sans dépendance d'auth (marche
    même access expiré) et sans toucher aux cookies STAFF — un utilisateur
    connecté aux deux espaces ne perd que sa session owner."""
    clear_owner_auth_cookies(response, settings)


@router.get("/me", operation_id="getCurrentOwner")
async def owner_me(current: CurrentOwnerDep) -> OwnerResponse:
    """Profil de la session owner : appel de bootstrap du portail B2C."""
    return OwnerResponse.from_current_owner(current)
