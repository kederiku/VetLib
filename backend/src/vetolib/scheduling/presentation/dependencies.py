"""Dependances FastAPI du contexte scheduling : composition root du contexte.

C'est ICI que le mode tenant devient concret -- premier usage reel de la RLS
en lecture/ecriture :

- get_scheduling_tenant_uow_factory : fabrique une UoW TENANT figee sur le
  clinic_id du token STAFF (claim cid) -> SET LOCAL ROLE vetolib_app +
  app.clinic_id a chaque transaction, PostgreSQL isole le tenant ;
- get_scheduling_make_tenant_uow : fabrique PARAMETREE par clinic_id, pour
  le booking d'un proprietaire (la clinique cible vient de SA demande, pas
  d'un token staff) ;
- get_scheduling_system_uow_factory : UoW systeme (role proprietaire) pour
  les lectures publiques et les flux owner cross-cliniques -- la, les
  filtres explicites (clinic_id, owner_id) des repos sont LA barriere.

Imports croises assumes : CurrentUserDep/CurrentOwnerDep/require_permission
viennent d'identity (l'authentification EST le produit de ce contexte) ;
SettingsDep/SessionmakerDep de shared.
"""

import uuid
from typing import Annotated

from fastapi import Depends

from vetolib.identity.presentation.dependencies import (
    CurrentUserDep,
    get_clock,
)
from vetolib.scheduling.application.ports import (
    SchedulingTenantUoWFactory,
    SchedulingUnitOfWork,
    SchedulingUoWFactory,
)
from vetolib.scheduling.application.use_cases import (
    BookAppointmentByOwner,
    CancelAppointmentByOwner,
    CancelAppointmentByStaff,
    CompleteAppointment,
    ConfirmAppointment,
    CreateAppointmentByStaff,
    CreateAppointmentType,
    CreateResource,
    CreateResourceException,
    DeleteAppointmentType,
    DeleteResource,
    DeleteResourceException,
    GetAgenda,
    GetPublicAvailabilities,
    GetResourceWeeklySchedule,
    ListAppointmentTypes,
    ListClinicAppointmentTypes,
    ListOwnerAppointments,
    ListResourceExceptions,
    ListResources,
    SetResourceWeeklySchedule,
    UpdateAppointmentType,
    UpdateResource,
)
from vetolib.scheduling.infrastructure.uow import SqlAlchemySchedulingUnitOfWork
from vetolib.shared.application.uow import TenantContext
from vetolib.shared.infrastructure.clock import SystemClock
from vetolib.shared.presentation.dependencies import SessionmakerDep, SettingsDep

ClockDep = Annotated[SystemClock, Depends(get_clock)]


def get_scheduling_system_uow_factory(
    sessionmaker: SessionmakerDep, settings: SettingsDep
) -> SchedulingUoWFactory:
    """UoW SYSTEME : lectures publiques (annuaire, dispos) et flux owner
    cross-cliniques. Les filtres explicites des repos sont la barriere."""

    def factory() -> SchedulingUnitOfWork:
        return SqlAlchemySchedulingUnitOfWork(sessionmaker, app_db_role=settings.app_db_role)

    return factory


def get_scheduling_tenant_uow_factory(
    sessionmaker: SessionmakerDep, settings: SettingsDep, current: CurrentUserDep
) -> SchedulingUoWFactory:
    """UoW TENANT figee sur la clinique du token staff (claim cid).

    Toute requete de la transaction est filtree par la policy RLS : une
    entite d'une autre clinique est INVISIBLE (404), et une ecriture hors
    tenant est refusee par le WITH CHECK.
    """
    tenant = TenantContext(clinic_id=current.clinic_id)

    def factory() -> SchedulingUnitOfWork:
        return SqlAlchemySchedulingUnitOfWork(
            sessionmaker, app_db_role=settings.app_db_role, tenant=tenant
        )

    return factory


def get_scheduling_make_tenant_uow(
    sessionmaker: SessionmakerDep, settings: SettingsDep
) -> SchedulingTenantUoWFactory:
    """Fabrique parametree : le booking owner cible la clinique de SA demande."""

    def make(clinic_id: uuid.UUID) -> SchedulingUnitOfWork:
        return SqlAlchemySchedulingUnitOfWork(
            sessionmaker,
            app_db_role=settings.app_db_role,
            tenant=TenantContext(clinic_id=clinic_id),
        )

    return make


