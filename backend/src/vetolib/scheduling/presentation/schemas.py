"""Schemas Pydantic du contexte scheduling (contrat HTTP <-> Orval).

Convention AwareDatetime : tout instant recu par l'API doit porter un fuseau
(le front envoie de l'ISO UTC) -- un datetime naif serait ambigu et refuse
en 422. Chaque response expose un from_dto (gabarit from_current_user).
"""

import uuid
from datetime import datetime, time

from pydantic import AwareDatetime, BaseModel, Field

from vetolib.scheduling.application.dto import (
    AgendaEntry,
    AppointmentDto,
    AppointmentTypeDto,
    AvailableSlot,
    OwnerAppointmentView,
    ResourceDto,
    ScheduleExceptionDto,
    WeeklyScheduleDto,
)
from vetolib.scheduling.domain.value_objects import AppointmentStatus, ResourceKind

# --- Reglages : types de rendez-vous ---------------------------------------


class CreateAppointmentTypeRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    # multiple_of=5 : aligne sur la grille de calcul des creneaux (pas 15 min).
    duration_minutes: int = Field(gt=0, le=480, multiple_of=5)


class UpdateAppointmentTypeRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    duration_minutes: int = Field(gt=0, le=480, multiple_of=5)
    active: bool


class AppointmentTypeResponse(BaseModel):
    id: uuid.UUID
    name: str
    duration_minutes: int
    active: bool

    @classmethod
    def from_dto(cls, dto: AppointmentTypeDto) -> "AppointmentTypeResponse":
        return cls(
            id=dto.id,
            name=dto.name,
            duration_minutes=dto.duration_minutes,
            active=dto.active,
        )


# --- Reglages : praticiens (resources) -------------------------------------


class CreateResourceRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    user_id: uuid.UUID | None = None


class UpdateResourceRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    active: bool
    user_id: uuid.UUID | None = None


class ResourceResponse(BaseModel):
    id: uuid.UUID
    kind: ResourceKind
    name: str
    user_id: uuid.UUID | None
    active: bool

    @classmethod
    def from_dto(cls, dto: ResourceDto) -> "ResourceResponse":
        return cls(id=dto.id, kind=dto.kind, name=dto.name, user_id=dto.user_id, active=dto.active)


# --- Reglages : horaires hebdomadaires et absences -------------------------


class WeeklyRangePayload(BaseModel):
    """Une plage horaire LOCALE (interpretee dans la timezone de la clinique).

    weekday : 0 = lundi ... 6 = dimanche (meme convention que le front).
    """

    weekday: int = Field(ge=0, le=6)
    start_time: time
    end_time: time


class SetWeeklySchedulesRequest(BaseModel):
    """Remplacement COMPLET de la semaine type du praticien."""

    items: list[WeeklyRangePayload]


class WeeklyScheduleResponse(BaseModel):
    weekday: int
    start_time: time
    end_time: time

    @classmethod
    def from_dto(cls, dto: WeeklyScheduleDto) -> "WeeklyScheduleResponse":
        return cls(weekday=dto.weekday, start_time=dto.start_time, end_time=dto.end_time)


class CreateScheduleExceptionRequest(BaseModel):
    starts_at: AwareDatetime
    ends_at: AwareDatetime
    reason: str | None = Field(default=None, max_length=200)


class ScheduleExceptionResponse(BaseModel):
    id: uuid.UUID
    resource_id: uuid.UUID
    starts_at: datetime
    ends_at: datetime
    reason: str | None

    @classmethod
    def from_dto(cls, dto: ScheduleExceptionDto) -> "ScheduleExceptionResponse":
        return cls(
            id=dto.id,
            resource_id=dto.resource_id,
            starts_at=dto.starts_at,
            ends_at=dto.ends_at,
            reason=dto.reason,
        )


# --- Agenda staff ----------------------------------------------------------


class StaffCreateAppointmentRequest(BaseModel):
    """RDV cree par la clinique : soit un compte (owner_id +/- pet_id), soit
    un client de passage (guest_name obligatoire alors). ends_at est derive
    de la duree du type cote backend -- le front n'envoie que le debut."""

    resource_id: uuid.UUID
    appointment_type_id: uuid.UUID
    starts_at: AwareDatetime
    owner_id: uuid.UUID | None = None
    pet_id: uuid.UUID | None = None
    guest_name: str | None = Field(default=None, min_length=1, max_length=200)
    guest_pet_name: str | None = Field(default=None, max_length=100)
    reason: str | None = Field(default=None, max_length=500)


