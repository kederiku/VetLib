from fastapi import Response

from vetolib.config import Settings
from vetolib.identity.application.dto import TokenPair

ACCESS_COOKIE = "vetolib_access"
REFRESH_COOKIE = "vetolib_refresh"
# Le refresh token n'est envoyé que sur son endpoint : surface d'exposition minimale.
REFRESH_COOKIE_PATH = "/api/v1/auth/refresh"


def set_auth_cookies(response: Response, pair: TokenPair, settings: Settings) -> None:
    response.set_cookie(
        ACCESS_COOKIE,
        pair.access_token,
        max_age=settings.jwt_access_ttl_seconds,
        path="/",
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )
    response.set_cookie(
        REFRESH_COOKIE,
        pair.refresh_token,
        max_age=settings.jwt_refresh_ttl_seconds,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )


def clear_auth_cookies(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        ACCESS_COOKIE, path="/", httponly=True, secure=settings.cookie_secure, samesite="lax"
    )
    response.delete_cookie(
        REFRESH_COOKIE,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )
