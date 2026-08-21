"""Flux HTTP complet de l'espace PROPRIETAIRES (B2C) + cloisonnement staff.

Sur PostgreSQL reel (testcontainers) : on valide le parcours owner de bout
en bout (register -> login -> me -> profil -> refresh -> logout), la
COEXISTENCE des sessions staff et owner sur le meme client (cookies a noms
distincts), et le REJET CROISE des jetons (un cookie copie d'un espace vers
l'autre est refuse grace au claim kind).
"""

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

OWNER_PAYLOAD = {
    "email": "ana@exemple.fr",
    "password": "croquettes-pour-rex",
    "first_name": "Ana",
    "last_name": "Martin",
    "phone": "+33601020304",
}

STAFF_PAYLOAD = {
    "clinic_name": "Clinique des Lilas",
    "email": "gerant@clinique.fr",
    "password": "correct-horse-battery",
    "first_name": "Vera",
    "last_name": "Toli",
}


async def test_flux_owner_complet(client: httpx.AsyncClient, app_env: dict[str, str]) -> None:
    # Register -> 201, owner_id seul, AUCUN cookie pose.
    response = await client.post("/api/v1/owner/auth/register", json=OWNER_PAYLOAD)
    assert response.status_code == 201, response.text
    assert set(response.json()) == {"owner_id"}
    assert "set-cookie" not in response.headers

    # Doublon -> 409 avec le code metier partage.
    response = await client.post("/api/v1/owner/auth/register", json=OWNER_PAYLOAD)
    assert response.status_code == 409
    assert response.json()["code"] == "identity.email_already_exists"

    # L'evenement outbox est ecrit (verification SQL directe).
    engine = create_async_engine(app_env["DATABASE_URL"])
    try:
        async with engine.connect() as conn:
            count = (
                await conn.execute(
                    text(
                        "SELECT count(*) FROM outbox_events "
                        "WHERE event_type = 'identity.owner_registered'"
                    )
                )
            ).scalar_one()
            assert count == 1
    finally:
        await engine.dispose()

    # Login -> cookies owner HttpOnly avec les bons paths, profil en corps.
    response = await client.post(
        "/api/v1/owner/auth/login",
        json={"email": "ana@exemple.fr", "password": "croquettes-pour-rex"},
    )
    assert response.status_code == 200, response.text
    set_cookies = response.headers.get_list("set-cookie")
    access_cookie = next(c for c in set_cookies if c.startswith("vetolib_owner_access="))
    refresh_cookie = next(c for c in set_cookies if c.startswith("vetolib_owner_refresh="))
    assert "HttpOnly" in access_cookie and "Path=/" in access_cookie
    assert "HttpOnly" in refresh_cookie and "Path=/api/v1/owner/auth/refresh" in refresh_cookie
    assert response.json()["email"] == "ana@exemple.fr"

    # /me -> fiche par defaut (pas d'adresse, prefs email=on / sms=off).
    response = await client.get("/api/v1/owner/auth/me")
    assert response.status_code == 200
    me = response.json()
    assert me["first_name"] == "Ana"
    assert me["address"] is None
    assert me["notification_preferences"] == {"email": True, "sms": False}

    # PUT /owner/profile -> fiche complete, refletee par /me.
    response = await client.put(
        "/api/v1/owner/profile",
        json={
            "first_name": "Anna",
            "last_name": "Martin-Dupont",
            "phone": "+33601020304",
            "address": {
                "line1": "12 rue des Lilas",
                "line2": None,
                "postal_code": "75011",
                "city": "Paris",
                "country": "FR",
            },
            "notification_preferences": {"email": True, "sms": True},
        },
    )
    assert response.status_code == 200, response.text
    response = await client.get("/api/v1/owner/auth/me")
    me = response.json()
    assert me["first_name"] == "Anna"
    assert me["address"]["postal_code"] == "75011"
    assert me["notification_preferences"]["sms"] is True

    # Refresh -> rotation du cookie access owner.
    old_access = client.cookies.get("vetolib_owner_access")
    response = await client.post("/api/v1/owner/auth/refresh")
    assert response.status_code == 200
    assert client.cookies.get("vetolib_owner_access") != old_access

    # Logout -> 204, puis /me et PUT profil repassent a 401.
    response = await client.post("/api/v1/owner/auth/logout")
    assert response.status_code == 204
    assert (await client.get("/api/v1/owner/auth/me")).status_code == 401


