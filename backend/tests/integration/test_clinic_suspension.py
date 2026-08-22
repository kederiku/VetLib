"""Effets reels d'une suspension de clinique et d'une desactivation de compte.

Ce fichier prouve que le drapeau is_active n'est pas une colonne decorative :
il coupe VRAIMENT les acces, sur les cinq chemins recenses, et la
reactivation les retablit.

Pourquoi un test d'integration : chacun des controles vit dans un use case
different (login, refresh, /me) ou dans un repository d'un AUTRE contexte
(scheduling lit les cliniques pour ses flux publics). Seul un appel HTTP
complet, sur un vrai PostgreSQL, prouve que les cinq points sont bien tous
branches -- un test unitaire par use case ne dirait rien de l'ensemble.

La suspension est ici posee directement via la UoW (comme _create_asv_user
dans test_scheduling_permissions.py) : l'endpoint de back-office qui la
declenchera n'existe pas encore, mais le COMPORTEMENT qu'il pilotera, lui,
doit deja etre verrouille.
"""

import uuid
from datetime import UTC, datetime

import httpx
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from vetolib.identity.infrastructure.uow import SqlAlchemyIdentityUnitOfWork

CLINIC_PASSWORD = "correct-horse-battery"
OWNER_PASSWORD = "croquettes-pour-rex-42"


async def _changer_statut_clinique(
    app_env: dict[str, str], clinic_id: uuid.UUID, *, actif: bool
) -> None:
    """Suspend ou reactive une clinique par la couche infrastructure."""
    engine = create_async_engine(app_env["DATABASE_URL"])
    try:
        sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
        async with SqlAlchemyIdentityUnitOfWork(sessionmaker, app_db_role="vetolib_app") as uow:
            clinique = await uow.clinics.get_by_id(clinic_id)
            assert clinique is not None
            evenement = (
                clinique.reactivate(datetime.now(UTC))
                if actif
                else clinique.suspend(datetime.now(UTC))
            )
            assert evenement is not None, "le changement de statut n'a rien produit"
            await uow.clinics.update(clinique)
            uow.add_event(evenement)
            await uow.commit()
    finally:
        await engine.dispose()


async def _desactiver_proprietaire(app_env: dict[str, str], owner_id: uuid.UUID) -> None:
    engine = create_async_engine(app_env["DATABASE_URL"])
    try:
        sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
        async with SqlAlchemyIdentityUnitOfWork(sessionmaker, app_db_role="vetolib_app") as uow:
            proprietaire = await uow.owners.get_by_id(owner_id)
            assert proprietaire is not None
            evenement = proprietaire.deactivate(datetime.now(UTC))
            assert evenement is not None
            await uow.owners.update(proprietaire)
            uow.add_event(evenement)
            await uow.commit()
    finally:
        await engine.dispose()


async def _inscrire_clinique(client: httpx.AsyncClient) -> uuid.UUID:
    response = await client.post(
        "/api/v1/clinics/register",
        json={
            "clinic_name": "Clinique des Lilas",
            "email": "manager@lilas.fr",
            "password": CLINIC_PASSWORD,
            "first_name": "Vera",
            "last_name": "Toli",
        },
    )
    assert response.status_code == 201, response.text
    return uuid.UUID(response.json()["clinic_id"])


