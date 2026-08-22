"""Les mutations du back-office, de bout en bout sur PostgreSQL reel.

Ce que ces tests prouvent et que les tests unitaires ne peuvent pas :

- le mot de passe genere permet REELLEMENT de se connecter par le flux staff
  ordinaire. C'est la seule facon de verifier que la chaine
  generation -> Argon2 -> stockage -> verification au login tient de bout en
  bout ;
- la ligne d'audit est bien ecrite dans la meme transaction que la mutation,
  et son contenu ne fuit aucun secret (lecture SQL directe) ;
- le garde-fou du dernier gerant repond 409 en HTTP, pas 500 ;
- suspendre une clinique depuis le back-office coupe reellement l'acces de
  son personnel -- le chemin complet, du clic de l'administrateur au refus
  de connexion.
"""

import uuid

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import create_async_engine

from tests.integration.conftest import CreateAdmin

ADMIN_EMAIL = "fondateur@vetolib.fr"
ADMIN_PASSWORD = "phrase-de-passe-fondateur"


async def _connecter_admin(client: httpx.AsyncClient) -> None:
    reponse = await client.post(
        "/api/v1/admin/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert reponse.status_code == 200, reponse.text


async def _creer_clinique(
    client: httpx.AsyncClient, *, avec_gerant: bool = True
) -> tuple[str, dict[str, str] | None]:
    corps: dict[str, object] = {
        "name": "Clinique des Lilas",
        "email": "contact@lilas.fr",
        "timezone": "Europe/Paris",
    }
    if avec_gerant:
        corps["manager"] = {
            "email": "marie.durand@lilas.fr",
            "first_name": "Marie",
            "last_name": "Durand",
        }
    reponse = await client.post("/api/v1/admin/clinics", json=corps)
    assert reponse.status_code == 201, reponse.text
    donnees = reponse.json()
    return donnees["clinic"]["id"], donnees["manager"]


async def test_creer_une_clinique_et_son_gerant_puis_se_connecter(
    client: httpx.AsyncClient, create_platform_admin: CreateAdmin
) -> None:
    """Le test le plus important de ce fichier : le mot de passe genere
    ouvre bel et bien une session sur l'espace clinique."""
    await create_platform_admin(ADMIN_EMAIL, ADMIN_PASSWORD)
    await _connecter_admin(client)

    clinic_id, gerant = await _creer_clinique(client)

    assert gerant is not None
    assert gerant["role"] == "manager"
    assert len(gerant["temporary_password"]) >= 14

    connexion = await client.post(
        "/api/v1/auth/login",
        json={"email": gerant["email"], "password": gerant["temporary_password"]},
    )
    assert connexion.status_code == 200, connexion.text
    assert connexion.json()["clinic_id"] == clinic_id
    assert connexion.json()["role"] == "manager"


async def test_creer_une_clinique_sans_gerant(
    client: httpx.AsyncClient, create_platform_admin: CreateAdmin
) -> None:
    await create_platform_admin(ADMIN_EMAIL, ADMIN_PASSWORD)
    await _connecter_admin(client)

    clinic_id, gerant = await _creer_clinique(client, avec_gerant=False)

    assert gerant is None
    fiche = await client.get(f"/api/v1/admin/clinics/{clinic_id}")
    assert fiche.json()["staff_count"] == 0


async def test_un_email_deja_pris_est_refuse_en_409(
    client: httpx.AsyncClient, create_platform_admin: CreateAdmin
) -> None:
    await create_platform_admin(ADMIN_EMAIL, ADMIN_PASSWORD)
    await _connecter_admin(client)
    await _creer_clinique(client)

    doublon = await client.post(
        "/api/v1/admin/clinics",
        json={
            "name": "Autre clinique",
            "email": "contact@lilas.fr",
            "timezone": "Europe/Paris",
        },
    )

    assert doublon.status_code == 409
    assert doublon.json()["code"] == "identity.email_already_exists"


async def test_la_fiche_se_met_a_jour_sans_toucher_a_l_email(
    client: httpx.AsyncClient, create_platform_admin: CreateAdmin
) -> None:
    await create_platform_admin(ADMIN_EMAIL, ADMIN_PASSWORD)
    await _connecter_admin(client)
    clinic_id, _ = await _creer_clinique(client)

    mise_a_jour = await client.put(
        f"/api/v1/admin/clinics/{clinic_id}",
        json={
            "name": "Clinique des Lilas — Centre",
            "phone": "0102030405",
            "address": {
                "line1": "12 rue des Lilas",
                "postal_code": "75011",
                "city": "Paris",
                "country": "FR",
            },
            "timezone": "Europe/Brussels",
        },
    )

    assert mise_a_jour.status_code == 200, mise_a_jour.text
    corps = mise_a_jour.json()
    assert corps["name"] == "Clinique des Lilas — Centre"
    assert corps["timezone"] == "Europe/Brussels"
    assert corps["address"]["city"] == "Paris"
    # L'email n'est pas dans le schema d'entree : il ne peut pas changer.
    assert corps["email"] == "contact@lilas.fr"


async def test_suspendre_depuis_le_back_office_coupe_l_acces_du_personnel(
    client: httpx.AsyncClient, create_platform_admin: CreateAdmin
) -> None:
    """Le chemin complet : un clic d'administrateur, un gerant dehors."""
    await create_platform_admin(ADMIN_EMAIL, ADMIN_PASSWORD)
    await _connecter_admin(client)
    clinic_id, gerant = await _creer_clinique(client)
    assert gerant is not None

    suspension = await client.post(f"/api/v1/admin/clinics/{clinic_id}/suspend")
    assert suspension.status_code == 200, suspension.text
    assert suspension.json()["is_active"] is False

    refus = await client.post(
        "/api/v1/auth/login",
        json={"email": gerant["email"], "password": gerant["temporary_password"]},
    )
    assert refus.status_code == 403
    assert refus.json()["code"] == "identity.clinic_suspended"

    # Idempotent : un second appel ne produit ni erreur ni changement.
    encore = await client.post(f"/api/v1/admin/clinics/{clinic_id}/suspend")
    assert encore.status_code == 200
    assert encore.json()["is_active"] is False

    reactivation = await client.post(f"/api/v1/admin/clinics/{clinic_id}/reactivate")
    assert reactivation.json()["is_active"] is True
    retour = await client.post(
        "/api/v1/auth/login",
        json={"email": gerant["email"], "password": gerant["temporary_password"]},
    )
    assert retour.status_code == 200, retour.text


async def test_le_garde_fou_du_dernier_gerant_repond_409(
    client: httpx.AsyncClient, create_platform_admin: CreateAdmin
) -> None:
    await create_platform_admin(ADMIN_EMAIL, ADMIN_PASSWORD)
    await _connecter_admin(client)
    clinic_id, gerant = await _creer_clinique(client)
    assert gerant is not None

    retrogradation = await client.put(
        f"/api/v1/admin/staff/{gerant['user_id']}/role", json={"role": "asv"}
    )
    desactivation = await client.post(f"/api/v1/admin/staff/{gerant['user_id']}/deactivate")

    assert retrogradation.status_code == 409
    assert retrogradation.json()["code"] == "identity.last_manager"
    assert desactivation.status_code == 409

    # Avec un SECOND gerant, l'operation redevient possible.
    second = await client.post(
        f"/api/v1/admin/clinics/{clinic_id}/staff",
        json={
            "email": "second@lilas.fr",
            "first_name": "Bob",
            "last_name": "Second",
            "role": "manager",
        },
    )
    assert second.status_code == 201, second.text
    ok = await client.put(f"/api/v1/admin/staff/{gerant['user_id']}/role", json={"role": "asv"})
    assert ok.status_code == 200, ok.text
    assert ok.json()["role"] == "asv"


async def test_desactiver_un_membre_lui_coupe_l_acces(
    client: httpx.AsyncClient, create_platform_admin: CreateAdmin
) -> None:
    await create_platform_admin(ADMIN_EMAIL, ADMIN_PASSWORD)
    await _connecter_admin(client)
    clinic_id, _ = await _creer_clinique(client)
    ajout = await client.post(
        f"/api/v1/admin/clinics/{clinic_id}/staff",
        json={
            "email": "asv@lilas.fr",
            "first_name": "Sam",
            "last_name": "Accueil",
            "role": "asv",
        },
    )
    assert ajout.status_code == 201, ajout.text
    membre = ajout.json()

    desactivation = await client.post(f"/api/v1/admin/staff/{membre['user_id']}/deactivate")
    assert desactivation.status_code == 200, desactivation.text
    assert desactivation.json()["is_active"] is False

    refus = await client.post(
        "/api/v1/auth/login",
        json={"email": membre["email"], "password": membre["temporary_password"]},
    )
    assert refus.status_code == 403
    assert refus.json()["code"] == "identity.user_inactive"


async def test_desactiver_un_proprietaire_depuis_le_back_office(
    client: httpx.AsyncClient, create_platform_admin: CreateAdmin
) -> None:
    await create_platform_admin(ADMIN_EMAIL, ADMIN_PASSWORD)
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
    owner_id = inscription.json()["owner_id"]
    await _connecter_admin(client)

    desactivation = await client.post(f"/api/v1/admin/owners/{owner_id}/deactivate")

    assert desactivation.status_code == 200, desactivation.text
    assert desactivation.json()["is_active"] is False
    refus = await client.post(
        "/api/v1/owner/auth/login",
        json={"email": "ana@exemple.fr", "password": "croquettes-pour-rex-42"},
    )
    assert refus.status_code == 403
    assert refus.json()["code"] == "identity.owner_inactive"


async def test_le_journal_d_audit_enregistre_l_acteur_et_aucun_secret(
    client: httpx.AsyncClient, create_platform_admin: CreateAdmin, app_env: dict[str, str]
) -> None:
    """Lecture SQL directe : rien d'autre n'expose le journal aujourd'hui.

    On verifie deux choses : que la ligne existe avec le BON acteur, et
    qu'aucun secret n'y a fuite. Un journal d'audit est destine a etre lu,
    parfois par quelqu'un qui n'a pas a connaitre ces valeurs.
    """
    admin_id = await create_platform_admin(ADMIN_EMAIL, ADMIN_PASSWORD)
    await _connecter_admin(client)
    clinic_id, gerant = await _creer_clinique(client)
    assert gerant is not None
    await client.post(f"/api/v1/admin/clinics/{clinic_id}/suspend")

    engine = create_async_engine(app_env["DATABASE_URL"])
    try:
        async with engine.connect() as connexion:
            lignes = (
                await connexion.execute(
                    text(
                        "SELECT action, actor_id, actor_email, target_type, "
                        "target_id, details::text FROM admin_audit_log "
                        "ORDER BY occurred_at, action"
                    )
                )
            ).all()
    finally:
        await engine.dispose()

    actions = [ligne[0] for ligne in lignes]
    assert actions == ["clinic.created", "staff.created", "clinic.suspended"]
    assert all(ligne[1] == admin_id for ligne in lignes)
    assert all(ligne[2] == ADMIN_EMAIL for ligne in lignes)
    # Le mot de passe temporaire ne doit apparaitre NULLE PART dans le journal.
    assert all(gerant["temporary_password"] not in ligne[5] for ligne in lignes)
    suspension = next(ligne for ligne in lignes if ligne[0] == "clinic.suspended")
    assert suspension[3] == "clinic"
    assert suspension[4] == uuid.UUID(clinic_id)


async def test_le_role_applicatif_n_a_aucun_droit_sur_le_journal(
    app_env: dict[str, str],
) -> None:
    """Verrouille le REVOKE de la migration 0009, que rien d'autre n'exerce."""
    engine = create_async_engine(app_env["DATABASE_URL"])
    try:
        async with engine.begin() as connexion:
            await connexion.execute(text('SET LOCAL ROLE "vetolib_app"'))
            with pytest.raises(ProgrammingError, match="permission denied"):
                await connexion.execute(text("SELECT 1 FROM admin_audit_log"))
    finally:
        await engine.dispose()
