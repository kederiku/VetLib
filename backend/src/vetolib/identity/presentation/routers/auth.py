"""Routeur FastAPI /auth : login, refresh, logout, /me.

Rôle dans l'architecture hexagonale : couche presentation = adapter HTTP.
Chaque route se limite à (1) valider l'entrée via un schéma Pydantic,
(2) construire la commande et appeler le use case, (3) poser/retirer les
cookies, (4) sérialiser la sortie. Aucune logique métier ici : elle vit dans
application/use_cases, ce qui la rend testable sans HTTP.

Particularité du flux de tokens : les use cases renvoient la paire de JWT,
mais elle ne figure jamais dans le JSON de réponse - set_auth_cookies la
transforme en cookies HttpOnly (voir cookies.py pour le pourquoi anti-XSS).
Le corps de réponse de login/refresh est le profil utilisateur, ce qui évite
au front un aller-retour /me supplémentaire.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from vetolib.identity.application.dto import LoginCommand
from vetolib.identity.application.use_cases import AuthenticateUser, RefreshToken
from vetolib.identity.presentation.cookies import (
    REFRESH_COOKIE,
    clear_auth_cookies,
    set_auth_cookies,
)
from vetolib.identity.presentation.dependencies import (
    CurrentUserDep,
    SettingsDep,
    get_authenticate_user,
    get_refresh_token,
)
from vetolib.identity.presentation.schemas import LoginRequest, UserResponse

# operation_id explicites : ce sont les noms des hooks générés par Orval.
# Ex : operation_id="login" -> hook useLogin() dans les deux frontends. Sans
# operation_id, FastAPI en dériverait un du nom de fonction et du chemin, et
# tout renommage casserait silencieusement le code front généré.
router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", operation_id="login")
async def login(
    body: LoginRequest,
    response: Response,
    use_case: Annotated[AuthenticateUser, Depends(get_authenticate_user)],
    settings: SettingsDep,
) -> UserResponse:
    """Vérifie email + mot de passe puis ouvre la session via les cookies.

    Utilise la UoW système (pas de RLS) : avant l'authentification, on ne
    connaît pas encore la clinique de l'utilisateur. En cas d'échec, le use
    case lève InvalidCredentialsError -> 401 sans préciser si c'est l'email
    ou le mot de passe qui est faux (anti-énumération de comptes).
    """
    pair, current = await use_case.execute(
        # get_secret_value() : SecretStr masque le mot de passe dans les repr
        # et les logs ; on ne l'extrait qu'au dernier moment.
        LoginCommand(email=body.email, password=body.password.get_secret_value())
    )
    set_auth_cookies(response, pair, settings)
    return UserResponse.from_current_user(current)


@router.post("/refresh", operation_id="refreshToken")
async def refresh(
    request: Request,
    response: Response,
    use_case: Annotated[RefreshToken, Depends(get_refresh_token)],
    settings: SettingsDep,
) -> UserResponse:
    """Renouvelle la session quand l'access token (15 min) a expiré.

    Le cookie vetolib_refresh n'est envoyé par le navigateur que sur ce
    chemin précis (path=/api/v1/auth/refresh) : on le lit donc à la main
    dans la requête, sans passer par get_current_user qui, lui, attend
    l'access token.
    """
    token = request.cookies.get(REFRESH_COOKIE)
    if token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Non authentifié.")
    pair, current = await use_case.execute(token)
    # Rotation : les deux cookies sont reposés à chaque refresh.
    set_auth_cookies(response, pair, settings)
    return UserResponse.from_current_user(current)


@router.post("/logout", operation_id="logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response, settings: SettingsDep) -> None:
    """Ferme la session en expirant les deux cookies côté navigateur.

    Volontairement sans CurrentUserDep : un logout doit réussir même avec un
    access token déjà expiré. 204 No Content : rien à renvoyer.
    """
    clear_auth_cookies(response, settings)


@router.get("/me", operation_id="getCurrentUser")
async def me(current: CurrentUserDep) -> UserResponse:
    """Profil de l'utilisateur connecté (hook Orval useGetCurrentUser).

    Tout le travail est fait par la dépendance CurrentUserDep : cookie ->
    JWT -> rechargement en base. C'est l'appel que font les frontends au
    chargement pour savoir si une session est ouverte.
    """
    return UserResponse.from_current_user(current)
