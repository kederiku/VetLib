"""Doublures en memoire des ports scheduling (gabarit identity/fakes.py).

Le FakeSchedulingUnitOfWork expose les memes repositories que le vrai UoW,
sur des dicts inspectables par les tests. Les readers cross-contexte
(clinic_info, pet_info) sont alimentes par de simples dicts de DTOs.
"""

import uuid
from datetime import UTC, datetime
from types import TracebackType
from typing import Self

from vetolib.scheduling.application.availability import BusyPeriod
from vetolib.scheduling.application.dto import (
    AgendaEntry,
    ClinicInfo,
    OwnerAppointmentView,
    PetInfo,
)
from vetolib.scheduling.domain.appointment import Appointment
from vetolib.scheduling.domain.appointment_type import AppointmentType
from vetolib.scheduling.domain.resource import Resource
from vetolib.scheduling.domain.schedule_exception import ScheduleException
from vetolib.scheduling.domain.value_objects import AppointmentStatus
from vetolib.scheduling.domain.weekly_schedule import WeeklySchedule
from vetolib.shared.domain.events import DomainEvent


class FakeResourceRepository:
    def __init__(self, store: dict[uuid.UUID, Resource]) -> None:
        self._store = store

    async def get_by_id(self, resource_id: uuid.UUID) -> Resource | None:
        resource = self._store.get(resource_id)
        return resource if resource is not None and resource.deleted_at is None else None

    async def list_all(self) -> list[Resource]:
        return [r for r in self._store.values() if r.deleted_at is None]

    async def list_active_for_clinic(self, clinic_id: uuid.UUID) -> list[Resource]:
        return [
            r
            for r in self._store.values()
            if r.clinic_id == clinic_id and r.active and r.deleted_at is None
        ]

    async def add(self, resource: Resource) -> None:
        self._store[resource.id] = resource

    async def update(self, resource: Resource) -> None:
        self._store[resource.id] = resource


class FakeWeeklyScheduleRepository:
    def __init__(self, store: dict[uuid.UUID, WeeklySchedule]) -> None:
        self._store = store

    async def list_for_resource(self, resource_id: uuid.UUID) -> list[WeeklySchedule]:
        return [
            s for s in self._store.values() if s.resource_id == resource_id and s.deleted_at is None
        ]

    async def list_for_clinic_resources(
        self, clinic_id: uuid.UUID, resource_ids: list[uuid.UUID]
    ) -> list[WeeklySchedule]:
        return [
            s
            for s in self._store.values()
            if s.clinic_id == clinic_id and s.resource_id in resource_ids and s.deleted_at is None
        ]

    async def replace_for_resource(
        self, resource_id: uuid.UUID, items: list[WeeklySchedule], now: datetime
    ) -> None:
        for schedule in self._store.values():
            if schedule.resource_id == resource_id and schedule.deleted_at is None:
                schedule.deleted_at = now
        for item in items:
            self._store[item.id] = item


class FakeScheduleExceptionRepository:
    def __init__(self, store: dict[uuid.UUID, ScheduleException]) -> None:
        self._store = store

    async def get_by_id(self, exception_id: uuid.UUID) -> ScheduleException | None:
        exception = self._store.get(exception_id)
        return exception if exception is not None and exception.deleted_at is None else None

    async def list_for_resource(self, resource_id: uuid.UUID) -> list[ScheduleException]:
        return [
            e for e in self._store.values() if e.resource_id == resource_id and e.deleted_at is None
        ]

    async def list_overlapping(
        self,
        clinic_id: uuid.UUID,
        resource_ids: list[uuid.UUID],
        starts_at: datetime,
        ends_at: datetime,
    ) -> list[ScheduleException]:
        return [
            e
            for e in self._store.values()
            if e.clinic_id == clinic_id
            and e.resource_id in resource_ids
            and e.starts_at < ends_at
            and e.ends_at > starts_at
            and e.deleted_at is None
        ]

    async def add(self, exception: ScheduleException) -> None:
        self._store[exception.id] = exception

    async def update(self, exception: ScheduleException) -> None:
        self._store[exception.id] = exception


class FakeAppointmentTypeRepository:
    def __init__(self, store: dict[uuid.UUID, AppointmentType]) -> None:
        self._store = store

    async def get_by_id(self, appointment_type_id: uuid.UUID) -> AppointmentType | None:
        appointment_type = self._store.get(appointment_type_id)
        if appointment_type is None or appointment_type.deleted_at is not None:
            return None
        return appointment_type

    async def list_all(self) -> list[AppointmentType]:
        return [t for t in self._store.values() if t.deleted_at is None]

    async def get_active_for_clinic(
        self, clinic_id: uuid.UUID, appointment_type_id: uuid.UUID
    ) -> AppointmentType | None:
        appointment_type = await self.get_by_id(appointment_type_id)
        if (
            appointment_type is None
            or appointment_type.clinic_id != clinic_id
            or not appointment_type.active
        ):
            return None
        return appointment_type

    async def list_active_for_clinic(self, clinic_id: uuid.UUID) -> list[AppointmentType]:
        return [
            t
            for t in self._store.values()
            if t.clinic_id == clinic_id and t.active and t.deleted_at is None
        ]

    async def add(self, appointment_type: AppointmentType) -> None:
        self._store[appointment_type.id] = appointment_type

    async def update(self, appointment_type: AppointmentType) -> None:
        self._store[appointment_type.id] = appointment_type