TenantUoWFactoryDep = Annotated[SchedulingUoWFactory, Depends(get_scheduling_tenant_uow_factory)]
SystemUoWFactoryDep = Annotated[SchedulingUoWFactory, Depends(get_scheduling_system_uow_factory)]
MakeTenantUoWDep = Annotated[SchedulingTenantUoWFactory, Depends(get_scheduling_make_tenant_uow)]


# --- Providers des use cases (un par use case, gabarit identity) -----------


def get_list_appointment_types(uow_factory: TenantUoWFactoryDep) -> ListAppointmentTypes:
    return ListAppointmentTypes(uow_factory)


def get_create_appointment_type(
    uow_factory: TenantUoWFactoryDep, clock: ClockDep
) -> CreateAppointmentType:
    return CreateAppointmentType(uow_factory, clock)


def get_update_appointment_type(uow_factory: TenantUoWFactoryDep) -> UpdateAppointmentType:
    return UpdateAppointmentType(uow_factory)


def get_delete_appointment_type(
    uow_factory: TenantUoWFactoryDep, clock: ClockDep
) -> DeleteAppointmentType:
    return DeleteAppointmentType(uow_factory, clock)


def get_list_resources(uow_factory: TenantUoWFactoryDep) -> ListResources:
    return ListResources(uow_factory)


def get_create_resource(uow_factory: TenantUoWFactoryDep, clock: ClockDep) -> CreateResource:
    return CreateResource(uow_factory, clock)


def get_update_resource(uow_factory: TenantUoWFactoryDep) -> UpdateResource:
    return UpdateResource(uow_factory)


def get_delete_resource(uow_factory: TenantUoWFactoryDep, clock: ClockDep) -> DeleteResource:
    return DeleteResource(uow_factory, clock)


def get_get_resource_weekly_schedule(
    uow_factory: TenantUoWFactoryDep,
) -> GetResourceWeeklySchedule:
    return GetResourceWeeklySchedule(uow_factory)


def get_set_resource_weekly_schedule(
    uow_factory: TenantUoWFactoryDep, clock: ClockDep
) -> SetResourceWeeklySchedule:
    return SetResourceWeeklySchedule(uow_factory, clock)


def get_list_resource_exceptions(uow_factory: TenantUoWFactoryDep) -> ListResourceExceptions:
    return ListResourceExceptions(uow_factory)


def get_create_resource_exception(
    uow_factory: TenantUoWFactoryDep, clock: ClockDep
) -> CreateResourceException:
    return CreateResourceException(uow_factory, clock)


def get_delete_resource_exception(
    uow_factory: TenantUoWFactoryDep, clock: ClockDep
) -> DeleteResourceException:
    return DeleteResourceException(uow_factory, clock)


def get_get_agenda(uow_factory: TenantUoWFactoryDep) -> GetAgenda:
    return GetAgenda(uow_factory)


def get_create_appointment_by_staff(
    uow_factory: TenantUoWFactoryDep, clock: ClockDep
) -> CreateAppointmentByStaff:
    return CreateAppointmentByStaff(uow_factory, clock)


def get_confirm_appointment(
    uow_factory: TenantUoWFactoryDep, clock: ClockDep
) -> ConfirmAppointment:
    return ConfirmAppointment(uow_factory, clock)


def get_complete_appointment(uow_factory: TenantUoWFactoryDep) -> CompleteAppointment:
    return CompleteAppointment(uow_factory)


def get_cancel_appointment_by_staff(
    uow_factory: TenantUoWFactoryDep, clock: ClockDep
) -> CancelAppointmentByStaff:
    return CancelAppointmentByStaff(uow_factory, clock)


def get_list_clinic_appointment_types(
    uow_factory: SystemUoWFactoryDep,
) -> ListClinicAppointmentTypes:
    return ListClinicAppointmentTypes(uow_factory)


def get_public_availabilities(
    uow_factory: SystemUoWFactoryDep, clock: ClockDep
) -> GetPublicAvailabilities:
    return GetPublicAvailabilities(uow_factory, clock)


def get_book_appointment_by_owner(
    make_tenant_uow: MakeTenantUoWDep,
    system_uow_factory: SystemUoWFactoryDep,
    clock: ClockDep,
) -> BookAppointmentByOwner:
    return BookAppointmentByOwner(make_tenant_uow, system_uow_factory, clock)


def get_list_owner_appointments(uow_factory: SystemUoWFactoryDep) -> ListOwnerAppointments:
    return ListOwnerAppointments(uow_factory)


def get_cancel_appointment_by_owner(
    uow_factory: SystemUoWFactoryDep, clock: ClockDep
) -> CancelAppointmentByOwner:
    return CancelAppointmentByOwner(uow_factory, clock)
