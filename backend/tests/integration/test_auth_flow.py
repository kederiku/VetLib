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


async def test_login_avec_mauvais_mot_de_passe(client: httpx.AsyncClient) -> None:
    await client.post("/api/v1/clinics/register", json=REGISTER_PAYLOAD)
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "manager@clinique.fr", "password": "wrong-password"},
    )
    assert response.status_code == 401
    assert response.json()["code"] == "identity.invalid_credentials"
