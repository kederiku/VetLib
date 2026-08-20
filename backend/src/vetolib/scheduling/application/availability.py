"""Calcul dynamique des creneaux disponibles (coeur du MVP planification).

Choix du document de conception : les creneaux sont calcules A LA VOLEE en
croisant trois sources, jamais pre-generes en base :
1. les horaires hebdomadaires de chaque ressource (heures LOCALES) ;
2. les periodes bloquees (conges, urgences -- instants absolus) ;
3. les rendez-vous actifs existants (pending/confirmed).

Ce module est une fonction PURE : aucune IO, aucune dependance
infrastructure -- elle recoit des donnees deja chargees et rend des
creneaux UTC. C'est ce qui permet de la tester exhaustivement (DST,
frontieres, chevauchements) en millisecondes, sans base de donnees.

Pourquoi la timezone est centrale : "ouvert de 9h a 12h" est une heure
LOCALE de la clinique. L'instant UTC correspondant change deux fois par an
(heure d'ete/hiver). La conversion se fait donc JOUR PAR JOUR via zoneinfo,
jamais avec un decalage fixe. Cas limites geres :
- spring forward (l'heure locale saute, ex 02:00->03:00) : zoneinfo projette
  les heures inexistantes en avant, aucun creneau fantome dans le trou ;
- fall back (l'heure locale se repete) : fold=0 (premiere occurrence) et
  deduplication finale par (resource_id, starts_at) UTC.
"""

import uuid
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from vetolib.scheduling.domain.schedule_exception import ScheduleException
from vetolib.scheduling.domain.weekly_schedule import WeeklySchedule

# Grille de proposition : un creneau peut commencer tous les quarts d'heure.
DEFAULT_STEP = timedelta(minutes=15)
# Delai minimal avant le debut d'un creneau reservable en ligne : la
# clinique ne doit pas decouvrir un rendez-vous pris pour dans 5 minutes.
DEFAULT_LEAD_TIME = timedelta(minutes=60)
# Horizon de reservation : au-dela, les creneaux ne sont pas proposes
# (les horaires des praticiens ne sont pas fiables a 6 mois).
DEFAULT_HORIZON = timedelta(days=60)


@dataclass(frozen=True, kw_only=True)
class BusyPeriod:
    """Projection legere d'un rendez-vous actif (pending/confirmed)."""

    resource_id: uuid.UUID
    starts_at: datetime
    ends_at: datetime


@dataclass(frozen=True, kw_only=True)
class Slot:
    """Un creneau proposable : instants UTC aware, [starts_at, ends_at)."""

    resource_id: uuid.UUID
    starts_at: datetime
    ends_at: datetime


def _overlaps(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    """Chevauchement en bornes demi-ouvertes : adjacents = compatibles."""
    return a_start < b_end and a_end > b_start


def compute_available_slots(
    *,
    schedules: Sequence[WeeklySchedule],
    exceptions: Sequence[ScheduleException],
    busy: Sequence[BusyPeriod],
    duration_minutes: int,
    tz: ZoneInfo,
    date_from: date,
    date_to: date,
    now: datetime,
    step: timedelta = DEFAULT_STEP,
    lead_time: timedelta = DEFAULT_LEAD_TIME,
    horizon: timedelta = DEFAULT_HORIZON,
) -> list[Slot]:
    """Croise horaires, absences et rendez-vous en creneaux disponibles.

    date_from/date_to sont des JOURS LOCAUX (calendrier de la clinique),
    bornes incluses ; now doit etre UTC aware. Retour trie par
    (starts_at, resource_id), deduplique.
    """
    duration = timedelta(minutes=duration_minutes)
    earliest_start = now + lead_time
    latest_start = now + horizon

    # Fenetre de jours effectivement parcourue : on clampe au lead time et a
    # l'horizon EN LOCAL (un jour local peut contenir des instants des deux
    # cotes de la borne : le filtre fin par creneau reste applique apres).
    start_day = max(date_from, earliest_start.astimezone(tz).date())
    end_day = min(date_to, latest_start.astimezone(tz).date())
    if end_day < start_day:
        return []

    # Indexation par ressource : le busy du Dr A ne bloque jamais le Dr B.
    schedules_by_resource: dict[uuid.UUID, list[WeeklySchedule]] = defaultdict(list)
    for schedule in schedules:
        schedules_by_resource[schedule.resource_id].append(schedule)
    exceptions_by_resource: dict[uuid.UUID, list[ScheduleException]] = defaultdict(list)
    for exception in exceptions:
        exceptions_by_resource[exception.resource_id].append(exception)
    busy_by_resource: dict[uuid.UUID, list[BusyPeriod]] = defaultdict(list)
    for period in busy:
        busy_by_resource[period.resource_id].append(period)

    seen: set[tuple[uuid.UUID, datetime]] = set()
    slots: list[Slot] = []

    day = start_day
    while day <= end_day:
        for resource_id, resource_schedules in schedules_by_resource.items():
            for schedule in resource_schedules:
                if schedule.slot.weekday != day.weekday():
                    continue
                # Conversion heure locale -> UTC pour CE jour precis :
                # c'est ici que le DST est absorbe par zoneinfo.
                window_start = datetime.combine(
                    day, schedule.slot.start_time, tzinfo=tz
                ).astimezone(UTC)
                window_end = datetime.combine(day, schedule.slot.end_time, tzinfo=tz).astimezone(
                    UTC
                )
                if window_end <= window_start:
                    # Plage ecrasee par un spring forward (ex 02:00-03:00 le
                    # jour du changement d'heure) : aucun creneau ce jour-la.
                    continue

                slot_start = window_start
                while slot_start + duration <= window_end:
                    slot_end = slot_start + duration
                    if (
                        slot_start >= earliest_start
                        and slot_start <= latest_start
                        and not any(
                            _overlaps(slot_start, slot_end, e.starts_at, e.ends_at)
                            for e in exceptions_by_resource.get(resource_id, [])
                        )
                        and not any(
                            _overlaps(slot_start, slot_end, b.starts_at, b.ends_at)
                            for b in busy_by_resource.get(resource_id, [])
                        )
                    ):
                        key = (resource_id, slot_start)
                        if key not in seen:
                            seen.add(key)
                            slots.append(
                                Slot(
                                    resource_id=resource_id,
                                    starts_at=slot_start,
                                    ends_at=slot_end,
                                )
                            )
                    slot_start += step
        day += timedelta(days=1)

    slots.sort(key=lambda s: (s.starts_at, str(s.resource_id)))
    return slots
