"""Les listes du back-office, contre un vrai PostgreSQL.

Ce que seul un test d'integration prouve ici, et qu'aucun fake ne peut :

- la recherche insensible aux ACCENTS repose sur l'extension `unaccent`,
  installee par la migration 0009. Un fake Python normaliserait de toute
  facon ; ici on verifie que l'extension est bien la et que la requete
  l'utilise ;
- l'echappement des jokers passe par le parametre `escape` de LIKE, dont le
  comportement est celui de PostgreSQL, pas celui de Python ;
- le COUNT et le SELECT partagent bien la meme clause WHERE : un total qui
  ne correspond pas aux lignes ne se voit que sur des donnees reelles ;
- la lecture est reellement CROSS-TENANT. C'est LA propriete de cet espace,
  et c'est ce test qui echouerait si quelqu'un branchait par erreur le
  back-office sur un UoW tenant.
"""

import httpx

from tests.integration.conftest import CreateAdmin

ADMIN_EMAIL = "fondateur@vetolib.fr"
ADMIN_PASSWORD = "phrase-de-passe-fondateur"
CLINIC_PASSWORD = "correct-horse-battery"


async def _connecter_admin(client: httpx.AsyncClient) -> None:
    reponse = await client.post(
        "/api/v1/admin/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert reponse.status_code == 200, reponse.text


async def _inscrire_clinique(client: httpx.AsyncClient, nom: str, email: str) -> str:
    """Cree une clinique par le flux PUBLIC : le back-office doit voir des
    cliniques qu'il n'a pas creees lui-meme."""
    reponse = await client.post(
        "/api/v1/clinics/register",
        json={
            "clinic_name": nom,
            "email": email,
            "password": CLINIC_PASSWORD,
            "first_name": "Vera",
            "last_name": "Toli",
        },
    )
    assert reponse.status_code == 201, reponse.text
    return str(reponse.json()["clinic_id"])


async def test_la_liste_des_cliniques_pagine_cherche_et_trie(
    client: httpx.AsyncClient, create_platform_admin: CreateAdmin
) -> None:
    await create_platform_admin(ADMIN_EMAIL, ADMIN_PASSWORD)
    await _inscrire_clinique(client, "Clinique Vétérinaire du Château", "chateau@exemple.fr")
    await _inscrire_clinique(client, "Clinique des Lilas", "lilas@exemple.fr")
    await _inscrire_clinique(client, "Clinique du Parc", "parc@exemple.fr")
    await _connecter_admin(client)

    # Tri par defaut : par nom croissant. L'ordre est celui de la COLLATION
    # de la base, pas une comparaison octet par octet -- "des" precede "du"
    # qui precede "Vétérinaire", majuscules et accents ignores. C'est l'ordre
    # qu'attend un humain, et c'est pour cela qu'on laisse PostgreSQL trier
    # plutot que de trier en Python.
    toutes = await client.get("/api/v1/admin/clinics")
    assert toutes.status_code == 200, toutes.text
    corps = toutes.json()
    assert corps["total"] == 3
    assert [c["name"] for c in corps["items"]] == [
        "Clinique des Lilas",
        "Clinique du Parc",
        "Clinique Vétérinaire du Château",
    ]

    # Pagination : le total reste celui du FILTRE, pas de la tranche.
    page = await client.get("/api/v1/admin/clinics?limit=1&offset=1")
    assert page.json()["total"] == 3
    assert len(page.json()["items"]) == 1

    # Page au-dela de la fin : items vide, total intact. C'est le cas que
    # `count(*) OVER ()` aurait casse.
    au_dela = await client.get("/api/v1/admin/clinics?limit=20&offset=100")
    assert au_dela.json() == {"items": [], "total": 3, "limit": 20, "offset": 100}

    # Recherche SANS accent : l'extension unaccent fait le travail.
    sans_accent = await client.get("/api/v1/admin/clinics?search=veterinaire")
    assert [c["name"] for c in sans_accent.json()["items"]] == ["Clinique Vétérinaire du Château"]

    # Un joker est pris au pied de la lettre : preuve de l'echappement.
    joker = await client.get("/api/v1/admin/clinics?search=%25")
    assert joker.json()["total"] == 0

    # Tri descendant : l'ordre exactement inverse du precedent.
    descendant = await client.get("/api/v1/admin/clinics?sort_by=name&sort_dir=desc")
    assert [c["name"] for c in descendant.json()["items"]] == [
        "Clinique Vétérinaire du Château",
        "Clinique du Parc",
        "Clinique des Lilas",
    ]


async def test_le_plafond_de_taille_de_page_est_applique(
    client: httpx.AsyncClient, create_platform_admin: CreateAdmin
) -> None:
    """Sans plafond, un seul appel exfiltrerait la base entiere."""
    await create_platform_admin(ADMIN_EMAIL, ADMIN_PASSWORD)
    await _connecter_admin(client)

    reponse = await client.get("/api/v1/admin/clinics?limit=5000")

    assert reponse.status_code == 422


async def test_la_liste_du_personnel_traverse_les_cliniques(
    client: httpx.AsyncClient, create_platform_admin: CreateAdmin
) -> None:
    """LA preuve de la lecture cross-tenant : deux cliniques, une seule liste.

    C'est ce test qui echouerait si le back-office etait branche par erreur
    sur un UoW tenant -- la RLS ne renverrait alors que le personnel d'une
    seule clinique, et personne ne s'en apercevrait avant longtemps.
    """
    await create_platform_admin(ADMIN_EMAIL, ADMIN_PASSWORD)
    lilas = await _inscrire_clinique(client, "Clinique des Lilas", "lilas@exemple.fr")
    parc = await _inscrire_clinique(client, "Clinique du Parc", "parc@exemple.fr")
    await _connecter_admin(client)

    toutes = await client.get("/api/v1/admin/staff")

    assert toutes.status_code == 200, toutes.text
    corps = toutes.json()
    assert corps["total"] == 2
    assert {r["clinic_name"] for r in corps["items"]} == {
        "Clinique des Lilas",
        "Clinique du Parc",
    }
    assert {r["clinic_id"] for r in corps["items"]} == {lilas, parc}

    # Filtre par clinique, et recherche par NOM de clinique.
    par_clinique = await client.get(f"/api/v1/admin/staff?clinic_id={lilas}")
    assert par_clinique.json()["total"] == 1
    par_nom = await client.get("/api/v1/admin/staff?search=Parc")
    assert par_nom.json()["total"] == 1
    par_role = await client.get("/api/v1/admin/staff?role=asv")
    assert par_role.json()["total"] == 0


async def test_les_compteurs_du_tableau_de_bord(
    client: httpx.AsyncClient, create_platform_admin: CreateAdmin
) -> None:
    await create_platform_admin(ADMIN_EMAIL, ADMIN_PASSWORD)
    await _inscrire_clinique(client, "Clinique des Lilas", "lilas@exemple.fr")
    inscription = await client.post(
        "/api/v1/owner/auth/register",
        json={
            "email": "ana@exemple.fr",
            "password": "croquettes-pour-rex-42",
            "first_name": "Ana",
            "last_name": "Martin",
        },
    )
    assert inscription.status_code == 201, inscription.text
    await _connecter_admin(client)

    stats = await client.get("/api/v1/admin/stats")

    assert stats.status_code == 200, stats.text
    assert stats.json() == {
        "active_clinics": 1,
        "suspended_clinics": 0,
        "active_owners": 1,
        "inactive_owners": 0,
        "active_staff": 1,
        "inactive_staff": 0,
    }
