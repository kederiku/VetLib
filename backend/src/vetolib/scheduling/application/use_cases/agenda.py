"""Use cases de l'agenda staff : lecture enrichie, creation, transitions.

UoW tenant partout (clinic_id du token). Les evenements de transitions
partent dans l'outbox avec la meme transaction (pattern habituel).
"""

import uuid
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from vetolib.patients.domain.errors import PetNotFoundError
from vetolib.scheduling.application.dto import (
    AgendaEntry,
    AppointmentDto,
    GetAgendaQuery,
    StaffCreateAppointmentCommand,
)
from vetolib.scheduling.application.ports import SchedulingUoWFactory
from vetolib.scheduling.application.use_cases._mappers import to_appointment_dto
from vetolib.scheduling.domain.appointment import Appointment
from vetolib.scheduling.domain.errors import (
    AppointmentNotFoundError,
    AppointmentTypeNotFoundError,
    ResourceNotFoundError,
)
from vetolib.shared.application.clock import Clock


class GetAgenda:
    """Rendez-vous d'une periode, enrichis des noms (type, praticien, client).

    Les bornes arrivent en JOURS : on interroge la table en instants UTC
    couvrant largement ces jours dans le fuseau de la clinique.
    """

    def __init__(self, uow_factory: SchedulingUoWFactory) -> None:
        self._uow_factory = uow_factory

    async def execute(self, query: GetAgendaQuery, *, clinic_id: uuid.UUID) -> list[AgendaEntry]:
        async with self._uow_factory() as uow:
            info = await uow.clinic_info.get_info(clinic_id)
            tz = ZoneInfo(info.timezone) if info is not None else ZoneInfo("Europe/Paris")
            starts_at = datetime.combine(query.date_from, time.min, tzinfo=tz).astimezone(UTC)
            ends_at = datetime.combine(
                query.date_to + timedelta(days=1), time.min, tzinfo=tz
            ).astimezone(UTC)
            return await uow.appointments.list_agenda(
                starts_at=starts_at, ends_at=ends_at, resource_id=query.resource_id
            )


class CreateAppointmentByStaff:
    """RDV cree par la clinique (telephone, comptoir) : CONFIRMED direct.

    Pas de revalidation de grille : le staff peut forcer un horaire hors
    des creneaux publics (urgence, arrangement). La contrainte EXCLUDE
    reste l'arbitre anti-chevauchement (SlotAlreadyBookedError au commit).
    """

    def __init__(self, uow_factory: SchedulingUoWFactory, clock: Clock) -> None:
        self._uow_factory = uow_factory
        self._clock = clock

    async def execute(self, cmd: StaffCreateAppointmentCommand) -> AppointmentDto:
        now = self._clock.now()
        async with self._uow_factory() as uow:
            appointment_type = await uow.appointment_types.get_by_id(cmd.appointment_type_id)
            if appointment_type is None:
                raise AppointmentTypeNotFoundError("Type de rendez-vous introuvable.")
            if await uow.resources.get_by_id(cmd.resource_id) is None:
                raise ResourceNotFoundError("Praticien introuvable.")
            # ends_at derive de la duree du type : le front n'envoie que le debut.
            ends_at = cmd.starts_at + timedelta(minutes=appointment_type.duration_minutes)
            if cmd.owner_id is not None and cmd.pet_id is not None:
                # L'animal doit appartenir au proprietaire designe.
                if await uow.pet_info.get_owned(cmd.pet_id, cmd.owner_id) is None:
                    raise PetNotFoundError("Cet animal n'appartient pas a ce proprietaire.")

            appointment = Appointment.create_by_staff(
                clinic_id=cmd.clinic_id,
                resource_id=cmd.resource_id,
                appointment_type_id=cmd.appointment_type_id,
                owner_id=cmd.owner_id,
                pet_id=cmd.pet_id if cmd.owner_id is not None else None,
                guest_name=cmd.guest_name,
                guest_pet_name=cmd.guest_pet_name,
                starts_at=cmd.starts_at,
                ends_at=ends_at,
                reason=cmd.reason,
                now=now,
            )
            await uow.appointments.add(appointment)
            await uow.commit()
            return to_appointment_dto(appointment)


class ConfirmAppointment:
    def __init__(self, uow_factory: SchedulingUoWFactory, clock: Clock) -> None:
        self._uow_factory = uow_factory
        self._clock = clock

    async def execute(self, appointment_id: uuid.UUID) -> AppointmentDto:
        async with self._uow_factory() as uow:
            appointment = await uow.appointments.get_by_id(appointment_id)
            if appointment is None:
                raise AppointmentNotFoundError("Rendez-vous introuvable.")
            event = appointment.confirm(self._clock.now())
            await uow.appointments.update(appointment)
            uow.add_event(event)
            await uow.commit()
            return to_appointment_dto(appointment)


class CompleteAppointment:
    def __init__(self, uow_factory: SchedulingUoWFactory) -> None:
        self._uow_factory = uow_factory

    async def execute(self, appointment_id: uuid.UUID) -> AppointmentDto:
        async with self._uow_factory() as uow:
            appointment = await uow.appointments.get_by_id(appointment_id)
            if appointment is None:
                raise AppointmentNotFoundError("Rendez-vous introuvable.")
            appointment.complete()
            await uow.appointments.update(appointment)
            await uow.commit()
            return to_appointment_dto(appointment)


class CancelAppointmentByStaff:
    def __init__(self, uow_factory: SchedulingUoWFactory, clock: Clock) -> None:
        self._uow_factory = uow_factory
        self._clock = clock

    async def execute(
        self, appointment_id: uuid.UUID, *, cancelled_reason: str | None
    ) -> AppointmentDto:
        async with self._uow_factory() as uow:
            appointment = await uow.appointments.get_by_id(appointment_id)
            if appointment is None:
                raise AppointmentNotFoundError("Rendez-vous introuvable.")
            event = appointment.cancel(
                cancelled_reason=cancelled_reason, now=self._clock.now(), cancelled_by="staff"
            )
            await uow.appointments.update(appointment)
            uow.add_event(event)
            await uow.commit()
            return to_appointment_dto(appointment)
