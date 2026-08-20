"""Tests exhaustifs du calcul de creneaux (fonction pure, horloge figee).

C'est LE coeur du MVP planification : chaque regle (grille, lead time,
horizon, absences, rendez-vous existants, multi-ressources) et chaque cas
limite DST (spring forward, fall back) est verrouille ici, en millisecondes,
sans base de donnees.
"""

import uuid
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from vetolib.scheduling.application.availability import (
    BusyPeriod,
    compute_available_slots,
)
from vetolib.scheduling.domain.schedule_exception import ScheduleException
from vetolib.scheduling.domain.value_objects import WeeklyTimeRange
from vetolib.scheduling.domain.weekly_schedule import WeeklySchedule

PARIS = ZoneInfo("Europe/Paris")
CLINIC_ID = uuid.uuid4()
RESOURCE_A = uuid.uuid4()
RESOURCE_B = uuid.uuid4()
CREATED = datetime(2026, 1, 1, tzinfo=UTC)


def _schedule(resource_id: uuid.UUID, weekday: int, start: time, end: time) -> WeeklySchedule:
    return WeeklySchedule.create(
        clinic_id=CLINIC_ID,
        resource_id=resource_id,
        slot=WeeklyTimeRange(weekday=weekday, start_time=start, end_time=end),
        now=CREATED,
    )


def _exception(resource_id: uuid.UUID, starts_at: datetime, ends_at: datetime) -> ScheduleException:
    return ScheduleException.create(
        clinic_id=CLINIC_ID,
        resource_id=resource_id,
        starts_at=starts_at,
        ends_at=ends_at,
        reason=None,
        now=CREATED,
    )


def test_grille_nominale_heure_hiver() -> None:
    """Lundi 09:00-12:00 heure de Paris en HIVER (UTC+1) : duree 30, pas 15.

    Le lundi 2026-01-12, 09:00 local = 08:00Z. Dernier depart possible :
    11:30 local (le creneau 11:45+30 deborderait la fenetre).
    """
    slots = compute_available_slots(
        schedules=[_schedule(RESOURCE_A, 0, time(9, 0), time(12, 0))],
        exceptions=[],
        busy=[],
        duration_minutes=30,
        tz=PARIS,
        date_from=date(2026, 1, 12),
        date_to=date(2026, 1, 12),
        now=datetime(2026, 1, 10, 12, 0, tzinfo=UTC),
    )
    starts = [s.starts_at for s in slots]
    assert starts[0] == datetime(2026, 1, 12, 8, 0, tzinfo=UTC)  # 09:00 Paris
    assert starts[-1] == datetime(2026, 1, 12, 10, 30, tzinfo=UTC)  # 11:30 Paris
    assert len(starts) == 11  # 09:00 a 11:30 par pas de 15 min
    assert all(s.ends_at - s.starts_at == timedelta(minutes=30) for s in slots)


def test_heure_ete_decale_les_instants_utc() -> None:
    """La meme plage locale 09:00-12:00 vaut 07:00Z en ETE (UTC+2) : la
    conversion se fait jour par jour, jamais avec un decalage fige."""
    slots = compute_available_slots(
        schedules=[_schedule(RESOURCE_A, 0, time(9, 0), time(12, 0))],
        exceptions=[],
        busy=[],
        duration_minutes=30,
        tz=PARIS,
        date_from=date(2026, 7, 13),  # un lundi de juillet
        date_to=date(2026, 7, 13),
        now=datetime(2026, 7, 10, 12, 0, tzinfo=UTC),
    )
    assert slots[0].starts_at == datetime(2026, 7, 13, 7, 0, tzinfo=UTC)


def test_spring_forward_pas_de_creneau_fantome() -> None:
    """Nuit du changement d'heure d'ete (dimanche 2026-03-29 a Paris :
    02:00 local saute a 03:00). Une plage 01:00-04:00 locale ne dure que
    2 h reelles : aucun creneau ne doit tomber dans l'heure inexistante,
    et les instants UTC doivent rester strictement croissants."""
    slots = compute_available_slots(
        schedules=[_schedule(RESOURCE_A, 6, time(1, 0), time(4, 0))],
        exceptions=[],
        busy=[],
        duration_minutes=30,
        tz=PARIS,
        date_from=date(2026, 3, 29),
        date_to=date(2026, 3, 29),
        now=datetime(2026, 3, 27, 12, 0, tzinfo=UTC),
    )
    starts = [s.starts_at for s in slots]
    # 01:00 local (UTC+1) = 00:00Z ; 04:00 local (UTC+2) = 02:00Z ->
    # fenetre UTC de 2 h, dernier depart 01:30Z.
    assert starts[0] == datetime(2026, 3, 29, 0, 0, tzinfo=UTC)
    assert starts[-1] == datetime(2026, 3, 29, 1, 30, tzinfo=UTC)
    assert starts == sorted(starts)
    assert len(starts) == len(set(starts))


def test_fall_back_aucun_doublon() -> None:
    """Nuit du retour a l'heure d'hiver (dimanche 2026-10-25 : 03:00 local
    revient a 02:00). Aucun doublon (resource, instant UTC) ne doit sortir."""
    slots = compute_available_slots(
        schedules=[_schedule(RESOURCE_A, 6, time(1, 0), time(4, 0))],
        exceptions=[],
        busy=[],
        duration_minutes=30,
        tz=PARIS,
        date_from=date(2026, 10, 25),
        date_to=date(2026, 10, 25),
        now=datetime(2026, 10, 23, 12, 0, tzinfo=UTC),
    )
    keys = [(s.resource_id, s.starts_at) for s in slots]
    assert len(keys) == len(set(keys))


