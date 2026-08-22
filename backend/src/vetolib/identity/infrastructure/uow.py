"""Unit of Work concret du contexte identity.

Le UoW matérialise "une transaction = un use case" : tout ce qu'un use
case écrit (clinique + manager + événement outbox lors du register, par
exemple) part dans le MÊME commit, ou est annulé d'un bloc au rollback.

La classe de base partagée (shared/infrastructure/db/uow.py) porte toute
la mécanique : ouverture/fermeture de session, mode système vs tenant
(SET LOCAL ROLE vetolib_app + app.clinic_id pour activer la RLS), et
écriture des événements domaine dans la table outbox_events au commit.
Ici on ne fait qu'ajouter les repositories propres au contexte identity
et la traduction des violations d'unicité en erreur domaine.
"""

from typing import Self

from sqlalchemy.exc import IntegrityError

from vetolib.identity.domain.errors import EmailAlreadyExistsError
from vetolib.identity.infrastructure.admin_repositories import (
    SqlAlchemyAdminAuditLogRepository,
    SqlAlchemyAdminDirectoryRepository,
)
from vetolib.identity.infrastructure.repositories import (
    SqlAlchemyClinicRepository,
    SqlAlchemyOwnerRepository,
    SqlAlchemyPlatformAdminRepository,
    SqlAlchemyUserRepository,
)
from vetolib.shared.infrastructure.db.uow import SqlAlchemyUnitOfWork

# Noms des index uniques partiels (voir models.py) qu'on reconnaît dans le
# message d'erreur PostgreSQL pour distinguer "email déjà pris" des autres
# violations d'intégrité.
_EMAIL_UNIQUE_CONSTRAINTS = (
    "uq_users_email_active",
    "uq_clinics_email_active",
    "uq_owners_email_active",
    "uq_platform_admins_email_active",
)


class SqlAlchemyIdentityUnitOfWork(SqlAlchemyUnitOfWork):
    """Implémente le port IdentityUnitOfWork (users + clinics sur la même session)."""

    users: SqlAlchemyUserRepository
    clinics: SqlAlchemyClinicRepository
    owners: SqlAlchemyOwnerRepository
    admins: SqlAlchemyPlatformAdminRepository
    directory: SqlAlchemyAdminDirectoryRepository
    audit_log: SqlAlchemyAdminAuditLogRepository

    async def __aenter__(self) -> Self:
        # Le parent ouvre la session (et pose rôle + clinic_id en mode
        # tenant) ; on instancie ensuite les repositories SUR CETTE MÊME
        # session : leurs écritures rejoignent la même transaction.
        await super().__aenter__()
        self.users = SqlAlchemyUserRepository(self.session)
        self.clinics = SqlAlchemyClinicRepository(self.session)
        self.owners = SqlAlchemyOwnerRepository(self.session)
        # Utilisable UNIQUEMENT en mode systeme : le role applicatif n'a
        # aucun droit sur platform_admins (REVOKE de la migration 0008).
        self.admins = SqlAlchemyPlatformAdminRepository(self.session)
        # Comme admins : reserves au mode systeme. Le role applicatif n'a
        # aucun droit sur admin_audit_log, et les lectures transverses
        # seraient de toute facon filtrees par la RLS sous un role tenant.
        self.directory = SqlAlchemyAdminDirectoryRepository(self.session)
        self.audit_log = SqlAlchemyAdminAuditLogRepository(self.session)
        return self

    async def commit(self) -> None:
        """Commit avec traduction des collisions d'email en erreur domaine."""
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
