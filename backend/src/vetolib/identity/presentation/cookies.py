"""Pose et suppression des cookies d'authentification (couche presentation).

Choix central du projet : les JWT ne transitent JAMAIS dans un body JSON ni
dans un header ajouté par le front. Ils voyagent exclusivement dans des
cookies **HttpOnly** :

- HttpOnly : le JavaScript de la page ne peut pas lire le cookie
  (document.cookie ne le voit pas). Une faille XSS dans un frontend ne peut
  donc pas exfiltrer les tokens - c'est la raison d'être de ce choix.
- Le navigateur renvoie le cookie tout seul à chaque requête vers l'API :
  les hooks Orval/TanStack Query n'ont aucun token à stocker ni à joindre.
- Contrepartie : il faut se protéger du CSRF, d'où SameSite=Lax (le cookie
  n'est pas envoyé sur les requêtes cross-site de type POST) et CORS strict.

Deux cookies, deux durées, deux paths (voir CLAUDE.md) :

- ``vetolib_access``  : 15 min, path "/"      -> joint à toutes les requêtes API.
- ``vetolib_refresh`` : 7 jours, path restreint -> joint UNIQUEMENT à l'appel
  POST /api/v1/auth/refresh.

Ce module est le seul endroit qui connaît ces noms/paths : les routeurs
l'appellent, ce qui garantit que login, refresh et logout restent cohérents
(mêmes attributs, sinon delete_cookie ne matcherait pas le cookie posé).
"""

from fastapi import Response

from vetolib.config import Settings
from vetolib.identity.application.dto import TokenPair

ACCESS_COOKIE = "vetolib_access"
REFRESH_COOKIE = "vetolib_refresh"
# Le refresh token n'est envoyé que sur son endpoint : surface d'exposition minimale.
# Le token longue durée (7 j) est le plus sensible ; grâce à ce path, le navigateur
# ne le joint jamais aux autres requêtes (GET /me, etc.), seulement au refresh.
REFRESH_COOKIE_PATH = "/api/v1/auth/refresh"


def set_auth_cookies(response: Response, pair: TokenPair, settings: Settings) -> None:
    """Pose la paire access + refresh sur la réponse HTTP.

    Appelé après login et après chaque refresh (rotation : les deux cookies
    sont réécrits). Les durées (max_age) viennent de Settings :
    900 s pour l'access, 604 800 s (7 j) pour le refresh.
    """
    response.set_cookie(
        ACCESS_COOKIE,
        pair.access_token,
        max_age=settings.jwt_access_ttl_seconds,  # 15 min : vol d'access token peu utile
        path="/",  # envoyé sur toute l'API : c'est lui qui authentifie chaque requête
        httponly=True,  # invisible au JS -> protège contre l'exfiltration via XSS
        secure=settings.cookie_secure,  # True hors dev : cookie réservé au HTTPS
        samesite="lax",  # non envoyé sur les POST cross-site -> barrière anti-CSRF
    )
    response.set_cookie(
        REFRESH_COOKIE,
        pair.refresh_token,
        max_age=settings.jwt_refresh_ttl_seconds,  # 7 jours : durée de la session
        path=REFRESH_COOKIE_PATH,  # joint uniquement à POST /api/v1/auth/refresh
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )


def clear_auth_cookies(response: Response, settings: Settings) -> None:
    """Supprime les deux cookies (logout).

    Un cookie ne se 'supprime' qu'en le réécrivant expiré avec les MÊMES
    attributs (path notamment) : c'est pourquoi on répète path/secure/samesite
    à l'identique de set_auth_cookies.
    """
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


# --- Cookies des PROPRIETAIRES (portail B2C) -------------------------------
# Noms DISTINCTS des cookies staff : les deux sessions (un membre du staff
# sur le B2B, un proprietaire sur le B2C) coexistent sur le meme host sans
# s'ecraser -- indispensable en dev ou tout tourne sur localhost, et sain en
# prod. Le refresh owner n'est envoye que sur SON endpoint (path restreint),
# comme le refresh staff.
OWNER_ACCESS_COOKIE = "vetolib_owner_access"
OWNER_REFRESH_COOKIE = "vetolib_owner_refresh"
OWNER_REFRESH_COOKIE_PATH = "/api/v1/owner/auth/refresh"


def set_owner_auth_cookies(response: Response, pair: TokenPair, settings: Settings) -> None:
    """Pose les deux cookies owner (memes flags et TTL que le staff)."""
    response.set_cookie(
        OWNER_ACCESS_COOKIE,
        pair.access_token,
        max_age=settings.jwt_access_ttl_seconds,
        path="/",
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )
    response.set_cookie(
        OWNER_REFRESH_COOKIE,
        pair.refresh_token,
        max_age=settings.jwt_refresh_ttl_seconds,
        path=OWNER_REFRESH_COOKIE_PATH,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )


def clear_owner_auth_cookies(response: Response, settings: Settings) -> None:
    """Expire les deux cookies owner (delete_cookie doit repeter path/flags)."""
    response.delete_cookie(
        OWNER_ACCESS_COOKIE,
        path="/",
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )
    response.delete_cookie(
        OWNER_REFRESH_COOKIE,
        path=OWNER_REFRESH_COOKIE_PATH,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )
