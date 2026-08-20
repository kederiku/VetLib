"""Flux HTTP complet du CRUD des animaux (/owner/pets, portail B2C).

Sur PostgreSQL réel (testcontainers) : parcours complet d'un propriétaire
(créer, lister, éditer, supprimer ses animaux), preuve du soft delete en
base (la ligne survit au DELETE), et surtout la BARRIERE D'APPARTENANCE de
bout en bout : un autre propriétaire, authentifié, ne peut ni voir ni
toucher les animaux du premier (404 uniforme, sans révéler leur existence).
"""

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

OWNER_A = {
    "email": "ana@exemple.fr",
    "password": "croquettes-pour-rex",
    "first_name": "Ana",
    "last_name": "Martin",
    "phone": None,
}

OWNER_B = {
    "email": "bruno@exemple.fr",
    "password": "gamelle-de-bruno-2026",
    "first_name": "Bruno",
    "last_name": "Petit",
    "phone": None,
}


async def _register_and_login(client: httpx.AsyncClient, payload: dict[str, str | None]) -> None:
    """Inscrit puis connecte un propriétaire (cookies posés sur le client)."""
    response = await client.post("/api/v1/owner/auth/register", json=payload)
    assert response.status_code == 201, response.text
    response = await client.post(
        "/api/v1/owner/auth/login",
        json={"email": payload["email"], "password": payload["password"]},
    )
    assert response.status_code == 200, response.text


async def test_crud_complet_des_animaux(client: httpx.AsyncClient, app_env: dict[str, str]) -> None:
    await _register_and_login(client, OWNER_A)

    # Liste vide au départ.
    response = await client.get("/api/v1/owner/pets")
    assert response.status_code == 200
    assert response.json() == []

    # Création -> 201, fiche complète (id généré côté domaine).
    response = await client.post("/api/v1/owner/pets", json={"name": "Rex", "species": "dog"})
    assert response.status_code == 201, response.text
    rex = response.json()
    assert set(rex) == {"id", "name", "species"}
    assert rex["species"] == "dog"
    response = await client.post("/api/v1/owner/pets", json={"name": "Alba", "species": "cat"})
    assert response.status_code == 201
    alba = response.json()

    # Une espèce hors enum est refusée par le schéma (422 Pydantic), avant
    # même la contrainte CHECK de la base.
    response = await client.post("/api/v1/owner/pets", json={"name": "Zorg", "species": "dragon"})
    assert response.status_code == 422

    # Liste triée par nom.
    response = await client.get("/api/v1/owner/pets")
    assert [pet["name"] for pet in response.json()] == ["Alba", "Rex"]

    # PATCH partiel : species change, name (absent du body) est conservé.
    response = await client.patch(f"/api/v1/owner/pets/{rex['id']}", json={"species": "nac"})
    assert response.status_code == 200, response.text
    assert response.json() == {"id": rex["id"], "name": "Rex", "species": "nac"}

    # DELETE -> 204 sans corps, l'animal disparaît de listMyPets.
    response = await client.delete(f"/api/v1/owner/pets/{alba['id']}")
    assert response.status_code == 204
    response = await client.get("/api/v1/owner/pets")
    assert [pet["name"] for pet in response.json()] == ["Rex"]

    # Un second DELETE du même animal : introuvable (déjà soft-deleted).
    response = await client.delete(f"/api/v1/owner/pets/{alba['id']}")
    assert response.status_code == 404
    assert response.json()["code"] == "patients.pet_not_found"

    # Preuve du soft delete EN BASE : la ligne survit, deleted_at est posé
    # (jamais de DELETE SQL -- l'historique médical futur doit survivre).
    engine = create_async_engine(app_env["DATABASE_URL"])
    try:
        async with engine.connect() as conn:
            deleted = (
                await conn.execute(
                    text("SELECT deleted_at IS NOT NULL FROM pets WHERE id = :id"),
                    {"id": alba["id"]},
                )
            ).scalar_one()
            assert deleted is True
    finally:
        await engine.dispose()


async def test_sans_cookie_les_routes_pets_repondent_401(client: httpx.AsyncClient) -> None:
    """Toutes les routes /owner/pets exigent la session owner (CurrentOwnerDep)."""
    anonymous = httpx.AsyncClient(transport=client._transport, base_url="http://test")
    async with anonymous:
        assert (await anonymous.get("/api/v1/owner/pets")).status_code == 401
        response = await anonymous.post(
            "/api/v1/owner/pets", json={"name": "Rex", "species": "dog"}
        )
        assert response.status_code == 401


async def test_le_pet_d_un_autre_owner_est_introuvable(client: httpx.AsyncClient) -> None:
    """SECURITE de bout en bout : owner B, authentifié, attaque le pet de A.

    PATCH et DELETE répondent 404 (pas 403 : ne pas révéler l'existence de
    l'animal), la fiche de A reste intacte, et la liste de B reste vide --
    le filtre owner_id est appliqué EN SQL par le port PetRepository.
    """
    # Owner A crée son animal.
    await _register_and_login(client, OWNER_A)
    response = await client.post("/api/v1/owner/pets", json={"name": "Rex", "species": "dog"})
    pet_id = response.json()["id"]

    # Owner B, sur un client séparé (cookie jar indépendant, même app ASGI).
    client_b = httpx.AsyncClient(transport=client._transport, base_url="http://test")
    async with client_b:
        await _register_and_login(client_b, OWNER_B)

        response = await client_b.patch(f"/api/v1/owner/pets/{pet_id}", json={"name": "Vole"})
        assert response.status_code == 404
        assert response.json()["code"] == "patients.pet_not_found"

        response = await client_b.delete(f"/api/v1/owner/pets/{pet_id}")
        assert response.status_code == 404

        # B ne voit pas les animaux de A dans sa propre liste.
        response = await client_b.get("/api/v1/owner/pets")
        assert response.json() == []

    # La fiche de A est restée intacte (toujours vivante, nom inchangé).
    response = await client.get("/api/v1/owner/pets")
    assert [pet["name"] for pet in response.json()] == ["Rex"]
