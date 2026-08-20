"""Ports repository du contexte scheduling (inversion de dependance).

Memes conventions qu'identity : le domaine definit les interfaces,
l'infrastructure les implemente, les use cases se testent avec des fakes.
Pas de commit dans les repos (role du UnitOfWork), pas de delete physique.

Convention importante, documentee une fois pour toutes :
- les methodes SANS clinic_id (list_all, get_by_id...) servent les flux
  STAFF sous UoW TENANT -- la RLS PostgreSQL filtre les lignes cote
  serveur, le repo n'a rien a faire ;
- les methodes *_for_clinic portent un clinic_id EXPLICITE : elles servent
  les lectures PUBLIQUES sous UoW SYSTEME (pas de session tenant pour un
  anonyme, et le role proprietaire du pool bypasse la RLS) -- la, le filtre
  applicatif est LA barriere. Sous UoW tenant, ce meme filtre serait
  redondant avec la RLS : defense en profondeur, jamais un risque.
"""

import uuid
from datetime import datetime
from typing import Protocol

from vetolib.scheduling.domain.appointment import Appointment
from vetolib.scheduling.domain.appointment_type import AppointmentType
from vetolib.scheduling.domain.resource import Resource
from vetolib.scheduling.domain.schedule_exception import ScheduleException
from vetolib.scheduling.domain.weekly_schedule import WeeklySchedule


class ResourceRepository(Protocol):
    async def get_by_id(self, resource_id: uuid.UUID) -> Resource | None: ...

    async def list_all(self) -> list[Resource]: ...

    async def list_active_for_clinic(self, clinic_id: uuid.UUID) -> list[Resource]: ...

    async def add(self, resource: Resource) -> None: ...

    async def update(self, resource: Resource) -> None: ...


class WeeklyScheduleRepository(Protocol):
    async def list_for_resource(self, resource_id: uuid.UUID) -> list[WeeklySchedule]: ...

    async def list_for_clinic_resources(
        self, clinic_id: uuid.UUID, resource_ids: list[uuid.UUID]
    ) -> list[WeeklySchedule]: ...

    # Remplacement complet de la semaine type : soft delete des lignes
    # vivantes puis insertion des nouvelles, dans LA transaction du UoW.
    async def replace_for_resource(
        self, resource_id: uuid.UUID, items: list[WeeklySchedule], now: datetime
    ) -> None: ...


class ScheduleExceptionRepository(Protocol):
    async def get_by_id(self, exception_id: uuid.UUID) -> ScheduleException | None: ...

    async def list_for_resource(self, resource_id: uuid.UUID) -> list[ScheduleException]: ...

    async def list_overlapping(
        self,
        clinic_id: uuid.UUID,
        resource_ids: list[uuid.UUID],
        starts_at: datetime,
        ends_at: datetime,
    ) -> list[ScheduleException]: ...

    async def add(self, exception: ScheduleException) -> None: ...

    async def update(self, exception: ScheduleException) -> None: ...


class AppointmentTypeRepository(Protocol):
    async def get_by_id(self, appointment_type_id: uuid.UUID) -> AppointmentType | None: ...

    async def list_all(self) -> list[AppointmentType]: ...

    async def get_active_for_clinic(
        self, clinic_id: uuid.UUID, appointment_type_id: uuid.UUID
    ) -> AppointmentType | None: ...

    async def list_active_for_clinic(self, clinic_id: uuid.UUID) -> list[AppointmentType]: ...

    async def add(self, appointment_type: AppointmentType) -> None: ...

    async def update(self, appointment_type: AppointmentType) -> None: ...


class AppointmentRepository(Protocol):
    """Port entite pur ; les requetes de lecture enrichies (agenda, vues
    proprietaire avec jointures) vivent dans le port etendu de la couche
    application (AppointmentRepositoryWithQueries) car leurs DTOs y vivent."""

    async def get_by_id(self, appointment_id: uuid.UUID) -> Appointment | None: ...

    # Filtre owner_id EN SQL : impossible par construction de charger le
    # rendez-vous d'un autre proprietaire (meme principe que PetRepository).
    async def get_for_owner(
        self, appointment_id: uuid.UUID, owner_id: uuid.UUID
    ) -> Appointment | None: ...

    async def add(self, appointment: Appointment) -> None: ...

    async def update(self, appointment: Appointment) -> None: ...
