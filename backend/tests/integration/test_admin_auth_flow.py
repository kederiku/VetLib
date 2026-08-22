"""Parcours complet de la session du back-office plateforme, sur PostgreSQL reel.

Ce que seul un test d'integration peut prouver ici :
- les ATTRIBUTS des cookies poses (HttpOnly, Path restreint, SameSite=Strict),
  qui sont la moitie de la securite du dispositif et n'existent pas au niveau
  des use cases ;
- que le corps de reponse ne contient AUCUN jeton ;
- que le compte est bien relu en base a chaque requete (revocation immediate) ;
- que le role applicatif n'a AUCUN droit sur la table platform_admins, ce qui
  n'est verifiable que contre un vrai PostgreSQL avec ses GRANT ;
- que la limitation de debit du login bloque puis laisse repasser.
"""

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import create_async_engine

from tests.integration.conftest import CreateAdmin

ADMIN_EMAIL = "fondateur@vetolib.fr"
ADMIN_PASSWORD = "phrase-de-passe-fondateur"


async def _connecter(client: httpx.AsyncClient) -> httpx.Response:
    return await client.post(
        "/api/v1/admin/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )


def _entete_cookie(reponse: httpx.Response, nom: str) -> str:
    """Renvoie l'en-tete Set-Cookie brut d'un cookie donne.

    On lit l'EN-TETE et non le cookie parse : les attributs (Path, HttpOnly,
    SameSite) sont precisement ce qu'on veut verifier, et httpx ne les expose
    pas autrement.
    """
    entetes = [v for v in reponse.headers.get_list("set-cookie") if v.startswith(f"{nom}=")]
    assert entetes, f"cookie {nom} absent de la reponse"
    return entetes[0]


async def test_login_pose_deux_cookies_bien_attribues(
    client: httpx.AsyncClient, create_platform_admin: CreateAdmin
) -> None:
    await create_platform_admin(ADMIN_EMAIL, ADMIN_PASSWORD)

    reponse = await _connecter(client)

    assert reponse.status_code == 200, reponse.text
    corps = reponse.json()
    assert corps["email"] == ADMIN_EMAIL
    # Convention du projet : aucun jeton ne transite dans un corps JSON.
    assert "access_token" not in corps
    assert "refresh_token" not in corps

    access = _entete_cookie(reponse, "vetolib_admin_access")
    assert "HttpOnly" in access
    # Path RESTREINT des l'access : c'est ce qui empeche le cookie le plus
    # puissant du systeme de partir avec les appels du B2C et du B2B, qui
    # partagent le meme hote en developpement.
    assert "Path=/api/v1/admin" in access
    assert "samesite=strict" in access.lower()

    refresh = _entete_cookie(reponse, "vetolib_admin_refresh")
    assert "Path=/api/v1/admin/auth/refresh" in refresh
    assert "HttpOnly" in refresh


async def test_me_refresh_et_logout(
    client: httpx.AsyncClient, create_platform_admin: CreateAdmin
) -> None:
    await create_platform_admin(ADMIN_EMAIL, ADMIN_PASSWORD)
    await _connecter(client)

    profil = await client.get("/api/v1/admin/auth/me")
    assert profil.status_code == 200
    assert profil.json()["first_name"] == "Cedric"

    # Rotation : les deux cookies sont reposes.
    refresh = await client.post("/api/v1/admin/auth/refresh")
    assert refresh.status_code == 200, refresh.text
    _entete_cookie(refresh, "vetolib_admin_access")
    _entete_cookie(refresh, "vetolib_admin_refresh")

    logout = await client.post("/api/v1/admin/auth/logout")
    assert logout.status_code == 204
    apres = await client.get("/api/v1/admin/auth/me")
    assert apres.status_code == 401


async def test_mauvais_mot_de_passe_et_compte_revoque(
    client: httpx.AsyncClient, create_platform_admin: CreateAdmin
) -> None:
    await create_platform_admin(ADMIN_EMAIL, ADMIN_PASSWORD)

    mauvais = await client.post(
        "/api/v1/admin/auth/login",
        json={"email": ADMIN_EMAIL, "password": "ce-n-est-pas-le-bon"},
    )
    assert mauvais.status_code == 401
    assert mauvais.json()["code"] == "identity.invalid_credentials"

    inconnu = await client.post(
        "/api/v1/admin/auth/login",
        json={"email": "personne@vetolib.fr", "password": ADMIN_PASSWORD},
    )
    # Meme code, meme message : pas d'oracle d'existence de compte.
    assert inconnu.status_code == 401
    assert inconnu.json()["code"] == "identity.invalid_credentials"


async def test_un_compte_revoque_ne_peut_plus_se_connecter(
    client: httpx.AsyncClient, create_platform_admin: CreateAdmin
) -> None:
    await create_platform_admin("revoque@vetolib.fr", ADMIN_PASSWORD, actif=False)

    reponse = await client.post(
        "/api/v1/admin/auth/login",
        json={"email": "revoque@vetolib.fr", "password": ADMIN_PASSWORD},
    )

    assert reponse.status_code == 403
    assert reponse.json()["code"] == "identity.admin_inactive"


async def test_le_role_applicatif_n_a_aucun_droit_sur_platform_admins(
    app_env: dict[str, str],
) -> None:
    """Verrouille le REVOKE de la migration 0008.

    C'est la seule protection de la table la plus sensible du schema : elle
    n'a pas de RLS (aucune colonne de tenant), la barriere est le privilege.
    Rien d'autre dans la suite ne l'exercerait, et un futur
    `GRANT ... ON ALL TABLES` la ferait sauter en silence.
    """
    engine = create_async_engine(app_env["DATABASE_URL"])
    try:
        async with engine.begin() as connection:
            await connection.execute(text('SET LOCAL ROLE "vetolib_app"'))
            with pytest.raises(ProgrammingError, match="permission denied"):
                await connection.execute(text("SELECT 1 FROM platform_admins"))
    finally:
        await engine.dispose()


async def test_la_limitation_de_debit_bloque_apres_cinq_echecs(
    client: httpx.AsyncClient, create_platform_admin: CreateAdmin
) -> None:
    """Cinq echecs, puis 429 avec Retry-After -- y compris avec le BON mot de passe.

    Le blocage porte sur les tentatives, pas sur leur resultat : sinon un
    attaquant qui finit par trouver le mot de passe passerait quand meme.
    """
    await create_platform_admin(ADMIN_EMAIL, ADMIN_PASSWORD)

    codes = []
    for _ in range(6):
        reponse = await client.post(
            "/api/v1/admin/auth/login",
            json={"email": ADMIN_EMAIL, "password": "mauvais-mot-de-passe"},
        )
        codes.append(reponse.status_code)

    assert codes == [401, 401, 401, 401, 401, 429], codes

    bloque = await _connecter(client)
    assert bloque.status_code == 429
    assert int(bloque.headers["Retry-After"]) > 0
    # Message volontairement identique quel que soit le compte : dire "ce
    # compte est bloque" confirmerait son existence.
    assert "Trop de tentatives" in bloque.json()["detail"]
