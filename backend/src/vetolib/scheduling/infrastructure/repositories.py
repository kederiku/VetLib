"""Repositories concrets (SQLAlchemy async) du contexte scheduling.

Memes conventions qu'identity : mapping bete model <-> entite, filtre
soft delete partout, aucun commit (role du UoW). Les methodes *_for_clinic
portent le filtre clinic_id EXPLICITE des flux publics (UoW systeme) --
voir la convention documentee dans domain/repositories.py.

Les readers cross-contexte (clinics, pets, owners) importent les modeles
des autres contextes : dependance infra -> infra ASSUMEE du monolithe
modulaire (les couches domaine/application, elles, ne voient que des ports).
"""

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from vetolib.identity.infrastructure.models import ClinicModel, OwnerModel, UserModel
from vetolib.patients.infrastructure.models import PetModel
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
from vetolib.scheduling.domain.value_objects import (
    AppointmentStatus,
    ResourceKind,
    WeeklyTimeRange,
)
from vetolib.scheduling.domain.weekly_schedule import WeeklySchedule
from vetolib.scheduling.infrastructure.models import (
    AppointmentModel,
    AppointmentTypeModel,
    ResourceModel,
    ScheduleExceptionModel,
    WeeklyScheduleModel,
)

_ACTIVE_STATUSES = ("pending", "confirmed")


# --- Mappers model <-> entite ----------------------------------------------


def _resource_to_entity(model: ResourceModel) -> Resource:
    return Resource(
        id=model.id,
        created_at=model.created_at,
        deleted_at=model.deleted_at,
        clinic_id=model.clinic_id,
        kind=ResourceKind(model.kind),
        name=model.name,
        user_id=model.user_id,
        active=model.active,
    )


def _resource_to_model(entity: Resource) -> ResourceModel:
    return ResourceModel(
        id=entity.id,
        created_at=entity.created_at,
        deleted_at=entity.deleted_at,
        clinic_id=entity.clinic_id,
        kind=entity.kind.value,
        name=entity.name,
        user_id=entity.user_id,
        active=entity.active,
    )


def _schedule_to_entity(model: WeeklyScheduleModel) -> WeeklySchedule:
    return WeeklySchedule(
        id=model.id,
        created_at=model.created_at,
        deleted_at=model.deleted_at,
        clinic_id=model.clinic_id,
        resource_id=model.resource_id,
        slot=WeeklyTimeRange(
            weekday=model.weekday, start_time=model.start_time, end_time=model.end_time
        ),
    )


def _schedule_to_model(entity: WeeklySchedule) -> WeeklyScheduleModel:
    return WeeklyScheduleModel(
        id=entity.id,
        created_at=entity.created_at,
        deleted_at=entity.deleted_at,
        clinic_id=entity.clinic_id,
        resource_id=entity.resource_id,
        weekday=entity.slot.weekday,
        start_time=entity.slot.start_time,
        end_time=entity.slot.end_time,
    )


def _exception_to_entity(model: ScheduleExceptionModel) -> ScheduleException:
    return ScheduleException(
        id=model.id,
        created_at=model.created_at,
        deleted_at=model.deleted_at,
        clinic_id=model.clinic_id,
        resource_id=model.resource_id,
        starts_at=model.starts_at,
        ends_at=model.ends_at,
        reason=model.reason,
    )


def _exception_to_model(entity: ScheduleException) -> ScheduleExceptionModel:
    return ScheduleExceptionModel(
        id=entity.id,
        created_at=entity.created_at,
        deleted_at=entity.deleted_at,
        clinic_id=entity.clinic_id,
        resource_id=entity.resource_id,
        starts_at=entity.starts_at,
        ends_at=entity.ends_at,
        reason=entity.reason,
    )


def _type_to_entity(model: AppointmentTypeModel) -> AppointmentType:
    return AppointmentType(
        id=model.id,
        created_at=model.created_at,
        deleted_at=model.deleted_at,
        clinic_id=model.clinic_id,
        name=model.name,
        duration_minutes=model.duration_minutes,
        active=model.active,
    )


def _type_to_model(entity: AppointmentType) -> AppointmentTypeModel:
    return AppointmentTypeModel(
        id=entity.id,
        created_at=entity.created_at,
        deleted_at=entity.deleted_at,
        clinic_id=entity.clinic_id,
        name=entity.name,
        duration_minutes=entity.duration_minutes,
        active=entity.active,
    )


def _appointment_to_entity(model: AppointmentModel) -> Appointment:
    return Appointment(
        id=model.id,
        created_at=model.created_at,
        deleted_at=model.deleted_at,
        clinic_id=model.clinic_id,
        resource_id=model.resource_id,
        appointment_type_id=model.appointment_type_id,
        owner_id=model.owner_id,
        pet_id=model.pet_id,
        guest_name=model.guest_name,
        guest_pet_name=model.guest_pet_name,
        starts_at=model.starts_at,
        ends_at=model.ends_at,
        status=AppointmentStatus(model.status),
        reason=model.reason,
        cancelled_reason=model.cancelled_reason,
    )


def _appointment_to_model(entity: Appointment) -> AppointmentModel:
    return AppointmentModel(
        id=entity.id,
        created_at=entity.created_at,
        deleted_at=entity.deleted_at,
        clinic_id=entity.clinic_id,
        resource_id=entity.resource_id,
        appointment_type_id=entity.appointment_type_id,
        owner_id=entity.owner_id,
        pet_id=entity.pet_id,
        guest_name=entity.guest_name,
        guest_pet_name=entity.guest_pet_name,
        starts_at=entity.starts_at,
        ends_at=entity.ends_at,
        status=entity.status.value,
        reason=entity.reason,
        cancelled_reason=entity.cancelled_reason,
    )


# --- Repositories ----------------------------------------------------------


class SqlAlchemyResourceRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, resource_id: uuid.UUID) -> Resource | None:
        stmt = select(ResourceModel).where(
            ResourceModel.id == resource_id, ResourceModel.deleted_at.is_(None)
        )
        model = (await self._session.execute(stmt)).scalar_one_or_none()
        return None if model is None else _resource_to_entity(model)

    async def list_all(self) -> list[Resource]:
        stmt = (
            select(ResourceModel)
            .where(ResourceModel.deleted_at.is_(None))
            .order_by(ResourceModel.name)
        )
        return [_resource_to_entity(m) for m in (await self._session.execute(stmt)).scalars()]

    async def list_active_for_clinic(self, clinic_id: uuid.UUID) -> list[Resource]:
        stmt = (
            select(ResourceModel)
            .where(
                ResourceModel.clinic_id == clinic_id,
                ResourceModel.active.is_(True),
                ResourceModel.deleted_at.is_(None),
            )
            .order_by(ResourceModel.name)
        )
        return [_resource_to_entity(m) for m in (await self._session.execute(stmt)).scalars()]

    async def add(self, resource: Resource) -> None:
        self._session.add(_resource_to_model(resource))

    async def update(self, resource: Resource) -> None:
        await self._session.merge(_resource_to_model(resource))


class SqlAlchemyWeeklyScheduleRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_for_resource(self, resource_id: uuid.UUID) -> list[WeeklySchedule]:
        stmt = select(WeeklyScheduleModel).where(
            WeeklyScheduleModel.resource_id == resource_id,
            WeeklyScheduleModel.deleted_at.is_(None),
        )
        return [_schedule_to_entity(m) for m in (await self._session.execute(stmt)).scalars()]

    async def list_for_clinic_resources(
        self, clinic_id: uuid.UUID, resource_ids: list[uuid.UUID]
    ) -> list[WeeklySchedule]:
        stmt = select(WeeklyScheduleModel).where(
            WeeklyScheduleModel.clinic_id == clinic_id,
            WeeklyScheduleModel.resource_id.in_(resource_ids),
            WeeklyScheduleModel.deleted_at.is_(None),
        )
        return [_schedule_to_entity(m) for m in (await self._session.execute(stmt)).scalars()]

    async def replace_for_resource(
        self, resource_id: uuid.UUID, items: list[WeeklySchedule], now: datetime
    ) -> None:
        # Soft delete en masse des lignes vivantes puis insertion des
        # nouvelles : tout part dans LA transaction du UoW (atomique).
        from sqlalchemy import update as sa_update

        await self._session.execute(
            sa_update(WeeklyScheduleModel)
            .where(
                WeeklyScheduleModel.resource_id == resource_id,
                WeeklyScheduleModel.deleted_at.is_(None),
            )
            .values(deleted_at=now)
        )
        for item in items:
            self._session.add(_schedule_to_model(item))


class SqlAlchemyScheduleExceptionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, exception_id: uuid.UUID) -> ScheduleException | None:
        stmt = select(ScheduleExceptionModel).where(
            ScheduleExceptionModel.id == exception_id,
            ScheduleExceptionModel.deleted_at.is_(None),
        )
        model = (await self._session.execute(stmt)).scalar_one_or_none()
        return None if model is None else _exception_to_entity(model)

    async def list_for_resource(self, resource_id: uuid.UUID) -> list[ScheduleException]:
        stmt = select(ScheduleExceptionModel).where(
            ScheduleExceptionModel.resource_id == resource_id,
            ScheduleExceptionModel.deleted_at.is_(None),
        )
        return [_exception_to_entity(m) for m in (await self._session.execute(stmt)).scalars()]

    async def list_overlapping(
        self,
        clinic_id: uuid.UUID,
        resource_ids: list[uuid.UUID],
        starts_at: datetime,
        ends_at: datetime,
    ) -> list[ScheduleException]:
        stmt = select(ScheduleExceptionModel).where(
            ScheduleExceptionModel.clinic_id == clinic_id,
            ScheduleExceptionModel.resource_id.in_(resource_ids),
            ScheduleExceptionModel.starts_at < ends_at,
            ScheduleExceptionModel.ends_at > starts_at,
            ScheduleExceptionModel.deleted_at.is_(None),
        )
        return [_exception_to_entity(m) for m in (await self._session.execute(stmt)).scalars()]

    async def add(self, exception: ScheduleException) -> None:
        self._session.add(_exception_to_model(exception))

    async def update(self, exception: ScheduleException) -> None:
        await self._session.merge(_exception_to_model(exception))


class SqlAlchemyAppointmentTypeRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, appointment_type_id: uuid.UUID) -> AppointmentType | None:
        stmt = select(AppointmentTypeModel).where(
            AppointmentTypeModel.id == appointment_type_id,
            AppointmentTypeModel.deleted_at.is_(None),
        )
        model = (await self._session.execute(stmt)).scalar_one_or_none()
        return None if model is None else _type_to_entity(model)

    async def list_all(self) -> list[AppointmentType]:
        stmt = (
            select(AppointmentTypeModel)
            .where(AppointmentTypeModel.deleted_at.is_(None))
            .order_by(AppointmentTypeModel.name)
        )
        return [_type_to_entity(m) for m in (await self._session.execute(stmt)).scalars()]

    async def get_active_for_clinic(
        self, clinic_id: uuid.UUID, appointment_type_id: uuid.UUID
    ) -> AppointmentType | None:
        stmt = select(AppointmentTypeModel).where(
            AppointmentTypeModel.id == appointment_type_id,
            AppointmentTypeModel.clinic_id == clinic_id,
            AppointmentTypeModel.active.is_(True),
            AppointmentTypeModel.deleted_at.is_(None),
        )
        model = (await self._session.execute(stmt)).scalar_one_or_none()
        return None if model is None else _type_to_entity(model)

    async def list_active_for_clinic(self, clinic_id: uuid.UUID) -> list[AppointmentType]:
        stmt = (
            select(AppointmentTypeModel)
            .where(
                AppointmentTypeModel.clinic_id == clinic_id,
                AppointmentTypeModel.active.is_(True),
                AppointmentTypeModel.deleted_at.is_(None),
            )
            .order_by(AppointmentTypeModel.name)
        )
        return [_type_to_entity(m) for m in (await self._session.execute(stmt)).scalars()]

    async def add(self, appointment_type: AppointmentType) -> None:
        self._session.add(_type_to_model(appointment_type))

    async def update(self, appointment_type: AppointmentType) -> None:
        await self._session.merge(_type_to_model(appointment_type))


class SqlAlchemyAppointmentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, appointment_id: uuid.UUID) -> Appointment | None:
        stmt = select(AppointmentModel).where(
            AppointmentModel.id == appointment_id, AppointmentModel.deleted_at.is_(None)
        )
        model = (await self._session.execute(stmt)).scalar_one_or_none()
        return None if model is None else _appointment_to_entity(model)

    async def get_for_owner(
        self, appointment_id: uuid.UUID, owner_id: uuid.UUID
    ) -> Appointment | None:
        # Filtre owner_id EN SQL : le rendez-vous d'un autre proprietaire
        # est introuvable par construction (barriere du flux systeme).
        stmt = select(AppointmentModel).where(
            AppointmentModel.id == appointment_id,
            AppointmentModel.owner_id == owner_id,
            AppointmentModel.deleted_at.is_(None),
        )
        model = (await self._session.execute(stmt)).scalar_one_or_none()
        return None if model is None else _appointment_to_entity(model)

    async def add(self, appointment: Appointment) -> None:
        self._session.add(_appointment_to_model(appointment))

    async def update(self, appointment: Appointment) -> None:
        await self._session.merge(_appointment_to_model(appointment))

    async def list_agenda(
        self, *, starts_at: datetime, ends_at: datetime, resource_id: uuid.UUID | None
    ) -> list[AgendaEntry]:
        # Jointures : types/resources (tenantes, RLS active), owners/pets
        # (tables GLOBALES : le GRANT SELECT au role applicatif rend la
        # jointure legitime sous transaction tenant).
        stmt = (
            select(
                AppointmentModel,
                AppointmentTypeModel.name.label("type_name"),
                ResourceModel.name.label("resource_name"),
                OwnerModel.first_name,
                OwnerModel.last_name,
                OwnerModel.phone,
                PetModel.name.label("pet_name"),
                PetModel.species.label("pet_species"),
            )
            .join(
                AppointmentTypeModel,
                AppointmentModel.appointment_type_id == AppointmentTypeModel.id,
            )
            .join(ResourceModel, AppointmentModel.resource_id == ResourceModel.id)
            .outerjoin(OwnerModel, AppointmentModel.owner_id == OwnerModel.id)
            .outerjoin(PetModel, AppointmentModel.pet_id == PetModel.id)
            .where(
                AppointmentModel.starts_at < ends_at,
                AppointmentModel.ends_at > starts_at,
                AppointmentModel.deleted_at.is_(None),
            )
            .order_by(AppointmentModel.starts_at)
        )
        if resource_id is not None:
            stmt = stmt.where(AppointmentModel.resource_id == resource_id)
        rows = (await self._session.execute(stmt)).all()
        return [
            AgendaEntry(
                id=row.AppointmentModel.id,
                resource_id=row.AppointmentModel.resource_id,
                resource_name=row.resource_name,
                appointment_type_id=row.AppointmentModel.appointment_type_id,
                appointment_type_name=row.type_name,
                starts_at=row.AppointmentModel.starts_at,
                ends_at=row.AppointmentModel.ends_at,
                status=AppointmentStatus(row.AppointmentModel.status),
                reason=row.AppointmentModel.reason,
                cancelled_reason=row.AppointmentModel.cancelled_reason,
                owner_id=row.AppointmentModel.owner_id,
                owner_first_name=row.first_name,
                owner_last_name=row.last_name,
                owner_phone=row.phone,
                pet_name=row.pet_name,
                pet_species=row.pet_species,
                guest_name=row.AppointmentModel.guest_name,
                guest_pet_name=row.AppointmentModel.guest_pet_name,
            )
            for row in rows
        ]

    async def list_for_owner(self, owner_id: uuid.UUID) -> list[OwnerAppointmentView]:
        # Sous UoW SYSTEME (cross-cliniques) : le filtre owner_id est LA
        # barriere. Jointures avec les noms pour l'affichage.
        stmt = (
            select(
                AppointmentModel,
                ClinicModel.name.label("clinic_name"),
                AppointmentTypeModel.name.label("type_name"),
                ResourceModel.name.label("resource_name"),
                PetModel.name.label("pet_name"),
            )
            .join(ClinicModel, AppointmentModel.clinic_id == ClinicModel.id)
            .join(
                AppointmentTypeModel,
                AppointmentModel.appointment_type_id == AppointmentTypeModel.id,
            )
            .join(ResourceModel, AppointmentModel.resource_id == ResourceModel.id)
            .outerjoin(PetModel, AppointmentModel.pet_id == PetModel.id)
            .where(
                AppointmentModel.owner_id == owner_id,
                AppointmentModel.deleted_at.is_(None),
            )
            .order_by(AppointmentModel.starts_at.desc())
        )
        rows = (await self._session.execute(stmt)).all()
        return [
            OwnerAppointmentView(
                id=row.AppointmentModel.id,
                clinic_id=row.AppointmentModel.clinic_id,
                clinic_name=row.clinic_name,
                appointment_type_name=row.type_name,
                resource_name=row.resource_name,
                pet_id=row.AppointmentModel.pet_id,
                pet_name=row.pet_name,
                starts_at=row.AppointmentModel.starts_at,
                ends_at=row.AppointmentModel.ends_at,
                status=AppointmentStatus(row.AppointmentModel.status),
                reason=row.AppointmentModel.reason,
                cancelled_reason=row.AppointmentModel.cancelled_reason,
            )
            for row in rows
        ]

    async def list_busy_between(
        self,
        clinic_id: uuid.UUID,
        resource_ids: list[uuid.UUID],
        starts_at: datetime,
        ends_at: datetime,
    ) -> list[BusyPeriod]:
        stmt = select(
            AppointmentModel.resource_id,
            AppointmentModel.starts_at,
            AppointmentModel.ends_at,
        ).where(
            AppointmentModel.clinic_id == clinic_id,
            AppointmentModel.resource_id.in_(resource_ids),
            AppointmentModel.status.in_(_ACTIVE_STATUSES),
            AppointmentModel.starts_at < ends_at,
            AppointmentModel.ends_at > starts_at,
            AppointmentModel.deleted_at.is_(None),
        )
        rows = (await self._session.execute(stmt)).all()
        return [
            BusyPeriod(resource_id=row.resource_id, starts_at=row.starts_at, ends_at=row.ends_at)
            for row in rows
        ]


