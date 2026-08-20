"""Flux HTTP de la fiche clinique (/clinics/me) et de l'annuaire public.

Sur PostgreSQL réel (testcontainers) : le manager consulte et met à jour la
fiche de SA clinique (adresse, timezone -- le clinic_id vient du token), les
entrées invalides sont refusées en 422, l'accès sans session en 401, et
l'annuaire public /public/clinics expose (sans auth) la projection minimale
paginée.
"""

import httpx
import pytest

CLINIC_LILAS = {
    "clinic_name": "Clinique des Lilas",
    "email": "gerant@lilas.fr",
    "password": "correct-horse-battery",
    "first_name": "Vera",
    "last_name": "Toli",
}

CLINIC_ACACIAS = {
    "clinic_name": "Clinique des Acacias",
    "email": "gerant@acacias.fr",
    "password": "acacias-mot-de-passe",
    "first_name": "Omar",
    "last_name": "Diallo",
}

FULL_PROFILE = {
    "name": "Clinique des Lilas",
    "phone": "+33140000000",
    "address": {
        "line1": "12 rue des Lilas",
        "line2": None,
        "postal_code": "75011",
        "city": "Paris",
        "country": "FR",
    },
    "timezone": "Europe/Brussels",
}


async def _register_and_login(client: httpx.AsyncClient, payload: dict[str, str]) -> None:
    """Inscrit une clinique puis connecte son manager (cookies staff posés)."""
    response = await client.post("/api/v1/clinics/register", json=payload)
    assert response.status_code == 201, response.text
    response = await client.post(
        "/api/v1/auth/login", json={"email": payload["email"], "password": payload["password"]}
    )
    assert response.status_code == 200, response.text


async def test_fiche_clinique_lecture_et_mise_a_jour(client: httpx.AsyncClient) -> None:
    await _register_and_login(client, CLINIC_LILAS)

    # GET initial : fiche vierge -- adresse nulle, timezone par défaut
    # (server_default de la migration + défaut de l'entité).
    response = await client.get("/api/v1/clinics/me")
    assert response.status_code == 200, response.text
    me = response.json()
    assert me["name"] == "Clinique des Lilas"
    assert me["email"] == "gerant@lilas.fr"
    assert me["address"] is None
    assert me["timezone"] == "Europe/Paris"

    # PUT : adresse complète + timezone ; la réponse reflète la fiche à jour.
    response = await client.put("/api/v1/clinics/me", json=FULL_PROFILE)
    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated["address"]["city"] == "Paris"
    assert updated["timezone"] == "Europe/Brussels"
    # L'email n'est pas modifiable par cette route : absent du schéma
    # d'entrée, il reste l'identifiant d'inscription.
    assert updated["email"] == "gerant@lilas.fr"

    # Le GET suivant relit la même fiche depuis la base.
    response = await client.get("/api/v1/clinics/me")
    assert response.json() == updated


async def test_timezone_inconnue_refusee_en_422(client: httpx.AsyncClient) -> None:
    """ "Mars/Olympus" passe le schéma (str non vide) mais le VO Timezone la
    refuse (base IANA via zoneinfo) -> 422 domaine, fiche intacte."""
    await _register_and_login(client, CLINIC_LILAS)

    response = await client.put(
        "/api/v1/clinics/me", json={**FULL_PROFILE, "timezone": "Mars/Olympus"}
    )
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "domain.validation"

    # Rien n'a été persisté : la fiche est restée vierge.
    response = await client.get("/api/v1/clinics/me")
    assert response.json()["timezone"] == "Europe/Paris"
    assert response.json()["address"] is None


async def test_sans_cookie_la_fiche_repond_401(client: httpx.AsyncClient) -> None:
    """GET et PUT /clinics/me exigent la session staff (cookie vetolib_access)."""
    anonymous = httpx.AsyncClient(transport=client._transport, base_url="http://test")
    async with anonymous:
        assert (await anonymous.get("/api/v1/clinics/me")).status_code == 401
        assert (await anonymous.put("/api/v1/clinics/me", json=FULL_PROFILE)).status_code == 401


@pytest.mark.skip(
    reason="Aucun compte ASV n'est créable au bootstrap : l'inscription ne crée "
    "que le manager et il n'existe pas encore d'endpoint staff:manage pour "
    "ajouter du personnel. Le 403 attendu (require_permission('clinic:manage') "
    "refuse un rôle sans la permission) sera couvert quand la gestion du "
    "personnel arrivera."
)
async def test_un_asv_ne_peut_pas_modifier_la_fiche(client: httpx.AsyncClient) -> None:
    """Documenté mais non exécutable pour l'instant (voir reason du skip)."""
    raise AssertionError("Ecrire ce test avec un compte ASV quand staff:manage existera.")


async def test_annuaire_public_liste_et_pagination(client: httpx.AsyncClient) -> None:
    """GET /public/clinics : sans auth, projection minimale, tri par nom,
    pagination limit/offset."""
    # Deux cliniques ; seule Lilas renseigne son adresse (donc sa ville).
    await _register_and_login(client, CLINIC_LILAS)
    assert (await client.put("/api/v1/clinics/me", json=FULL_PROFILE)).status_code == 200
    response = await client.post("/api/v1/clinics/register", json=CLINIC_ACACIAS)
    assert response.status_code == 201

    # Client anonyme : l'annuaire est public, aucune session requise.
    anonymous = httpx.AsyncClient(transport=client._transport, base_url="http://test")
    async with anonymous:
        response = await anonymous.get("/api/v1/public/clinics")
        assert response.status_code == 200, response.text
        clinics = response.json()
        # Tri par nom : Acacias avant Lilas. Projection minimale : ni email,
        # ni téléphone, ni adresse complète ne sortent par cette porte.
        assert [c["name"] for c in clinics] == ["Clinique des Acacias", "Clinique des Lilas"]
        assert all(set(c) == {"id", "name", "city"} for c in clinics)
        assert clinics[0]["city"] is None  # adresse jamais renseignée
        assert clinics[1]["city"] == "Paris"

        # Pagination : limit=1 page par page, dans le même ordre stable.
        page1 = (await anonymous.get("/api/v1/public/clinics", params={"limit": 1})).json()
        page2 = (
            await anonymous.get("/api/v1/public/clinics", params={"limit": 1, "offset": 1})
        ).json()
        assert [c["name"] for c in page1] == ["Clinique des Acacias"]
        assert [c["name"] for c in page2] == ["Clinique des Lilas"]

        # Bornes : limit hors [1, 100] -> 422 automatique (Query de FastAPI).
        assert (
            await anonymous.get("/api/v1/public/clinics", params={"limit": 0})
        ).status_code == 422
        assert (
            await anonymous.get("/api/v1/public/clinics", params={"limit": 101})
        ).status_code == 422
