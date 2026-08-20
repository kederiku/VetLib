"""Unit of Work concret du contexte scheduling.

Meme mecanique qu'identity : la classe de base partagee porte l'ouverture de
session, le mode tenant (SET LOCAL ROLE + app.clinic_id -> RLS active) et
l'ecriture des evenements outbox au commit. Ici on ajoute :
- les repositories du contexte + les readers cross-contexte, sur LA session ;
- la traduction de la contrainte EXCLUDE anti-chevauchement en erreur
  domaine (409), pendant exact de la traduction des collisions d'email.
"""

from typing import Self

from sqlalchemy.exc import IntegrityError

from vetolib.scheduling.domain.errors import SlotAlreadyBookedError
from vetolib.scheduling.infrastructure.repositories import (
    SqlAlchemyAppointmentRepository,
    SqlAlchemyAppointmentTypeRepository,
    SqlAlchemyClinicInfoReader,
    SqlAlchemyPetReader,
    SqlAlchemyResourceRepository,
    SqlAlchemyScheduleExceptionRepository,
    SqlAlchemyWeeklyScheduleRepository,
)
from vetolib.shared.infrastructure.db.uow import SqlAlchemyUnitOfWork

# Nom de la contrainte EXCLUDE posee par la migration 0004 : PostgreSQL est
# l'ARBITRE FINAL de la course entre deux reservations simultanees -- aucun
# SELECT prealable ne peut la remplacer (il y aurait toujours une fenetre).
_NO_OVERLAP_CONSTRAINT = "ex_appointments_no_overlap"


class SqlAlchemySchedulingUnitOfWork(SqlAlchemyUnitOfWork):
    """Implemente le port SchedulingUnitOfWork (repos + readers, meme session)."""

    resources: SqlAlchemyResourceRepository
    schedules: SqlAlchemyWeeklyScheduleRepository
    exceptions: SqlAlchemyScheduleExceptionRepository
    appointment_types: SqlAlchemyAppointmentTypeRepository
    appointments: SqlAlchemyAppointmentRepository
    clinic_info: SqlAlchemyClinicInfoReader
    pet_info: SqlAlchemyPetReader

    async def __aenter__(self) -> Self:
        await super().__aenter__()
        self.resources = SqlAlchemyResourceRepository(self.session)
        self.schedules = SqlAlchemyWeeklyScheduleRepository(self.session)
        self.exceptions = SqlAlchemyScheduleExceptionRepository(self.session)
        self.appointment_types = SqlAlchemyAppointmentTypeRepository(self.session)
        self.appointments = SqlAlchemyAppointmentRepository(self.session)
        self.clinic_info = SqlAlchemyClinicInfoReader(self.session)
        self.pet_info = SqlAlchemyPetReader(self.session)
        return self

    async def commit(self) -> None:
        """Commit avec traduction du chevauchement de creneaux en 409."""
        try:
            await super().commit()
        except IntegrityError as exc:
            await self.rollback()
            if _NO_OVERLAP_CONSTRAINT in str(exc):
                raise SlotAlreadyBookedError(
                    "Ce creneau vient d'etre reserve par quelqu'un d'autre."
                ) from exc
            raise