async def test_la_suspension_coupe_tous_les_acces_de_la_clinique(
    client: httpx.AsyncClient, app_env: dict[str, str]
) -> None:
    """Les cinq points de coupure, verifies d'affilee sur une meme clinique."""
    # Arrange : une clinique inscrite, son gerant connecte (session ouverte).
    clinic_id = await _inscrire_clinique(client)
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "manager@lilas.fr", "password": CLINIC_PASSWORD},
    )
    assert login.status_code == 200, login.text
    # La clinique figure bien dans l'annuaire public avant suspension.
    annuaire = await client.get("/api/v1/public/clinics")
    assert [c["id"] for c in annuaire.json()] == [str(clinic_id)]

    # Act
    await _changer_statut_clinique(app_env, clinic_id, actif=False)

    # Assert 1 : la session EN COURS est coupee des la requete suivante
    # (le cookie d'access est encore valide 15 minutes, mais /me relit la
    # clinique en base a chaque appel).
    me = await client.get("/api/v1/auth/me")
    assert me.status_code == 403
    assert me.json()["code"] == "identity.clinic_suspended"

    # Assert 2 : impossible de prolonger la session par rotation du refresh.
    refresh = await client.post("/api/v1/auth/refresh")
    assert refresh.status_code == 403
    assert refresh.json()["code"] == "identity.clinic_suspended"

    # Assert 3 : impossible de se reconnecter, avec le BON mot de passe.
    relogin = await client.post(
        "/api/v1/auth/login",
        json={"email": "manager@lilas.fr", "password": CLINIC_PASSWORD},
    )
    assert relogin.status_code == 403
    assert relogin.json()["code"] == "identity.clinic_suspended"

    # Assert 4 : la clinique quitte l'annuaire public du portail B2C.
    annuaire = await client.get("/api/v1/public/clinics")
    assert annuaire.json() == []

    # Assert 5 : elle n'est plus reservable (flux publics de scheduling, qui
    # passent tous par SqlAlchemyClinicInfoReader).
    types = await client.get(f"/api/v1/public/clinics/{clinic_id}/appointment-types")
    assert types.status_code == 404


async def test_un_mauvais_mot_de_passe_ne_revele_pas_la_suspension(
    client: httpx.AsyncClient, app_env: dict[str, str]
) -> None:
    """L'ordre des controles tient aussi de bout en bout : sans le mot de
    passe, la reponse reste le 401 generique du login."""
    clinic_id = await _inscrire_clinique(client)
    await _changer_statut_clinique(app_env, clinic_id, actif=False)

    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "manager@lilas.fr", "password": "ce-n-est-pas-le-bon"},
    )

    assert response.status_code == 401
    assert response.json()["code"] == "identity.invalid_credentials"


async def test_la_reactivation_retablit_l_acces(
    client: httpx.AsyncClient, app_env: dict[str, str]
) -> None:
    """La reversibilite est la raison d'etre de is_active : elle doit marcher.

    C'est precisement ce qui echouerait si la suspension utilisait
    deleted_at : l'email de la clinique aurait ete libere par l'index unique
    partiel, et la restauration buterait sur une violation d'unicite.
    """
    clinic_id = await _inscrire_clinique(client)
    await _changer_statut_clinique(app_env, clinic_id, actif=False)

    await _changer_statut_clinique(app_env, clinic_id, actif=True)

    relogin = await client.post(
        "/api/v1/auth/login",
        json={"email": "manager@lilas.fr", "password": CLINIC_PASSWORD},
    )
    assert relogin.status_code == 200, relogin.text
    annuaire = await client.get("/api/v1/public/clinics")
    assert [c["id"] for c in annuaire.json()] == [str(clinic_id)]


async def test_la_desactivation_coupe_l_acces_du_proprietaire(
    client: httpx.AsyncClient, app_env: dict[str, str]
) -> None:
    """Pendant B2C : session en cours coupee, reconnexion refusee."""
    inscription = await client.post(
        "/api/v1/owner/auth/register",
        json={
            "email": "ana@exemple.fr",
            "password": OWNER_PASSWORD,
            "first_name": "Ana",
            "last_name": "Martin",
        },
    )
    assert inscription.status_code == 201, inscription.text
    owner_id = uuid.UUID(inscription.json()["owner_id"])
    login = await client.post(
        "/api/v1/owner/auth/login",
        json={"email": "ana@exemple.fr", "password": OWNER_PASSWORD},
    )
    assert login.status_code == 200, login.text

    await _desactiver_proprietaire(app_env, owner_id)

    me = await client.get("/api/v1/owner/auth/me")
    assert me.status_code == 403
    assert me.json()["code"] == "identity.owner_inactive"

    relogin = await client.post(
        "/api/v1/owner/auth/login",
        json={"email": "ana@exemple.fr", "password": OWNER_PASSWORD},
    )
    assert relogin.status_code == 403
    assert relogin.json()["code"] == "identity.owner_inactive"
