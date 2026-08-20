"""Value objects du contexte scheduling : temps, statuts, types de ressources.

Comme dans identity, un value object n'a pas d'identite propre : il est
defini par sa valeur, immuable (frozen=True) et auto-valide a la
construction. Zero import framework (regle de la couche domain).
"""

from dataclasses import dataclass
from datetime import datetime, time
from enum import StrEnum

from vetolib.shared.domain.errors import DomainValidationError


class ResourceKind(StrEnum):
    """Nature d'une ressource reservable.

    Phase 1 du MVP : uniquement les veterinaires. Le document de conception
    prevoit d'autres natures (salles, equipements) en phase 2 : l'enum et la
    colonne kind sont la pour les accueillir sans migration structurelle.
    """

    VETERINARIAN = "veterinarian"


class AppointmentStatus(StrEnum):
    """Etats de la machine a etats stricte d'un rendez-vous.

    pending -> confirmed -> completed, et pending|confirmed -> cancelled.
    Toute autre transition est une erreur metier (InvalidAppointmentTransitionError).
    """

    PENDING = "pending"
    CONFIRMED = "confirmed"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


@dataclass(frozen=True)
class WeeklyTimeRange:
    """Plage horaire hebdomadaire recurrente d'une ressource.

    weekday : 0 = lundi ... 6 = dimanche (convention Python date.weekday()).
    Les heures sont LOCALES : elles seront interpretees dans la timezone de
    la clinique au moment du calcul des creneaux (une plage 09:00-12:00 vaut
    9h-12h heure de Paris ete comme hiver, l'instant UTC varie avec le DST).
    """

    weekday: int
    start_time: time
    end_time: time

    def __post_init__(self) -> None:
        if not 0 <= self.weekday <= 6:
            raise DomainValidationError(f"Jour de semaine invalide : {self.weekday}")
        if self.end_time <= self.start_time:
            raise DomainValidationError("L'heure de fin doit etre apres l'heure de debut.")


@dataclass(frozen=True)
class TimeSlot:
    """Intervalle de temps absolu [starts_at, ends_at) en instants UTC aware.

    Semantique demi-ouverte : deux creneaux adjacents (10:00-10:30 puis
    10:30-11:00) ne se chevauchent PAS -- meme convention que le tstzrange
    de la contrainte EXCLUDE en base.
    """

    starts_at: datetime
    ends_at: datetime

    def __post_init__(self) -> None:
        if self.starts_at.tzinfo is None or self.ends_at.tzinfo is None:
            raise DomainValidationError("Un creneau exige des datetimes avec fuseau (aware).")
        if self.ends_at <= self.starts_at:
            raise DomainValidationError("La fin du creneau doit etre apres son debut.")

    def overlaps(self, other: "TimeSlot") -> bool:
        """Chevauchement strict (bornes demi-ouvertes) : brique du calcul de
        disponibilite et reference des tests."""
        return self.starts_at < other.ends_at and self.ends_at > other.starts_at
