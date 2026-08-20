"""Flux d'integration du contexte scheduling : configuration B2B -> booking
B2C -> agenda -> confirmation, plus isolation RLS, double reservation
arbitree par la contrainte EXCLUDE et regle d'annulation des 24 h.

Helpers partages en tete : chaque test reconstruit son monde via l'API
REELLE (register clinique, login staff, configuration, comptes owner...).
"""

import asyncio
import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

STAFF_PASSWORD = "correct-horse-battery"
OWNER_PASSWORD = "croquettes-pour-rex"


async def _setup_clinic(
    client: httpx.AsyncClient, *, name: str = "Clinique des Lilas", email: str | None = None
) -> dict[str, str]:
    """Cree une clinique + login manager ; configure type 30 min, praticien et
    horaires 7 j/7 09:00-18:00 (des creneaux existent quel que soit le jour
    d'execution du test). Retourne les ids utiles."""
    email = email or f"manager-{uuid.uuid4().hex[:8]}@clinique.fr"
    response = await client.post(
        "/api/v1/clinics/register",
        json={
            "clinic_name": name,
            "email": email,
            "password": STAFF_PASSWORD,
            "first_name": "Vera",
            "last_name": "Toli",
        },
    )
    assert response.status_code == 201, response.text
    clinic_id = response.json()["clinic_id"]
    response = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": STAFF_PASSWORD}
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

    response = await client.put(
        f"/api/v1/scheduling/resources/{resource_id}/weekly-schedule",
        json={
            "items": [
                {"weekday": d, "start_time": "09:00:00", "end_time": "18:00:00"} for d in range(7)
            ]
        },
    )
    assert response.status_code == 200, response.text
    return {"clinic_id": clinic_id, "type_id": type_id, "resource_id": resource_id}


async def _setup_owner_with_pet(
    client: httpx.AsyncClient, *, email: str | None = None
) -> dict[str, str]:
    """Cree un compte proprietaire + login + un animal. Retourne les ids."""
    email = email or f"owner-{uuid.uuid4().hex[:8]}@exemple.fr"
    response = await client.post(
        "/api/v1/owner/auth/register",
        json={
            "email": email,
            "password": OWNER_PASSWORD,
            "first_name": "Ana",
            "last_name": "Martin",
            "phone": None,
        },
    )
    assert response.status_code == 201, response.text
    response = await client.post(
        "/api/v1/owner/auth/login", json={"email": email, "password": OWNER_PASSWORD}
    )
    assert response.status_code == 200, response.text
    response = await client.post("/api/v1/owner/pets", json={"name": "Rex", "species": "dog"})
    assert response.status_code == 201, response.text
    return {"pet_id": response.json()["id"], "email": email}


async def _first_slots(
    client: httpx.AsyncClient, ids: dict[str, str], *, count: int = 1
) -> list[dict[str, str]]:
    """Recupere les `count` premiers creneaux publics de la semaine a venir."""
    today = datetime.now(UTC).date()
    response = await client.get(
        f"/api/v1/public/clinics/{ids['clinic_id']}/availabilities",
        params={
            "appointment_type_id": ids["type_id"],
            "date_from": str(today),
            "date_to": str(today + timedelta(days=7)),
        },
    )
    assert response.status_code == 200, response.text
    slots: list[dict[str, str]] = response.json()
    assert len(slots) >= count, f"pas assez de creneaux : {len(slots)}"
    return slots[:count]