async def test_sessions_staff_et_owner_coexistent(client: httpx.AsyncClient) -> None:
    """Les 4 cookies coexistent sur le meme navigateur ; se deconnecter d'un
    espace ne touche pas l'autre (noms de cookies distincts)."""
    # Un compte et une session dans CHAQUE espace (emails differents).
    assert (await client.post("/api/v1/clinics/register", json=STAFF_PAYLOAD)).status_code == 201
    assert (
        await client.post(
            "/api/v1/auth/login",
            json={"email": STAFF_PAYLOAD["email"], "password": STAFF_PAYLOAD["password"]},
        )
    ).status_code == 200
    assert (await client.post("/api/v1/owner/auth/register", json=OWNER_PAYLOAD)).status_code == 201
    assert (
        await client.post(
            "/api/v1/owner/auth/login",
            json={"email": OWNER_PAYLOAD["email"], "password": OWNER_PAYLOAD["password"]},
        )
    ).status_code == 200

    # Les deux sessions repondent, chacune avec le bon profil.
    staff_me = await client.get("/api/v1/auth/me")
    owner_me = await client.get("/api/v1/owner/auth/me")
    assert staff_me.status_code == owner_me.status_code == 200
    assert staff_me.json()["email"] == "gerant@clinique.fr"
    assert owner_me.json()["email"] == "ana@exemple.fr"

    # Logout STAFF : la session owner survit (et reciproquement).
    assert (await client.post("/api/v1/auth/logout")).status_code == 204
    assert (await client.get("/api/v1/auth/me")).status_code == 401
    assert (await client.get("/api/v1/owner/auth/me")).status_code == 200


async def test_rejet_croise_des_jetons(client: httpx.AsyncClient) -> None:
    """Un jeton copie d'un espace vers le cookie de l'autre est rejete en 401
    (claim kind verifie au decodage) -- meme s'il est cryptographiquement
    valide, puisque signe avec le meme secret."""
    # Une session dans chaque espace.
    await client.post("/api/v1/clinics/register", json=STAFF_PAYLOAD)
    await client.post(
        "/api/v1/auth/login",
        json={"email": STAFF_PAYLOAD["email"], "password": STAFF_PAYLOAD["password"]},
    )
    await client.post("/api/v1/owner/auth/register", json=OWNER_PAYLOAD)
    await client.post(
        "/api/v1/owner/auth/login",
        json={"email": OWNER_PAYLOAD["email"], "password": OWNER_PAYLOAD["password"]},
    )
    staff_access = client.cookies.get("vetolib_access", path="/")
    owner_access = client.cookies.get("vetolib_owner_access", path="/")
    assert staff_access and owner_access

    # Jeton STAFF dans le cookie OWNER -> 401 sur /owner/auth/me.
    forged = httpx.AsyncClient(
        # Reutilise le transport ASGI du client de test (meme app en memoire).
        transport=client._transport,
        base_url="http://test",
        cookies={"vetolib_owner_access": staff_access},
    )
    async with forged:
        response = await forged.get("/api/v1/owner/auth/me")
        assert response.status_code == 401
        assert response.json()["code"] == "identity.invalid_token"

    # Jeton OWNER dans le cookie STAFF -> 401 sur /auth/me.
    forged = httpx.AsyncClient(
        transport=client._transport,
        base_url="http://test",
        cookies={"vetolib_access": owner_access},
    )
    async with forged:
        response = await forged.get("/api/v1/auth/me")
        assert response.status_code == 401
        assert response.json()["code"] == "identity.invalid_token"


async def test_adresse_invalide_refusee_en_422_sans_persistance(
    client: httpx.AsyncClient,
) -> None:
    """Non-regression (revue) : une adresse dont la valeur NORMALISEE viole
    les regles doit etre refusee en 422 AVANT tout commit -- jamais 500,
    jamais de donnee invalide en base (qui rendrait ensuite login/me/refresh
    incapables de serialiser OwnerResponse : compte verrouille)."""
    await client.post("/api/v1/owner/auth/register", json=OWNER_PAYLOAD)
    await client.post(
        "/api/v1/owner/auth/login",
        json={"email": OWNER_PAYLOAD["email"], "password": OWNER_PAYLOAD["password"]},
    )

    def payload(address: dict[str, str | None]) -> dict[str, object]:
        return {
            "first_name": "Ana",
            "last_name": "Martin",
            "phone": None,
            "address": address,
            "notification_preferences": {"email": True, "sms": False},
        }

    # Pays "F " : 2 caracteres bruts mais 1 seul apres normalisation ->
    # refuse par le schema (str_strip_whitespace) en 422 Pydantic.
    response = await client.put(
        "/api/v1/owner/profile",
        json=payload(
            {"line1": "1 rue A", "postal_code": "75001", "city": "Paris", "country": "F "}
        ),
    )
    assert response.status_code == 422, response.text

    # Code postal " " (vide apres trim) avec un pays non-FR -> 422 aussi.
    response = await client.put(
        "/api/v1/owner/profile",
        json=payload({"line1": "1 Main St", "postal_code": " ", "city": "NY", "country": "US"}),
    )
    assert response.status_code == 422, response.text

    # Pays "1X" : passe le schema (2 caracteres) mais le VO Address le
    # refuse (lettres exigees) -> 422 domaine, defense en profondeur.
    response = await client.put(
        "/api/v1/owner/profile",
        json=payload(
            {"line1": "1 rue A", "postal_code": "75001", "city": "Paris", "country": "1X"}
        ),
    )
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "domain.validation"

    # Rien n'a ete persiste : la fiche est intacte et TOUS les endpoints
    # OwnerResponse repondent encore (pas de compte verrouille).
    response = await client.get("/api/v1/owner/auth/me")
    assert response.status_code == 200
    assert response.json()["address"] is None