class CancelAppointmentRequest(BaseModel):
    cancelled_reason: str | None = Field(default=None, max_length=500)


class AppointmentResponse(BaseModel):
    id: uuid.UUID
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

    @classmethod
    def from_dto(cls, dto: AppointmentDto) -> "AppointmentResponse":
        return cls(
            id=dto.id,
            resource_id=dto.resource_id,
            appointment_type_id=dto.appointment_type_id,
            owner_id=dto.owner_id,
            pet_id=dto.pet_id,
            guest_name=dto.guest_name,
            guest_pet_name=dto.guest_pet_name,
            starts_at=dto.starts_at,
            ends_at=dto.ends_at,
            status=dto.status,
            reason=dto.reason,
            cancelled_reason=dto.cancelled_reason,
        )


class AgendaEntryResponse(BaseModel):
    """Ligne d'agenda enrichie (noms denormalises pour l'affichage direct)."""

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

    @classmethod
    def from_dto(cls, dto: AgendaEntry) -> "AgendaEntryResponse":
        return cls(
            id=dto.id,
            resource_id=dto.resource_id,
            resource_name=dto.resource_name,
            appointment_type_id=dto.appointment_type_id,
            appointment_type_name=dto.appointment_type_name,
            starts_at=dto.starts_at,
            ends_at=dto.ends_at,
            status=dto.status,
            reason=dto.reason,
            cancelled_reason=dto.cancelled_reason,
            owner_id=dto.owner_id,
            owner_first_name=dto.owner_first_name,
            owner_last_name=dto.owner_last_name,
            owner_phone=dto.owner_phone,
            pet_name=dto.pet_name,
            pet_species=dto.pet_species,
            guest_name=dto.guest_name,
            guest_pet_name=dto.guest_pet_name,
        )


# --- Public (annuaire B2C) -------------------------------------------------


class PublicAppointmentTypeResponse(BaseModel):
    id: uuid.UUID
    name: str
    duration_minutes: int

    @classmethod
    def from_dto(cls, dto: AppointmentTypeDto) -> "PublicAppointmentTypeResponse":
        return cls(id=dto.id, name=dto.name, duration_minutes=dto.duration_minutes)


class AvailabilitySlotResponse(BaseModel):
    """Creneau proposable, en ISO UTC : le front FORMATE seulement (fuseau
    de la clinique), il ne calcule jamais."""

    resource_id: uuid.UUID
    resource_name: str
    starts_at: datetime
    ends_at: datetime

    @classmethod
    def from_dto(cls, dto: AvailableSlot) -> "AvailabilitySlotResponse":
        return cls(
            resource_id=dto.resource_id,
            resource_name=dto.resource_name,
            starts_at=dto.starts_at,
            ends_at=dto.ends_at,
        )


# --- Proprietaires ---------------------------------------------------------


class OwnerBookAppointmentRequest(BaseModel):
    """clinic_id = la clinique CHOISIE (tenant cible) ; owner_id vient du
    token, jamais du body."""

    clinic_id: uuid.UUID
    appointment_type_id: uuid.UUID
    resource_id: uuid.UUID
    starts_at: AwareDatetime
    pet_id: uuid.UUID
    reason: str | None = Field(default=None, max_length=500)


class OwnerAppointmentResponse(BaseModel):
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

    @classmethod
    def from_view(cls, view: OwnerAppointmentView) -> "OwnerAppointmentResponse":
        return cls(
            id=view.id,
            clinic_id=view.clinic_id,
            clinic_name=view.clinic_name,
            appointment_type_name=view.appointment_type_name,
            resource_name=view.resource_name,
            pet_id=view.pet_id,
            pet_name=view.pet_name,
            starts_at=view.starts_at,
            ends_at=view.ends_at,
            status=view.status,
            reason=view.reason,
            cancelled_reason=view.cancelled_reason,
        )
