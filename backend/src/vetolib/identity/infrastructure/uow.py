from typing import Self

from sqlalchemy.exc import IntegrityError

from vetolib.identity.domain.errors import EmailAlreadyExistsError
from vetolib.identity.infrastructure.repositories import (
    SqlAlchemyClinicRepository,
    SqlAlchemyUserRepository,
)
from vetolib.shared.infrastructure.db.uow import SqlAlchemyUnitOfWork

_EMAIL_UNIQUE_CONSTRAINTS = ("uq_users_email_active", "uq_clinics_email_active")


class SqlAlchemyIdentityUnitOfWork(SqlAlchemyUnitOfWork):
    """Implémente le port IdentityUnitOfWork (users + clinics sur la même session)."""

    users: SqlAlchemyUserRepository
    clinics: SqlAlchemyClinicRepository

    async def __aenter__(self) -> Self:
        await super().__aenter__()
        self.users = SqlAlchemyUserRepository(self.session)
        self.clinics = SqlAlchemyClinicRepository(self.session)
        return self

    async def commit(self) -> None:
        # Le contrôle applicatif d'unicité (SELECT) ne couvre pas deux requêtes
        # concurrentes : l'index unique partiel est l'arbitre final, on traduit
        # sa violation en erreur domaine (409) plutôt que de laisser fuiter
        # une IntegrityError (500).
        try:
            await super().commit()
        except IntegrityError as exc:
            await self.rollback()
            if any(name in str(exc) for name in _EMAIL_UNIQUE_CONSTRAINTS):
                raise EmailAlreadyExistsError("L'adresse email est déjà utilisée.") from exc
            raise