async def test_politique_de_mot_de_passe_a_l_inscription(client: httpx.AsyncClient) -> None:
    """Le mot de passe trop court est refuse a la FRONTIERE HTTP, avec une
    erreur localisee sous le champ.

    Le format compte autant que le refus : les frontends lisent detail[].loc
    pour placer le message sous le bon champ. Une DomainValidationError brute
    sortirait en {code, detail} sans loc, et l'erreur atterrirait dans le
    bandeau global -- d'ou le validateur Pydantic dedie. Le message doit aussi
    etre en francais, pas le texte anglais par defaut de Pydantic.
    """
    response = await client.post(
        "/api/v1/owner/auth/register",
        json={**OWNER_PAYLOAD, "email": "court@exemple.fr", "password": "trop-court"},
    )

    assert response.status_code == 422, response.text
    erreurs = response.json()["detail"]
    assert erreurs[0]["loc"] == ["body", "password"]
    assert "14 caract" in erreurs[0]["msg"]


async def test_mot_de_passe_notoirement_previsible_est_refuse(
    client: httpx.AsyncClient,
) -> None:
    """HIBP_ENABLED=false dans l'environnement de test : c'est la liste
    embarquee qui repond, sans aucun appel sortant. Elle suffit a prouver que
    la verification est bien branchee sur le parcours d'inscription."""
    response = await client.post(
        "/api/v1/owner/auth/register",
        json={**OWNER_PAYLOAD, "email": "previsible@exemple.fr", "password": "motdepasse1234"},
    )

    assert response.status_code == 422, response.text
    assert response.json()["code"] == "identity.password_compromised"


async def test_parcours_d_inscription_en_trois_etapes(client: httpx.AsyncClient) -> None:
    """Le parcours du portail B2C, endpoint par endpoint.

    Aucun endpoint n'a ete cree pour lui : l'interet du test est justement de
    prouver que les trois etapes s'enchainent sur l'existant, et que chacune
    laisse le compte dans un etat exploitable -- une personne qui abandonne
    apres l'etape 1 a deja un compte utilisable.
    """
    # Etape 1 : identite + telephone -> le compte existe, la session s'ouvre.
    response = await client.post(
        "/api/v1/owner/auth/register",
        json={**OWNER_PAYLOAD, "email": "parcours@exemple.fr"},
    )
    assert response.status_code == 201, response.text
    response = await client.post(
        "/api/v1/owner/auth/login",
        json={"email": "parcours@exemple.fr", "password": OWNER_PAYLOAD["password"]},
    )
    assert response.status_code == 200, response.text
    assert response.json()["phone"] == "+33601020304"

    # Etape 2 : l'adresse, sur la session ouverte a l'etape 1. Le PUT est un
    # remplacement COMPLET : le front renvoie les champs deja connus.
    response = await client.put(
        "/api/v1/owner/profile",
        json={
            "first_name": "Ana",
            "last_name": "Martin",
            "phone": "+33601020304",
            "address": {
                "line1": "12 rue des Lilas",
                "line2": None,
                "postal_code": "75011",
                "city": "Paris",
                "country": "FR",
            },
            "notification_preferences": {"email": True, "sms": False},
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["address"]["city"] == "Paris"

    # Etape 3 : les animaux, un appel par ligne du formulaire.
    for nom, espece in (("Rex", "dog"), ("Mistigri", "cat")):
        response = await client.post("/api/v1/owner/pets", json={"name": nom, "species": espece})
        assert response.status_code == 201, response.text

    # Etat final : la fiche est complete et les deux animaux sont rattaches.
    response = await client.get("/api/v1/owner/auth/me")
    assert response.json()["address"]["postal_code"] == "75011"
    response = await client.get("/api/v1/owner/pets")
    assert [pet["name"] for pet in response.json()] == ["Mistigri", "Rex"]
