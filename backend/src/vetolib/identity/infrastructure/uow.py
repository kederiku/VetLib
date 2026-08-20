from typing import Self

from vetolib.identity.infrastructure.repositories import (
    SqlAlchemyClinicRepository,
    SqlAlchemyUserRepository,
)
from vetolib.shared.infrastructure.db.uow import SqlAlchemyUnitOfWork


class SqlAlchemyIdentityUnitOfWork(SqlAlchemyUnitOfWork):
    """Implémente le port IdentityUnitOfWork (users + clinics sur la même session)."""

    users: SqlAlchemyUserRepository
    clinics: SqlAlchemyClinicRepository

    async def __aenter__(self) -> Self:
        await super().__aenter__()
        self.users = SqlAlchemyUserRepository(self.session)
        self.clinics = SqlAlchemyClinicRepository(self.session)
        return self
