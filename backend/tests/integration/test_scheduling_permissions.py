"""Permissions des routes scheduling par role (tests d'integration).

Ce fichier verrouille le decoupage lecture/gestion introduit dans les
routeurs resources et appointment_types :
- la LECTURE des listes (praticiens, types de RDV) demande appointment:read,
  une permission que tout le staff possede (ASV, veterinaire, manager) --
  c'est un prerequis de l'ecran Agenda, pas un acte de gestion ;
- toute ECRITURE (creation, modification, suppression) et les ecrans de
  reglages (semaine type, absences) restent reserves au manager via
  clinic:manage.

Pourquoi un test d'integration et pas unitaire : les gardes sont des
dependances FastAPI (require_permission) posees sur les routes ; seul un
appel HTTP complet (login -> cookie JWT -> route) prouve qu'elles repondent
bien 200 ou 403 selon le role du token.
"""

import uuid
from datetime import UTC, datetime

import httpx
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from vetolib.identity.domain.user import User
from vetolib.identity.domain.value_objects import Email, HashedPassword, Role
from vetolib.identity.infrastructure.password_hasher import PwdlibPasswordHasher
from vetolib.identity.infrastructure.uow import SqlAlchemyIdentityUnitOfWork

MANAGER_PASSWORD = "correct-horse-battery"
ASV_PASSWORD = "accueil-secretariat-42"


async def _create_asv_user(app_env: dict[str, str], clinic_id: uuid.UUID, email: str) -> None:
    """Cree un utilisateur ASV directement via la UoW (gabarit test_auth_flow).

    Il n'existe pas encore d'endpoint "inviter un membre du staff" : on passe
    donc par la couche infrastructure, avec un VRAI hash Argon2 pour que le
    compte soit loguable ensuite via POST /auth/login comme en production.
    """
    engine = create_async_engine(app_env["DATABASE_URL"])
    try:
        sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
        hashed = await PwdlibPasswordHasher().hash(ASV_PASSWORD)
        async with SqlAlchemyIdentityUnitOfWork(sessionmaker, app_db_role="vetolib_app") as uow:
            asv = User.create(
                clinic_id=clinic_id,
                email=Email(email),
                hashed_password=HashedPassword(hashed),
                first_name="Sam",
                last_name="Accueil",
                role=Role.ASV,
                now=datetime.now(UTC),
            )
            await uow.users.add(asv)
            await uow.commit()
    finally:
        await engine.dispose()


async def test_asv_lit_les_reglages_mais_ne_les_gere_pas(
    client: httpx.AsyncClient, app_env: dict[str, str]
) -> None:
    """Un ASV peut LIRE praticiens et types (prerequis de l'agenda) mais
    recoit 403 sur toute route de gestion, restee reservee au manager."""
    # Arrange : clinique + manager via l'API reelle (register cree les deux).
    response = await client.post(
        "/api/v1/clinics/register",
        json={
            "clinic_name": "Clinique des Lilas",
            "email": "manager@clinique.fr",
            "password": MANAGER_PASSWORD,
            "first_name": "Vera",
            "last_name": "Toli",
        },
    )
    assert response.status_code == 201, response.text
    clinic_id = uuid.UUID(response.json()["clinic_id"])

    # Le manager se connecte et pose les reglages que l'ASV tentera ensuite
    # de lire (autorise) puis de modifier (refuse).
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "manager@clinique.fr", "password": MANAGER_PASSWORD},
    )
    assert response.status_code == 200, response.text

    response = await client.post(
        "/api/v1/scheduling/appointment-types",
        json={"name": "Consultation", "duration_minutes": 30},
    )
    assert response.status_code == 201, response.text
    type_id = response.json()["id"]

    response = await client.post(
        "/api/v1/scheduling/resources", json={"name": "Dr Martin", "user_id": None}
    )
    assert response.status_code == 201, response.text
    resource_id = response.json()["id"]

    # Non-regression manager : la liste des praticiens reste accessible au
    # manager apres le passage de la garde du routeur aux gardes par route
    # (le manager cumule appointment:read via la hierarchie des roles).
    response = await client.get("/api/v1/scheduling/resources")
    assert response.status_code == 200, response.text
    assert [r["name"] for r in response.json()] == ["Dr Martin"]

    # Un ASV rejoint la meme clinique, puis se connecte : le login remplace
    # les cookies du manager dans le jar du client (comme un navigateur).
    await _create_asv_user(app_env, clinic_id, "asv@clinique.fr")
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "asv@clinique.fr", "password": ASV_PASSWORD},
    )
    assert response.status_code == 200, response.text

    # LECTURE des listes -> 200 : c'est tout l'objet du decoupage, l'ecran
    # Agenda de l'ASV charge praticiens et types pour construire ses colonnes
    # et son formulaire de prise de RDV au comptoir.
    response = await client.get("/api/v1/scheduling/resources")
    assert response.status_code == 200, response.text
    assert [r["name"] for r in response.json()] == ["Dr Martin"]

    response = await client.get("/api/v1/scheduling/appointment-types")
    assert response.status_code == 200, response.text
    assert [t["name"] for t in response.json()] == ["Consultation"]

    # ECRITURE -> 403 : creer un praticien ou modifier un type de RDV sont
    # des actes de gestion de la clinique (clinic:manage, manager seulement).
    response = await client.post(
        "/api/v1/scheduling/resources", json={"name": "Dr Pirate", "user_id": None}
    )
    assert response.status_code == 403, response.text

    response = await client.put(
        f"/api/v1/scheduling/appointment-types/{type_id}",
        json={"name": "Consultation longue", "duration_minutes": 45, "active": True},
    )
    assert response.status_code == 403, response.text

    # Semaine type -> 403 meme en LECTURE : ecran de reglages de la clinique,
    # volontairement inchange (l'agenda consomme les disponibilites deja
    # calculees, il n'a pas besoin des horaires bruts).
    response = await client.get(f"/api/v1/scheduling/resources/{resource_id}/weekly-schedule")
    assert response.status_code == 403, response.text

    # Non-regression : l'agenda lui-meme (appointment:read) reste accessible.
    today = str(datetime.now(UTC).date())
    response = await client.get(
        "/api/v1/scheduling/agenda", params={"date_from": today, "date_to": today}
    )
    assert response.status_code == 200, response.text