class FakeAppointmentRepository:
    def __init__(self, store: dict[uuid.UUID, Appointment]) -> None:
        self._store = store

    async def get_by_id(self, appointment_id: uuid.UUID) -> Appointment | None:
        appointment = self._store.get(appointment_id)
        return appointment if appointment is not None and appointment.deleted_at is None else None

    async def get_for_owner(
        self, appointment_id: uuid.UUID, owner_id: uuid.UUID
    ) -> Appointment | None:
        appointment = await self.get_by_id(appointment_id)
        if appointment is None or appointment.owner_id != owner_id:
            return None
        return appointment

    async def add(self, appointment: Appointment) -> None:
        self._store[appointment.id] = appointment

    async def update(self, appointment: Appointment) -> None:
        self._store[appointment.id] = appointment

    async def list_agenda(
        self, *, starts_at: datetime, ends_at: datetime, resource_id: uuid.UUID | None
    ) -> list[AgendaEntry]:
        # Vue enrichie non simulee : les tests unit passent par les entites.
        return []

    async def list_for_owner(self, owner_id: uuid.UUID) -> list[OwnerAppointmentView]:
        return []

    async def list_busy_between(
        self,
        clinic_id: uuid.UUID,
        resource_ids: list[uuid.UUID],
        starts_at: datetime,
        ends_at: datetime,
    ) -> list[BusyPeriod]:
        return [
            BusyPeriod(resource_id=a.resource_id, starts_at=a.starts_at, ends_at=a.ends_at)
            for a in self._store.values()
            if a.clinic_id == clinic_id
            and a.resource_id in resource_ids
            and a.status in (AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED)
            and a.starts_at < ends_at
            and a.ends_at > starts_at
            and a.deleted_at is None
        ]


class FakeClinicInfoReader:
    def __init__(self, store: dict[uuid.UUID, ClinicInfo]) -> None:
        self._store = store

    async def get_info(self, clinic_id: uuid.UUID) -> ClinicInfo | None:
        return self._store.get(clinic_id)


class FakePetReader:
    def __init__(self, store: dict[uuid.UUID, PetInfo]) -> None:
        self._store = store

    async def get_owned(self, pet_id: uuid.UUID, owner_id: uuid.UUID) -> PetInfo | None:
        pet = self._store.get(pet_id)
        if pet is None or pet.owner_id != owner_id:
            return None
        return pet


class FakeOwnerReader:
    def __init__(self, ids: set[uuid.UUID]) -> None:
        self._ids = ids

    async def exists(self, owner_id: uuid.UUID) -> bool:
        return owner_id in self._ids


class FakeStaffUserReader:
    def __init__(self, ids: set[uuid.UUID]) -> None:
        self._ids = ids

    async def exists(self, user_id: uuid.UUID) -> bool:
        return user_id in self._ids


class FakeSchedulingUnitOfWork:
    """UoW in-memory : satisfait structurellement SchedulingUnitOfWork."""

    def __init__(self) -> None:
        self.resource_store: dict[uuid.UUID, Resource] = {}
        self.schedule_store: dict[uuid.UUID, WeeklySchedule] = {}
        self.exception_store: dict[uuid.UUID, ScheduleException] = {}
        self.type_store: dict[uuid.UUID, AppointmentType] = {}
        self.appointment_store: dict[uuid.UUID, Appointment] = {}
        self.clinic_store: dict[uuid.UUID, ClinicInfo] = {}
        self.pet_store: dict[uuid.UUID, PetInfo] = {}
        self.resources = FakeResourceRepository(self.resource_store)
        self.schedules = FakeWeeklyScheduleRepository(self.schedule_store)
        self.exceptions = FakeScheduleExceptionRepository(self.exception_store)
        self.appointment_types = FakeAppointmentTypeRepository(self.type_store)
        self.appointments = FakeAppointmentRepository(self.appointment_store)
        self.clinic_info = FakeClinicInfoReader(self.clinic_store)
        self.pet_info = FakePetReader(self.pet_store)
        self.owner_ids: set[uuid.UUID] = set()
        self.staff_ids: set[uuid.UUID] = set()
        self.owner_info = FakeOwnerReader(self.owner_ids)
        self.staff_info = FakeStaffUserReader(self.staff_ids)
        self.events: list[DomainEvent] = []
        self.commits = 0
        self.rollbacks = 0

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        return None

    async def commit(self) -> None:
        self.commits += 1

    async def rollback(self) -> None:
        self.rollbacks += 1

    def add_event(self, event: DomainEvent) -> None:
        self.events.append(event)


class FixedClock:
    """Horloge figee (les tests scheduling ont leur propre copie locale)."""

    def __init__(self, at: datetime | None = None) -> None:
        self.at = at or datetime(2026, 1, 1, 9, 0, tzinfo=UTC)

    def now(self) -> datetime:
        return self.at
