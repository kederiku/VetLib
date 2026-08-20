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
router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", operation_id="login")
async def login(
    body: LoginRequest,
    response: Response,
    use_case: Annotated[AuthenticateUser, Depends(get_authenticate_user)],
    settings: SettingsDep,
) -> UserResponse:
    pair, current = await use_case.execute(
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
    token = request.cookies.get(REFRESH_COOKIE)
    if token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Non authentifié.")
    pair, current = await use_case.execute(token)
    # Rotation : les deux cookies sont reposés à chaque refresh.
    set_auth_cookies(response, pair, settings)
    return UserResponse.from_current_user(current)


@router.post("/logout", operation_id="logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response, settings: SettingsDep) -> None:
    clear_auth_cookies(response, settings)


@router.get("/me", operation_id="getCurrentUser")
async def me(current: CurrentUserDep) -> UserResponse:
    return UserResponse.from_current_user(current)
