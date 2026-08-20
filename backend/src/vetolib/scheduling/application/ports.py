"""Ports de la couche application du contexte scheduling.

Piece maitresse du chantier "UoW tenant" : le SchedulingUnitOfWork expose
les repositories du contexte SUR UNE MEME transaction, et deux fabriques
distinctes matérialisent les deux modes d'acces :

- SchedulingUoWFactory : UoW deja configuree (tenant fige depuis le token
  staff, OU systeme pour les lectures publiques) ;
- SchedulingTenantUoWFactory : fabrique PARAMETREE par clinic_id -- le
  booking d'un proprietaire cible la clinique choisie dans sa demande, pas
  un tenant issu d'un token staff.

Les readers cross-contexte (ClinicInfoReader, PetReader) sont des ports de
LECTURE SEULE vers des tables d'autres contextes (identity.clinics,
patients.pets -- toutes deux globales, GRANT SELECT en place) : les couches
domaine et application de scheduling n'importent jamais leurs modeles.
"""

import uuid
from collections.abc import Callable
from datetime import datetime
from typing import Protocol

from vetolib.scheduling.application.availability import BusyPeriod
from vetolib.scheduling.application.dto import (
    AgendaEntry,
    ClinicInfo,
    OwnerAppointmentView,
    PetInfo,
)
from vetolib.scheduling.domain.repositories import (
    AppointmentRepository,
    AppointmentTypeRepository,
    ResourceRepository,
    ScheduleExceptionRepository,
    WeeklyScheduleRepository,
)
from vetolib.shared.application.uow import UnitOfWork


class AppointmentRepositoryWithQueries(AppointmentRepository, Protocol):
    """Port domaine + requetes de LECTURE enrichies (read models).

    Ces methodes vivent ici (application) et non dans le domaine car leurs
    DTOs (AgendaEntry...) y vivent : le domaine n'a pas a connaitre les
    besoins d'affichage des ecrans.
    """

    async def list_agenda(
        self, *, starts_at: datetime, ends_at: datetime, resource_id: uuid.UUID | None
    ) -> list[AgendaEntry]: ...

    # Sous UoW SYSTEME : le filtre owner_id est LA barriere (documente dans
    # domain/repositories.py). Jointures clinics/types/resources/pets.
    async def list_for_owner(self, owner_id: uuid.UUID) -> list[OwnerAppointmentView]: ...

    async def list_busy_between(
        self,
        clinic_id: uuid.UUID,
        resource_ids: list[uuid.UUID],
        starts_at: datetime,
        ends_at: datetime,
    ) -> list[BusyPeriod]: ...


class ClinicInfoReader(Protocol):
    async def get_info(self, clinic_id: uuid.UUID) -> ClinicInfo | None: ...


class PetReader(Protocol):
    # Filtre (pet_id, owner_id) EN SQL : verification d'appartenance.
    async def get_owned(self, pet_id: uuid.UUID, owner_id: uuid.UUID) -> PetInfo | None: ...


class OwnerReader(Protocol):
    # Existence d'un compte proprietaire (table globale identity.owners).
    # Sans cette verification, un owner_id inconnu fourni par le staff
    # violerait la FK au commit -> IntegrityError non traduite -> 500.
    async def exists(self, owner_id: uuid.UUID) -> bool: ...


class StaffUserReader(Protocol):
    # Existence d'un compte staff, SOUS LA TRANSACTION COURANTE : appele
    # sous UoW tenant, le SELECT sur users est filtre par la RLS -> un user
    # d'une AUTRE clinique est invisible, le lien resource.user_id ne peut
    # jamais pointer hors du tenant (et un id inconnu -> 404, pas 500).
    async def exists(self, user_id: uuid.UUID) -> bool: ...


class SchedulingUnitOfWork(UnitOfWork, Protocol):
    @property
    def resources(self) -> ResourceRepository: ...

    @property
    def schedules(self) -> WeeklyScheduleRepository: ...

    @property
    def exceptions(self) -> ScheduleExceptionRepository: ...

    @property
    def appointment_types(self) -> AppointmentTypeRepository: ...

    @property
    def appointments(self) -> AppointmentRepositoryWithQueries: ...

    @property
    def clinic_info(self) -> ClinicInfoReader: ...

    @property
    def pet_info(self) -> PetReader: ...

    @property
    def owner_info(self) -> OwnerReader: ...

    @property
    def staff_info(self) -> StaffUserReader: ...


SchedulingUoWFactory = Callable[[], SchedulingUnitOfWork]
SchedulingTenantUoWFactory = Callable[[uuid.UUID], SchedulingUnitOfWork]
