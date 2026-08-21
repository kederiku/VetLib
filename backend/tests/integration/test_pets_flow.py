"""Flux HTTP complet du CRUD des animaux (/owner/pets, portail B2C).

Sur PostgreSQL réel (testcontainers) : parcours complet d'un propriétaire
(créer, lister, éditer, supprimer ses animaux), preuve du soft delete en
base (la ligne survit au DELETE), et surtout la BARRIERE D'APPARTENANCE de
bout en bout : un autre propriétaire, authentifié, ne peut ni voir ni
toucher les animaux du premier (404 uniforme, sans révéler leur existence).
"""

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
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
    # Egalite STRICTE et non inclusion : elle sert aussi de garde-fou
    # anti-fuite, elle attraperait un owner_id republie par erreur.
    assert set(rex) == {
        "id",
        "name",
        "species",
        "birth_date",
        "sex",
        "breed",
        "sterilized",
    }
    assert rex["species"] == "dog"
    # Defauts de la fiche enrichie : rien n'est exige a la creation, et
    # "inconnu" est une VALEUR et non un null.
    assert rex["sex"] == "unknown"
    assert rex["birth_date"] is None
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

    # Lecture unitaire : c'est ce que consulte la page de fiche animal.
    response = await client.get(f"/api/v1/owner/pets/{rex['id']}")
    assert response.status_code == 200, response.text
    assert response.json()["name"] == "Rex"

    # PUT : la fiche envoyee REMPLACE l'existante, en entier.
    response = await client.put(
        f"/api/v1/owner/pets/{rex['id']}",
        json={
            "name": "Rex",
            "species": "nac",
            "birth_date": "2021-03-12",
            "sex": "male",
            "breed": "Berger australien",
            "sterilized": True,
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["species"] == "nac"
    assert response.json()["breed"] == "Berger australien"

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
        pet_id = "00000000-0000-0000-0000-0000000000e1"
        assert (await anonymous.get(f"/api/v1/owner/pets/{pet_id}")).status_code == 401


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

        response = await client_b.put(
            f"/api/v1/owner/pets/{pet_id}", json={"name": "Vole", "species": "dog"}
        )
        assert response.status_code == 404
        assert response.json()["code"] == "patients.pet_not_found"

        # La LECTURE unitaire a la meme barriere que l'ecriture : sinon
        # elle serait un oracle d'existence.
        response = await client_b.get(f"/api/v1/owner/pets/{pet_id}")
        assert response.status_code == 404

        response = await client_b.delete(f"/api/v1/owner/pets/{pet_id}")
        assert response.status_code == 404

        # B ne voit pas les animaux de A dans sa propre liste.
        response = await client_b.get("/api/v1/owner/pets")
        assert response.json() == []

    # La fiche de A est restée intacte (toujours vivante, nom inchangé).
    response = await client.get("/api/v1/owner/pets")
    assert [pet["name"] for pet in response.json()] == ["Rex"]


async def test_un_body_legacy_name_species_reste_accepte(client: httpx.AsyncClient) -> None:
    """L'enrichissement de la fiche est ADDITIF : l'ancien contrat vaut encore.

    Tous les champs ajoutes sont facultatifs cote creation ; un client qui
    n'envoie que le nom et l'espece ne doit pas se voir refuser.
    """
    await _register_and_login(client, OWNER_A)

    response = await client.post("/api/v1/owner/pets", json={"name": "Rex", "species": "dog"})

    assert response.status_code == 201, response.text


async def test_le_put_efface_un_champ_omis(
    client: httpx.AsyncClient, app_env: dict[str, str]
) -> None:
    """C'est TOUT l'interet du PUT : vider une race saisie par erreur.

    Ce test relit la ligne EN BASE, et pas seulement la reponse HTTP : la
    persistance passe par session.merge(), qui ecrit toutes les colonnes du
    modele. Un champ oublie dans le mapper entite -> modele serait remis a
    NULL sans la moindre erreur -- une perte de donnees silencieuse que
    seule une relecture en base peut detecter.
    """
    await _register_and_login(client, OWNER_A)
    response = await client.post(
        "/api/v1/owner/pets",
        json={
            "name": "Rex",
            "species": "dog",
            "breed": "Berger australien",
            "birth_date": "2021-03-12",
            "sex": "male",
            "sterilized": True,
        },
    )
    pet_id = response.json()["id"]

    # Fiche renvoyee SANS race ni sterilisation : elles sont effacees.
    response = await client.put(
        f"/api/v1/owner/pets/{pet_id}",
        json={"name": "Rex", "species": "dog", "birth_date": "2021-03-12", "sex": "male"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["breed"] is None
    assert response.json()["sterilized"] is None
    # Les champs FOURNIS, eux, survivent au remplacement.
    assert response.json()["birth_date"] == "2021-03-12"

    engine = create_async_engine(app_env["DATABASE_URL"])
    try:
        async with engine.connect() as conn:
            ligne = (
                await conn.execute(
                    text("SELECT breed, birth_date, sex FROM pets WHERE id = :id"),
                    {"id": pet_id},
                )
            ).one()
            assert ligne.breed is None
            assert ligne.birth_date.isoformat() == "2021-03-12"
            assert ligne.sex == "male"
    finally:
        await engine.dispose()


async def test_une_date_de_naissance_future_est_refusee(client: httpx.AsyncClient) -> None:
    """La regle vit dans le domaine : DomainValidationError -> 422."""
    await _register_and_login(client, OWNER_A)

    response = await client.post(
        "/api/v1/owner/pets",
        json={"name": "Rex", "species": "dog", "birth_date": "2099-01-01"},
    )

    assert response.status_code == 422, response.text
    assert response.json()["code"] == "domain.validation"


async def test_un_sexe_hors_enum_est_refuse_par_le_schema(client: httpx.AsyncClient) -> None:
    """Defense en profondeur : Pydantic refuse avant meme le CHECK SQL."""
    await _register_and_login(client, OWNER_A)

    response = await client.post(
        "/api/v1/owner/pets",
        json={"name": "Rex", "species": "dog", "sex": "hermaphrodite"},
    )

    assert response.status_code == 422


async def test_la_contrainte_check_refuse_un_sexe_invalide_en_base(
    client: httpx.AsyncClient, app_env: dict[str, str]
) -> None:
    """Le dernier rempart, celui qu'aucune autre verification ne couvre.

    `alembic check` ne compare NI les contraintes CHECK NI les defauts
    serveur : sans ce test, rien ne prouverait que ck_pets_sex_valid existe
    reellement en base. On ecrit donc en SQL brut, en contournant l'API et
    l'ORM.

    La valeur invalide est COURTE ('autre', 5 caracteres) : plus longue que
    varchar(10), c'est la contrainte de longueur qui refuserait l'insertion,
    et le test passerait pour une mauvaise raison.
    """
    await _register_and_login(client, OWNER_A)
    response = await client.post("/api/v1/owner/pets", json={"name": "Rex", "species": "dog"})
    owner_id_stmt = text("SELECT owner_id FROM pets WHERE id = :id")

    engine = create_async_engine(app_env["DATABASE_URL"])
    try:
        async with engine.connect() as conn:
            owner_id = (
                await conn.execute(owner_id_stmt, {"id": response.json()["id"]})
            ).scalar_one()
            with pytest.raises(IntegrityError):
                await conn.execute(
                    text(
                        "INSERT INTO pets (id, owner_id, name, species, sex, created_at) "
                        "VALUES (gen_random_uuid(), :owner_id, 'Zorg', 'dog', "
                        "'autre', now())"
                    ),
                    {"owner_id": owner_id},
                )
    finally:
        await engine.dispose()
