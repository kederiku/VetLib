import httpx

REGISTER_PAYLOAD = {
    "clinic_name": "Clinique des Lilas",
    "phone": "+33102030405",
    "email": "manager@clinique.fr",
    "password": "correct-horse-battery",
    "first_name": "Ana",
    "last_name": "Martin",
}


async def test_healthz(client: httpx.AsyncClient) -> None:
    response = await client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "checks": {"database": "ok", "redis": "ok"}}


async def test_register_login_me_refresh_logout(client: httpx.AsyncClient) -> None:
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
    assert "HttpOnly" in access_cookie and "Path=/" in access_cookie
    assert "HttpOnly" in refresh_cookie and "Path=/api/v1/auth/refresh" in refresh_cookie

    # /me -> profil complet avec fat token appliqué
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 200
    me = response.json()
    assert me["email"] == "manager@clinique.fr"
    assert me["clinic_name"] == "Clinique des Lilas"
    assert me["role"] == "manager"
    assert "clinic:manage" in me["permissions"]

    # Refresh -> rotation des deux cookies
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
    On simule le perdant de la course en insérant sans passer par le contrôle."""
    import uuid
    from datetime import UTC, datetime

    import pytest
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from vetolib.identity.domain.errors import EmailAlreadyExistsError
    from vetolib.identity.domain.user import User
    from vetolib.identity.domain.value_objects import Email, HashedPassword, Role
    from vetolib.identity.infrastructure.uow import SqlAlchemyIdentityUnitOfWork

    response = await client.post("/api/v1/clinics/register", json=REGISTER_PAYLOAD)
    assert response.status_code == 201
    clinic_id = uuid.UUID(response.json()["clinic_id"])

    engine = create_async_engine(app_env["DATABASE_URL"])
    try:
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
            with pytest.raises(EmailAlreadyExistsError):
                await uow.commit()
    finally:
        await engine.dispose()


async def test_login_avec_mauvais_mot_de_passe(client: httpx.AsyncClient) -> None:
    await client.post("/api/v1/clinics/register", json=REGISTER_PAYLOAD)
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "manager@clinique.fr", "password": "wrong-password"},
    )
    assert response.status_code == 401
    assert response.json()["code"] == "identity.invalid_credentials"