def test_lead_time_filtre_les_creneaux_trop_proches() -> None:
    """now = lundi 08:30 UTC (09:30 Paris hiver), lead 60 min : les creneaux
    d'avant 10:30 Paris sont exclus."""
    slots = compute_available_slots(
        schedules=[_schedule(RESOURCE_A, 0, time(9, 0), time(12, 0))],
        exceptions=[],
        busy=[],
        duration_minutes=30,
        tz=PARIS,
        date_from=date(2026, 1, 12),
        date_to=date(2026, 1, 12),
        now=datetime(2026, 1, 12, 8, 30, tzinfo=UTC),
    )
    assert slots[0].starts_at == datetime(2026, 1, 12, 9, 30, tzinfo=UTC)  # 10:30 Paris


def test_horizon_tronque_les_jours_lointains() -> None:
    """Horizon 60 j : un lundi au-dela ne produit rien, meme demande."""
    slots = compute_available_slots(
        schedules=[_schedule(RESOURCE_A, 0, time(9, 0), time(12, 0))],
        exceptions=[],
        busy=[],
        duration_minutes=30,
        tz=PARIS,
        date_from=date(2026, 6, 1),  # ~4 mois apres now
        date_to=date(2026, 6, 1),
        now=datetime(2026, 1, 10, 12, 0, tzinfo=UTC),
    )
    assert slots == []


def test_exception_supprime_les_creneaux_chevauches() -> None:
    """Une absence 10:00-11:00 Paris supprime tout creneau qui la chevauche,
    y compris partiellement (le 09:45+30 touche 10:00-10:15)."""
    slots = compute_available_slots(
        schedules=[_schedule(RESOURCE_A, 0, time(9, 0), time(12, 0))],
        exceptions=[
            _exception(
                RESOURCE_A,
                datetime(2026, 1, 12, 9, 0, tzinfo=UTC),  # 10:00 Paris
                datetime(2026, 1, 12, 10, 0, tzinfo=UTC),  # 11:00 Paris
            )
        ],
        busy=[],
        duration_minutes=30,
        tz=PARIS,
        date_from=date(2026, 1, 12),
        date_to=date(2026, 1, 12),
        now=datetime(2026, 1, 10, 12, 0, tzinfo=UTC),
    )
    paris_starts = [s.starts_at.astimezone(PARIS).time() for s in slots]
    assert time(9, 45) not in paris_starts  # chevauchement partiel exclu
    assert time(10, 0) not in paris_starts
    assert time(9, 30) in paris_starts  # 09:30+30 finit a 10:00 : adjacent, OK
    assert time(11, 0) in paris_starts  # reprend des la fin de l'absence


def test_rendez_vous_existant_bloque_sa_ressource_seulement() -> None:
    """Un RDV 10:00-10:30 Paris du Dr A supprime ses creneaux chevauchants
    (dont 09:45) mais ne touche pas le Dr B."""
    busy = [
        BusyPeriod(
            resource_id=RESOURCE_A,
            starts_at=datetime(2026, 1, 12, 9, 0, tzinfo=UTC),  # 10:00 Paris
            ends_at=datetime(2026, 1, 12, 9, 30, tzinfo=UTC),  # 10:30 Paris
        )
    ]
    slots = compute_available_slots(
        schedules=[
            _schedule(RESOURCE_A, 0, time(9, 0), time(12, 0)),
            _schedule(RESOURCE_B, 0, time(9, 0), time(12, 0)),
        ],
        exceptions=[],
        busy=busy,
        duration_minutes=30,
        tz=PARIS,
        date_from=date(2026, 1, 12),
        date_to=date(2026, 1, 12),
        now=datetime(2026, 1, 10, 12, 0, tzinfo=UTC),
    )
    a_starts = [s.starts_at.astimezone(PARIS).time() for s in slots if s.resource_id == RESOURCE_A]
    b_starts = [s.starts_at.astimezone(PARIS).time() for s in slots if s.resource_id == RESOURCE_B]
    assert time(9, 45) not in a_starts and time(10, 0) not in a_starts
    assert time(9, 45) in b_starts and time(10, 0) in b_starts


def test_creneau_debordant_la_fin_de_plage_exclu() -> None:
    """Plage 09:00-10:00, duree 45 : seuls 09:00 et 09:15 tiennent."""
    slots = compute_available_slots(
        schedules=[_schedule(RESOURCE_A, 0, time(9, 0), time(10, 0))],
        exceptions=[],
        busy=[],
        duration_minutes=45,
        tz=PARIS,
        date_from=date(2026, 1, 12),
        date_to=date(2026, 1, 12),
        now=datetime(2026, 1, 10, 12, 0, tzinfo=UTC),
    )
    paris_starts = [s.starts_at.astimezone(PARIS).time() for s in slots]
    assert paris_starts == [time(9, 0), time(9, 15)]


def test_fenetre_vide_ou_passee() -> None:
    """date_to avant date_from, ou periode entierement passee : []."""

    def compute(date_from: date, date_to: date) -> list[object]:
        return list(
            compute_available_slots(
                schedules=[_schedule(RESOURCE_A, 0, time(9, 0), time(12, 0))],
                exceptions=[],
                busy=[],
                duration_minutes=30,
                tz=PARIS,
                date_from=date_from,
                date_to=date_to,
                now=datetime(2026, 1, 10, 12, 0, tzinfo=UTC),
            )
        )

    assert compute(date(2026, 1, 19), date(2026, 1, 12)) == []
    assert compute(date(2025, 12, 1), date(2025, 12, 7)) == []
