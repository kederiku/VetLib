"""Parcours d'authentification de bout en bout (tests d'intégration).

Chaque test reçoit la fixture "client" (voir conftest.py) : application
FastAPI réelle branchée sur un PostgreSQL testcontainers migré, base vidée
avant chaque test. On valide ici le contrat HTTP observable de l'extérieur :
codes de statut, codes d'erreur métier stables, et surtout la politique de
cookies HttpOnly (jamais de token JWT dans un body JSON) -- des garanties
que les tests unitaires, qui s'arrêtent aux use cases, ne peuvent pas donner.
"""

import httpx

# Payload de référence réutilisé par tous les tests : l'inscription crée en
# une seule transaction la clinique (le tenant) ET son premier user gérant.
REGISTER_PAYLOAD = {
    "clinic_name": "Clinique des Lilas",
    "phone": "+33102030405",
    "email": "manager@clinique.fr",
    "password": "correct-horse-battery",
    "first_name": "Ana",
    "last_name": "Martin",
}


async def test_healthz(client: httpx.AsyncClient) -> None:
    """/healthz sonde ses vraies dépendances : le Postgres et le Redis des
    conteneurs de test doivent répondre "ok" chacun."""
    response = await client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "checks": {"database": "ok", "redis": "ok"}}


async def test_register_login_me_refresh_logout(client: httpx.AsyncClient) -> None:
    """Scénario nominal complet : register -> login -> /me -> refresh -> logout.

    Un seul test-fleuve plutôt que cinq tests isolés : chaque étape sert
    d'Arrange à la suivante (le login suppose le register, /me suppose les
    cookies posés par le login, etc.), et le client httpx conserve les
    cookies entre les appels exactement comme un navigateur.
    """
    # Register -> 201
    response = await client.post("/api/v1/clinics/register", json=REGISTER_PAYLOAD)
    assert response.status_code == 201, response.text
    body = response.json()
    assert set(body) == {"clinic_id", "user_id"}

    # Email en doublon -> 409 avec code métier
    response = await client.post("/api/v1/clinics/register", json=REGISTER_PAYLOAD)
    assert response.status_code == 409
    assert response.json()["code"] == "identity.email_already_exists"

    # Login -> cookies HttpOnly posés, jamais de token dans le body
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "manager@clinique.fr", "password": "correct-horse-battery"},
    )
    assert response.status_code == 200, response.text
    assert "access_token" not in response.json()
    set_cookies = response.headers.get_list("set-cookie")
    access_cookie = next(c for c in set_cookies if c.startswith("vetolib_access="))
    refresh_cookie = next(c for c in set_cookies if c.startswith("vetolib_refresh="))
    # HttpOnly : cookie invisible pour document.cookie, donc non exfiltrable
    # par une faille XSS. Le refresh token (7 jours de validité) est en plus
    # restreint au path de son endpoint : il ne transite jamais sur les
    # autres routes, ce qui réduit sa surface d'exposition au strict minimum.
    assert "HttpOnly" in access_cookie and "Path=/" in access_cookie
    assert "HttpOnly" in refresh_cookie and "Path=/api/v1/auth/refresh" in refresh_cookie

    # /me -> profil complet avec fat token appliqué
    # ("fat token" : le JWT embarque rôle et permissions dérivés de
    # ROLE_PERMISSIONS, pour autoriser sans requête DB à chaque appel).
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 200
    me = response.json()
    assert me["email"] == "manager@clinique.fr"
    assert me["clinic_name"] == "Clinique des Lilas"
    assert me["role"] == "manager"
    assert "clinic:manage" in me["permissions"]

    # Refresh -> rotation des deux cookies
    # (le navigateur n'envoie ici que le refresh cookie, grâce à son Path ;
    # le serveur ré-émet une paire complète : l'access change forcément).
    old_access = client.cookies.get("vetolib_access")
    response = await client.post("/api/v1/auth/refresh")
    assert response.status_code == 200
    assert client.cookies.get("vetolib_access") != old_access

    # Logout -> cookies purgés, /me repasse à 401
    response = await client.post("/api/v1/auth/logout")
    assert response.status_code == 204
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 401


async def test_violation_unicite_concurrente_traduite_en_conflit(
    client: httpx.AsyncClient, app_env: dict[str, str]
) -> None:
    """Deux register concurrents passent tous deux le contrôle applicatif
    (SELECT) : l'index unique partiel est l'arbitre final, et sa violation doit
    remonter en EmailAlreadyExistsError (409), pas en IntegrityError (500).
    On simule le perdant de la course en insérant sans passer par le contrôle.

    Pourquoi un index unique "partiel" (WHERE deleted_at IS NULL) ? A cause du
    soft delete : on ne supprime jamais physiquement une ligne, un email doit
    donc pouvoir réapparaître après suppression logique du compte -- seuls les
    comptes actifs sont soumis à l'unicité. Ce test prouve que le commit du
    UoW (SqlAlchemyIdentityUnitOfWork.commit) traduit bien la violation SQL
    en erreur du domaine, comprise par le gestionnaire d'erreurs HTTP.
    """
    import uuid
    from datetime import UTC, datetime

    import pytest
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from vetolib.identity.domain.errors import EmailAlreadyExistsError
    from vetolib.identity.domain.user import User
    from vetolib.identity.domain.value_objects import Email, HashedPassword, Role
    from vetolib.identity.infrastructure.uow import SqlAlchemyIdentityUnitOfWork

    # Arrange : le "gagnant" de la course s'inscrit normalement via l'API.
    response = await client.post("/api/v1/clinics/register", json=REGISTER_PAYLOAD)
    assert response.status_code == 201
    clinic_id = uuid.UUID(response.json()["clinic_id"])

    engine = create_async_engine(app_env["DATABASE_URL"])
    try:
        # Act : le "perdant" insère le même email en sautant le SELECT de
        # contrôle -- exactement l'état d'une seconde requête arrivée entre le
        # contrôle et le commit de la première.
        sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
        async with SqlAlchemyIdentityUnitOfWork(sessionmaker, app_db_role="vetolib_app") as uow:
            duplicate = User.create(
                clinic_id=clinic_id,
                email=Email(REGISTER_PAYLOAD["email"]),
                hashed_password=HashedPassword("irrelevant"),
                first_name="Doublon",
                last_name="Perdant",
                role=Role.ASV,
                now=datetime.now(UTC),
            )
            await uow.users.add(duplicate)
            # Assert : c'est le commit (flush SQL) qui déclenche la violation
            # d'index, traduite en erreur métier et non en IntegrityError brute.
            with pytest.raises(EmailAlreadyExistsError):
                await uow.commit()
    finally:
        await engine.dispose()


async def test_login_avec_mauvais_mot_de_passe(client: httpx.AsyncClient) -> None:
    """Mauvais mot de passe -> 401 avec un code métier volontairement vague
    ("invalid_credentials") : la réponse ne révèle pas si l'email existe."""
    # Arrange : un compte existe.
    await client.post("/api/v1/clinics/register", json=REGISTER_PAYLOAD)
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "manager@clinique.fr", "password": "wrong-password"},
    )
    assert response.status_code == 401
    assert response.json()["code"] == "identity.invalid_credentials"
