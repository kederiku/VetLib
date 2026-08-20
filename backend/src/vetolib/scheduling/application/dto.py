"""DTOs de la couche application du contexte scheduling.

Memes conventions qu'identity : dataclasses frozen kw_only, les "Command"
portent les entrees des use cases, les autres leurs sorties. Les vues
enrichies (AgendaEntry, OwnerAppointmentView) sont des READ MODELS : elles
denormalisent les noms (type, praticien, client, animal) pour epargner aux
frontends des appels supplementaires -- produites par des requetes avec
jointures cote infrastructure, jamais reconstruites champ a champ en Python.
"""

import uuid
from dataclasses import dataclass
from datetime import date, datetime, time

from vetolib.scheduling.domain.value_objects import (
    AppointmentStatus,
    ResourceKind,
    WeeklyTimeRange,
)


@dataclass(frozen=True, kw_only=True)
class ResourceDto:
    id: uuid.UUID
    kind: ResourceKind
    name: str
    user_id: uuid.UUID | None
    active: bool


@dataclass(frozen=True, kw_only=True)
class AppointmentTypeDto:
    id: uuid.UUID
    name: str
    duration_minutes: int
    active: bool


@dataclass(frozen=True, kw_only=True)
class WeeklyScheduleDto:
    weekday: int
    start_time: time
    end_time: time


@dataclass(frozen=True, kw_only=True)
class ScheduleExceptionDto:
    id: uuid.UUID
    resource_id: uuid.UUID
    starts_at: datetime
    ends_at: datetime
    reason: str | None


@dataclass(frozen=True, kw_only=True)
class AppointmentDto:
    """Projection brute d'un rendez-vous (sortie des creations/transitions)."""

    id: uuid.UUID
    clinic_id: uuid.UUID
    resource_id: uuid.UUID
    appointment_type_id: uuid.UUID
    owner_id: uuid.UUID | None
    pet_id: uuid.UUID | None
    guest_name: str | None
    guest_pet_name: str | None
    starts_at: datetime
    ends_at: datetime
    status: AppointmentStatus
    reason: str | None
    cancelled_reason: str | None


@dataclass(frozen=True, kw_only=True)
class AgendaEntry:
    """Ligne d'agenda ENRICHIE pour l'ecran staff : noms denormalises.

    owner_* et pet_name sont None pour un client de passage (guest_*), et
    reciproquement -- l'ecran affiche l'un ou l'autre.
    """

    id: uuid.UUID
    resource_id: uuid.UUID
    resource_name: str
    appointment_type_id: uuid.UUID
    appointment_type_name: str
    starts_at: datetime
    ends_at: datetime
    status: AppointmentStatus
    reason: str | None
    cancelled_reason: str | None
    owner_id: uuid.UUID | None
    owner_first_name: str | None
    owner_last_name: str | None
    owner_phone: str | None
    pet_name: str | None
    pet_species: str | None
    guest_name: str | None
    guest_pet_name: str | None


@dataclass(frozen=True, kw_only=True)
class OwnerAppointmentView:
    """Vue "mes rendez-vous" d'un proprietaire, toutes cliniques confondues."""

    id: uuid.UUID
    clinic_id: uuid.UUID
    clinic_name: str
    appointment_type_name: str
    resource_name: str
    pet_id: uuid.UUID | None
    pet_name: str | None
    starts_at: datetime
    ends_at: datetime
    status: AppointmentStatus
    reason: str | None
    cancelled_reason: str | None


@dataclass(frozen=True, kw_only=True)
class ClinicInfo:
    """Lecture minimale d'une clinique depuis scheduling (port ClinicInfoReader)."""

    id: uuid.UUID
    name: str
    timezone: str


@dataclass(frozen=True, kw_only=True)
class PetInfo:
    """Lecture minimale d'un animal (verification d'appartenance au booking)."""

    id: uuid.UUID
    owner_id: uuid.UUID
    name: str


# --- Commands / Queries ----------------------------------------------------


@dataclass(frozen=True, kw_only=True)
class CreateResourceCommand:
    clinic_id: uuid.UUID
    name: str
    user_id: uuid.UUID | None


@dataclass(frozen=True, kw_only=True)
class UpdateResourceCommand:
    resource_id: uuid.UUID
    name: str
    active: bool
    user_id: uuid.UUID | None


@dataclass(frozen=True, kw_only=True)
class CreateAppointmentTypeCommand:
    clinic_id: uuid.UUID
    name: str
    duration_minutes: int


@dataclass(frozen=True, kw_only=True)
class UpdateAppointmentTypeCommand:
    appointment_type_id: uuid.UUID
    name: str
    duration_minutes: int
    active: bool


@dataclass(frozen=True, kw_only=True)
class SetWeeklyScheduleCommand:
    """Remplacement complet de la semaine type d'une ressource."""

    resource_id: uuid.UUID
    items: list[WeeklyTimeRange]


@dataclass(frozen=True, kw_only=True)
class CreateExceptionCommand:
    resource_id: uuid.UUID
    starts_at: datetime
    ends_at: datetime
    reason: str | None


@dataclass(frozen=True, kw_only=True)
class GetAgendaQuery:
    """Bornes en JOURS (calendrier local clinique) ; resource_id optionnel."""

    date_from: date
    date_to: date
    resource_id: uuid.UUID | None


@dataclass(frozen=True, kw_only=True)
class StaffCreateAppointmentCommand:
    """clinic_id vient du token staff (jamais du body)."""

    clinic_id: uuid.UUID
    resource_id: uuid.UUID
    appointment_type_id: uuid.UUID
    starts_at: datetime
    owner_id: uuid.UUID | None
    pet_id: uuid.UUID | None
    guest_name: str | None
    guest_pet_name: str | None
    reason: str | None


@dataclass(frozen=True, kw_only=True)
class AvailabilityQuery:
    clinic_id: uuid.UUID
    appointment_type_id: uuid.UUID
    date_from: date
    date_to: date


@dataclass(frozen=True, kw_only=True)
class AvailableSlot:
    """Creneau proposable, enrichi du nom du praticien pour l'affichage B2C."""

    resource_id: uuid.UUID
    resource_name: str
    starts_at: datetime
    ends_at: datetime


@dataclass(frozen=True, kw_only=True)
class OwnerBookAppointmentCommand:
    """owner_id vient TOUJOURS du token (CurrentOwnerDep), jamais du body ;
    clinic_id vient du body : c'est le TENANT CIBLE de la reservation."""

    owner_id: uuid.UUID
    clinic_id: uuid.UUID
    appointment_type_id: uuid.UUID
    resource_id: uuid.UUID
    starts_at: datetime
    pet_id: uuid.UUID
    reason: str | None