async def test_parcours_complet_booking_et_confirmation(
    client: httpx.AsyncClient, app_env: dict[str, str]
) -> None:
    """Le fil rouge du MVP : config clinique -> annuaire -> dispos -> booking
    PENDING -> le creneau disparait -> agenda staff enrichi -> confirm ->
    evenements outbox ecrits."""
    ids = await _setup_clinic(client)
    owner = await _setup_owner_with_pet(client)

    # Annuaire public : la clinique y figure.
    response = await client.get("/api/v1/public/clinics")
    assert any(c["id"] == ids["clinic_id"] for c in response.json())

    # Types publics : la consultation apparait.
    response = await client.get(f"/api/v1/public/clinics/{ids['clinic_id']}/appointment-types")
    assert [t["name"] for t in response.json()] == ["Consultation"]

    (slot,) = await _first_slots(client, ids)
    assert slot["resource_name"] == "Dr Martin"

    # Booking owner -> 201 PENDING.
    response = await client.post(
        "/api/v1/owner/appointments",
        json={
            "clinic_id": ids["clinic_id"],
            "appointment_type_id": ids["type_id"],
            "resource_id": slot["resource_id"],
            "starts_at": slot["starts_at"],
            "pet_id": owner["pet_id"],
            "reason": "Boiterie de la patte avant",
        },
    )
    assert response.status_code == 201, response.text
    appointment = response.json()
    assert appointment["status"] == "pending"

    # Le creneau reserve disparait des disponibilites.
    (new_first,) = await _first_slots(client, ids)
    assert (new_first["resource_id"], new_first["starts_at"]) != (
        slot["resource_id"],
        slot["starts_at"],
    )

    # Mes rendez-vous (vue enrichie cross-cliniques).
    response = await client.get("/api/v1/owner/appointments")
    (mine,) = response.json()
    assert mine["clinic_name"] == "Clinique des Lilas"
    assert mine["pet_name"] == "Rex"
    assert mine["status"] == "pending"

    # Agenda staff : le rendez-vous apparait avec les noms client + animal.
    starts = datetime.fromisoformat(slot["starts_at"])
    day = str(starts.date())
    response = await client.get(
        "/api/v1/scheduling/agenda", params={"date_from": day, "date_to": day}
    )
    assert response.status_code == 200, response.text
    entries = [e for e in response.json() if e["id"] == appointment["id"]]
    assert entries and entries[0]["owner_first_name"] == "Ana"
    assert entries[0]["pet_name"] == "Rex"
    assert entries[0]["appointment_type_name"] == "Consultation"

    # Confirmation par le staff -> confirmed, visible cote owner.
    response = await client.post(f"/api/v1/scheduling/appointments/{appointment['id']}/confirm")
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "confirmed"
    response = await client.get("/api/v1/owner/appointments")
    assert response.json()[0]["status"] == "confirmed"

    # Les evenements outbox du flux sont ecrits (relayes plus tard par TaskIQ).
    engine = create_async_engine(app_env["DATABASE_URL"])
    try:
        async with engine.connect() as conn:
            rows = (
                (
                    await conn.execute(
                        text(
                            "SELECT event_type FROM outbox_events "
                            "WHERE event_type LIKE 'scheduling.%' ORDER BY occurred_at"
                        )
                    )
                )
                .scalars()
                .all()
            )
        assert rows == [
            "scheduling.appointment_booked",
            "scheduling.appointment_confirmed",
        ]
    finally:
        await engine.dispose()


async def test_isolation_rls_entre_deux_cliniques(
    client: httpx.AsyncClient, app_env: dict[str, str]
) -> None:
    """Premier usage reel de la RLS en mode tenant : les reglages de A sont
    INVISIBLES pour B (API), et la preuve SQL fail-closed est rejouee."""
    ids_a = await _setup_clinic(client, name="Clinique A")
    # Se connecter en B remplace les cookies staff de A (meme jar).
    await _setup_clinic(client, name="Clinique B")

    # B ne voit NI les types NI les praticiens de A.
    response = await client.get("/api/v1/scheduling/appointment-types")
    types_b = response.json()
    response = await client.get("/api/v1/scheduling/resources")
    resources_b = response.json()
    assert all(t["id"] != ids_a["type_id"] for t in types_b)
    assert all(r["id"] != ids_a["resource_id"] for r in resources_b)

    # B ne peut pas modifier une entite de A : introuvable (404, jamais 403).
    response = await client.put(
        f"/api/v1/scheduling/appointment-types/{ids_a['type_id']}",
        json={"name": "Pirate", "duration_minutes": 30, "active": True},
    )
    assert response.status_code == 404
    assert response.json()["code"] == "scheduling.appointment_type_not_found"

    # Preuve SQL brute (gabarit test_rls_isolation) : role applicatif +
    # app.clinic_id = A -> ne voit que les ressources de A ; sans -> 0.
    engine = create_async_engine(app_env["DATABASE_URL"])
    try:
        async with engine.connect() as conn:
            await conn.execute(text('SET LOCAL ROLE "vetolib_app"'))
            await conn.execute(
                text("SELECT set_config('app.clinic_id', :cid, true)"),
                {"cid": ids_a["clinic_id"]},
            )
            visible = (await conn.execute(text("SELECT count(*) FROM resources"))).scalar_one()
            assert visible == 1
        async with engine.connect() as conn:
            await conn.execute(text('SET LOCAL ROLE "vetolib_app"'))
            visible = (await conn.execute(text("SELECT count(*) FROM resources"))).scalar_one()
            assert visible == 0
    finally:
        await engine.dispose()


