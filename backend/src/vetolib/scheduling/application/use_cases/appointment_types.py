"""Use cases des types de rendez-vous (reglages, staff clinic:manage).

Tous s'executent sous UoW TENANT (fabrique construite avec le clinic_id du
token staff) : la RLS PostgreSQL filtre chaque requete. Une entite d'une
autre clinique est donc simplement INVISIBLE -> 404, jamais 403 (ne pas
reveler l'existence d'une donnee d'un autre tenant).
"""

import uuid

from vetolib.scheduling.application.dto import (
    AppointmentTypeDto,
    CreateAppointmentTypeCommand,
    UpdateAppointmentTypeCommand,
)
from vetolib.scheduling.application.ports import SchedulingUoWFactory
from vetolib.scheduling.domain.appointment_type import AppointmentType
from vetolib.scheduling.domain.errors import AppointmentTypeNotFoundError
from vetolib.shared.application.clock import Clock


def _to_dto(entity: AppointmentType) -> AppointmentTypeDto:
    return AppointmentTypeDto(
        id=entity.id,
        name=entity.name,
        duration_minutes=entity.duration_minutes,
        active=entity.active,
    )


class ListAppointmentTypes:
    """Actifs ET inactifs : l'ecran de reglages montre tout le cycle de vie."""

    def __init__(self, uow_factory: SchedulingUoWFactory) -> None:
        self._uow_factory = uow_factory

    async def execute(self) -> list[AppointmentTypeDto]:
        async with self._uow_factory() as uow:
            return [_to_dto(t) for t in await uow.appointment_types.list_all()]


class CreateAppointmentType:
    def __init__(self, uow_factory: SchedulingUoWFactory, clock: Clock) -> None:
        self._uow_factory = uow_factory
        self._clock = clock

    async def execute(self, cmd: CreateAppointmentTypeCommand) -> AppointmentTypeDto:
        # clinic_id vient du token (route) ; la policy RLS WITH CHECK
        # refuserait de toute facon une ligne d'un autre tenant.
        appointment_type = AppointmentType.create(
            clinic_id=cmd.clinic_id,
            name=cmd.name,
            duration_minutes=cmd.duration_minutes,
            now=self._clock.now(),
        )
        async with self._uow_factory() as uow:
            await uow.appointment_types.add(appointment_type)
            await uow.commit()
            return _to_dto(appointment_type)


class UpdateAppointmentType:
    def __init__(self, uow_factory: SchedulingUoWFactory) -> None:
        self._uow_factory = uow_factory

    async def execute(self, cmd: UpdateAppointmentTypeCommand) -> AppointmentTypeDto:
        async with self._uow_factory() as uow:
            appointment_type = await uow.appointment_types.get_by_id(cmd.appointment_type_id)
            if appointment_type is None:
                raise AppointmentTypeNotFoundError("Type de rendez-vous introuvable.")
            appointment_type.update(
                name=cmd.name, duration_minutes=cmd.duration_minutes, active=cmd.active
            )
            await uow.appointment_types.update(appointment_type)
            await uow.commit()
            return _to_dto(appointment_type)


class DeleteAppointmentType:
    """Soft delete : l'historique des rendez-vous garde sa reference."""

    def __init__(self, uow_factory: SchedulingUoWFactory, clock: Clock) -> None:
        self._uow_factory = uow_factory
        self._clock = clock

    async def execute(self, appointment_type_id: uuid.UUID) -> None:
        async with self._uow_factory() as uow:
            appointment_type = await uow.appointment_types.get_by_id(appointment_type_id)
            if appointment_type is None:
                raise AppointmentTypeNotFoundError("Type de rendez-vous introuvable.")
            appointment_type.soft_delete(self._clock.now())
            await uow.appointment_types.update(appointment_type)
            await uow.commit()