class SqlAlchemyClinicInfoReader:
    """Lecture minimale des cliniques (table identity, GLOBALE, hors tenant).

    Point de passage UNIQUE de trois flux de scheduling : les disponibilites
    publiques, les types de rendez-vous publics et l'agenda du staff. C'est
    donc ici, et seulement ici, qu'il faut exclure les cliniques suspendues
    par le back-office : une clinique gelee cesse d'un coup d'etre reservable
    et son agenda repond 404, sans avoir a modifier trois use cases.
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_info(self, clinic_id: uuid.UUID) -> ClinicInfo | None:
        stmt = select(ClinicModel.id, ClinicModel.name, ClinicModel.timezone).where(
            ClinicModel.id == clinic_id,
            ClinicModel.deleted_at.is_(None),
            # Suspendue = invisible pour scheduling (voir la docstring).
            ClinicModel.is_active.is_(True),
        )
        row = (await self._session.execute(stmt)).one_or_none()
        if row is None:
            return None
        return ClinicInfo(id=row.id, name=row.name, timezone=row.timezone)


class SqlAlchemyOwnerReader:
    """Existence d'un proprietaire (table identity.owners, GLOBALE)."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def exists(self, owner_id: uuid.UUID) -> bool:
        stmt = select(OwnerModel.id).where(
            OwnerModel.id == owner_id, OwnerModel.deleted_at.is_(None)
        )
        return (await self._session.execute(stmt)).one_or_none() is not None


class SqlAlchemyStaffUserReader:
    """Existence d'un compte staff SOUS la transaction courante.

    Sous UoW tenant, la RLS de la table users filtre par clinique : un
    user d'un autre tenant est invisible ici -- c'est voulu.
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def exists(self, user_id: uuid.UUID) -> bool:
        stmt = select(UserModel.id).where(UserModel.id == user_id, UserModel.deleted_at.is_(None))
        return (await self._session.execute(stmt)).one_or_none() is not None


class SqlAlchemyPetReader:
    """Verification d'appartenance d'un animal (table patients, GLOBALE)."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_owned(self, pet_id: uuid.UUID, owner_id: uuid.UUID) -> PetInfo | None:
        stmt = select(PetModel.id, PetModel.owner_id, PetModel.name).where(
            PetModel.id == pet_id,
            PetModel.owner_id == owner_id,
            PetModel.deleted_at.is_(None),
        )
        row = (await self._session.execute(stmt)).one_or_none()
        if row is None:
            return None
        return PetInfo(id=row.id, owner_id=row.owner_id, name=row.name)