async def test_double_reservation_arbitree_par_exclude(
    client: httpx.AsyncClient, app_env: dict[str, str]
) -> None:
    """(a) Le staff force deux RDV chevauchants (pas de revalidation cote
    staff) : le second est refuse par la contrainte EXCLUDE -> 409.
    (b) Deux bookings owner CONCURRENTS sur le meme creneau : exactement un
    201, l'autre 409/conflit -- quel que soit le vainqueur de la course."""
    ids = await _setup_clinic(client)

    # (a) Staff : deux creneaux qui se chevauchent (10:00 et 10:15, 30 min).
    tomorrow = datetime.now(UTC) + timedelta(days=1)
    base = tomorrow.replace(hour=10, minute=0, second=0, microsecond=0)
    response = await client.post(
        "/api/v1/scheduling/appointments",
        json={
            "resource_id": ids["resource_id"],
            "appointment_type_id": ids["type_id"],
            "starts_at": base.isoformat(),
            "guest_name": "M. Dupont",
            "guest_pet_name": "Rex",
        },
    )
    assert response.status_code == 201, response.text
    response = await client.post(
        "/api/v1/scheduling/appointments",
        json={
            "resource_id": ids["resource_id"],
            "appointment_type_id": ids["type_id"],
            "starts_at": (base + timedelta(minutes=15)).isoformat(),
            "guest_name": "Mme Durand",
        },
    )
    assert response.status_code == 409, response.text
    assert response.json()["code"] == "scheduling.slot_already_booked"

    # (b) Deux owners, un seul creneau libre vise, requetes CONCURRENTES.
    owner_a = await _setup_owner_with_pet(client)
    cookies_a = dict(client.cookies)
    owner_b = await _setup_owner_with_pet(client)
    cookies_b = dict(client.cookies)
    (slot,) = await _first_slots(client, ids)

    async def book(cookies: dict[str, str], pet_id: str) -> int:
        transport = client._transport
        async with httpx.AsyncClient(
            transport=transport, base_url="http://test", cookies=cookies
        ) as racer:
            response = await racer.post(
                "/api/v1/owner/appointments",
                json={
                    "clinic_id": ids["clinic_id"],
                    "appointment_type_id": ids["type_id"],
                    "resource_id": slot["resource_id"],
                    "starts_at": slot["starts_at"],
                    "pet_id": pet_id,
                    "reason": None,
                },
            )
            return response.status_code

    results = await asyncio.gather(
        book(cookies_a, owner_a["pet_id"]), book(cookies_b, owner_b["pet_id"])
    )
    assert sorted(results)[0] == 201 and sorted(results)[1] == 409, results


async def test_annulation_owner_regles(client: httpx.AsyncClient) -> None:
    """Annulation en ligne : liberation du creneau, regle des 24 h, RDV d'un
    autre owner introuvable, re-annulation refusee."""
    ids = await _setup_clinic(client)
    owner = await _setup_owner_with_pet(client)
    (slot,) = await _first_slots(client, ids)

    booking = {
        "clinic_id": ids["clinic_id"],
        "appointment_type_id": ids["type_id"],
        "resource_id": slot["resource_id"],
        "starts_at": slot["starts_at"],
        "pet_id": owner["pet_id"],
        "reason": None,
    }
    response = await client.post("/api/v1/owner/appointments", json=booking)
    assert response.status_code == 201
    appointment_id = response.json()["id"]

    starts = datetime.fromisoformat(slot["starts_at"])
    far_enough = starts - datetime.now(UTC) >= timedelta(hours=24)
    response = await client.post(f"/api/v1/owner/appointments/{appointment_id}/cancel")
    if far_enough:
        # Annulation OK -> le creneau REDEVIENT disponible (EXCLUDE ignore
        # cancelled) et une re-annulation est refusee (transition).
        assert response.status_code == 200, response.text
        assert response.json()["status"] == "cancelled"
        slots_after = await _first_slots(client, ids)
        assert (slots_after[0]["resource_id"], slots_after[0]["starts_at"]) == (
            slot["resource_id"],
            slot["starts_at"],
        )
        response = await client.post(f"/api/v1/owner/appointments/{appointment_id}/cancel")
        assert response.status_code == 409
        assert response.json()["code"] == "scheduling.invalid_transition"
    else:
        # Creneau a moins de 24 h (test lance en fin de journee) : la regle
        # des 24 h s'applique.
        assert response.status_code == 409
        assert response.json()["code"] == "scheduling.cancellation_too_late"
        pytest.skip("creneau a moins de 24 h : branche too_late verifiee")

    # RDV re-cree puis vise par un AUTRE owner : introuvable (404).
    response = await client.post("/api/v1/owner/appointments", json=booking)
    assert response.status_code == 201
    appointment_id = response.json()["id"]
    await _setup_owner_with_pet(client)  # bascule la session sur owner 2
    response = await client.post(f"/api/v1/owner/appointments/{appointment_id}/cancel")
    assert response.status_code == 404
    assert response.json()["code"] == "scheduling.appointment_not_found"
