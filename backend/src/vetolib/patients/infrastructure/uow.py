"""Unit of Work concret du contexte patients.

La classe de base partagée (shared/infrastructure/db/uow.py) porte toute la
mécanique (session, commit/rollback, outbox) ; on ne fait qu'y brancher le
repository du contexte, comme SqlAlchemyIdentityUnitOfWork.

Toujours instancié SANS TenantContext (UoW système) : la table pets est
globale (rattachée à un owner, hors tenant), il n'existe pas de clinic_id à
donner à la RLS -- voir patients/application/ports.py pour le détail.
"""

from typing import Self

from vetolib.patients.infrastructure.repositories import SqlAlchemyPetRepository
from vetolib.shared.infrastructure.db.uow import SqlAlchemyUnitOfWork


class SqlAlchemyPatientsUnitOfWork(SqlAlchemyUnitOfWork):
    """Implémente le port PatientsUnitOfWork (repository pets sur la session)."""

    pets: SqlAlchemyPetRepository

    async def __aenter__(self) -> Self:
        # Le parent ouvre la session ; on instancie le repository SUR CETTE
        # MEME session : ses écritures rejoignent la même transaction.
        await super().__aenter__()
        self.pets = SqlAlchemyPetRepository(self.session)
        return self
