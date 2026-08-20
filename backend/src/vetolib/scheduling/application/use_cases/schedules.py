"""Use cases des horaires hebdomadaires et des absences (reglages staff).

UoW tenant partout : la ressource visee doit appartenir a la clinique du
token (sinon RLS -> introuvable -> 404).
"""

import uuid
from datetime import time

from vetolib.scheduling.application.dto import (
    CreateExceptionCommand,
    ScheduleExceptionDto,
    SetWeeklyScheduleCommand,
    WeeklyScheduleDto,
)
from vetolib.scheduling.application.ports import SchedulingUoWFactory
from vetolib.scheduling.domain.errors import ResourceNotFoundError
from vetolib.scheduling.domain.schedule_exception import ScheduleException
from vetolib.scheduling.domain.weekly_schedule import WeeklySchedule
from vetolib.shared.application.clock import Clock
from vetolib.shared.domain.errors import DomainValidationError, EntityNotFoundError


class GetResourceWeeklySchedule:
    def __init__(self, uow_factory: SchedulingUoWFactory) -> None:
        self._uow_factory = uow_factory

    async def execute(self, resource_id: uuid.UUID) -> list[WeeklyScheduleDto]:
        async with self._uow_factory() as uow:
            if await uow.resources.get_by_id(resource_id) is None:
                raise ResourceNotFoundError("Praticien introuvable.")
            schedules = await uow.schedules.list_for_resource(resource_id)
            return [
                WeeklyScheduleDto(
                    weekday=s.slot.weekday,
                    start_time=s.slot.start_time,
                    end_time=s.slot.end_time,
                )
                for s in sorted(schedules, key=lambda s: (s.slot.weekday, s.slot.start_time))
            ]


class SetResourceWeeklySchedule:
    """REMPLACEMENT COMPLET de la semaine type (choix assume : plus simple
    et plus sur qu'un CRUD ligne a ligne pour un formulaire "ma semaine")."""

    def __init__(self, uow_factory: SchedulingUoWFactory, clock: Clock) -> None:
        self._uow_factory = uow_factory
        self._clock = clock

    async def execute(self, cmd: SetWeeklyScheduleCommand) -> list[WeeklyScheduleDto]:
        # Chevauchement entre deux plages d'un MEME jour : refuse (une plage
        # 09:00-12:00 et une 11:00-14:00 le lundi seraient incoherentes).
        by_day: dict[int, list[tuple[time, time]]] = {}
        for item in cmd.items:
            for other_start, other_end in by_day.get(item.weekday, []):
                if item.start_time < other_end and item.end_time > other_start:
                    raise DomainValidationError(
                        "Deux plages du meme jour ne peuvent pas se chevaucher."
                    )
            by_day.setdefault(item.weekday, []).append((item.start_time, item.end_time))

        now = self._clock.now()
        async with self._uow_factory() as uow:
            resource = await uow.resources.get_by_id(cmd.resource_id)
            if resource is None:
                raise ResourceNotFoundError("Praticien introuvable.")
            items = [
                WeeklySchedule.create(
                    clinic_id=resource.clinic_id,
                    resource_id=cmd.resource_id,
                    slot=slot,
                    now=now,
                )
                for slot in cmd.items
            ]
            await uow.schedules.replace_for_resource(cmd.resource_id, items, now)
            await uow.commit()
            return [
                WeeklyScheduleDto(
                    weekday=s.slot.weekday,
                    start_time=s.slot.start_time,
                    end_time=s.slot.end_time,
                )
                for s in sorted(items, key=lambda s: (s.slot.weekday, s.slot.start_time))
            ]


class ListResourceExceptions:
    def __init__(self, uow_factory: SchedulingUoWFactory) -> None:
        self._uow_factory = uow_factory

    async def execute(self, resource_id: uuid.UUID) -> list[ScheduleExceptionDto]:
        async with self._uow_factory() as uow:
            if await uow.resources.get_by_id(resource_id) is None:
                raise ResourceNotFoundError("Praticien introuvable.")
            exceptions = await uow.exceptions.list_for_resource(resource_id)
            return [
                ScheduleExceptionDto(
                    id=e.id,
                    resource_id=e.resource_id,
                    starts_at=e.starts_at,
                    ends_at=e.ends_at,
                    reason=e.reason,
                )
                for e in sorted(exceptions, key=lambda e: e.starts_at)
            ]


class CreateResourceException:
    def __init__(self, uow_factory: SchedulingUoWFactory, clock: Clock) -> None:
        self._uow_factory = uow_factory
        self._clock = clock

    async def execute(self, cmd: CreateExceptionCommand) -> ScheduleExceptionDto:
        async with self._uow_factory() as uow:
            resource = await uow.resources.get_by_id(cmd.resource_id)
            if resource is None:
                raise ResourceNotFoundError("Praticien introuvable.")
            exception = ScheduleException.create(
                clinic_id=resource.clinic_id,
                resource_id=cmd.resource_id,
                starts_at=cmd.starts_at,
                ends_at=cmd.ends_at,
                reason=cmd.reason,
                now=self._clock.now(),
            )
            await uow.exceptions.add(exception)
            await uow.commit()
            return ScheduleExceptionDto(
                id=exception.id,
                resource_id=exception.resource_id,
                starts_at=exception.starts_at,
                ends_at=exception.ends_at,
                reason=exception.reason,
            )


class DeleteResourceException:
    def __init__(self, uow_factory: SchedulingUoWFactory, clock: Clock) -> None:
        self._uow_factory = uow_factory
        self._clock = clock

    async def execute(self, resource_id: uuid.UUID, exception_id: uuid.UUID) -> None:
        async with self._uow_factory() as uow:
            exception = await uow.exceptions.get_by_id(exception_id)
            # Verifie aussi la coherence du couple (resource, exception) de
            # l'URL : une absence d'un autre praticien est "introuvable".
            if exception is None or exception.resource_id != resource_id:
                raise EntityNotFoundError("Absence introuvable.")
            exception.soft_delete(self._clock.now())
            await uow.exceptions.update(exception)
            await uow.commit()
