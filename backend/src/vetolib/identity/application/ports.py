from collections.abc import Callable
from typing import Protocol

from vetolib.identity.application.dto import AccessClaims, RefreshClaims, TokenPair
from vetolib.identity.domain.repositories import ClinicRepository, UserRepository
from vetolib.identity.domain.user import User
from vetolib.shared.application.uow import UnitOfWork


class PasswordHasher(Protocol):
    def hash(self, plain: str) -> str: ...

    def verify_and_update(self, plain: str, hashed: str) -> tuple[bool, str | None]:
        """(mot de passe valide ?, nouveau hash si rehash nécessaire)."""
        ...

    def dummy_hash(self) -> str:
        """Hash factice pré-calculé : vérifié quand l'email est inconnu pour
        garder un temps de réponse constant (pas d'oracle temporel)."""
        ...


class TokenProvider(Protocol):
    def issue_pair(self, user: User) -> TokenPair: ...

    def decode_access(self, token: str) -> AccessClaims: ...

    def decode_refresh(self, token: str) -> RefreshClaims: ...


class IdentityUnitOfWork(UnitOfWork, Protocol):
    # Properties (lecture seule) : covariantes — un attribut concret plus
    # spécifique (SqlAlchemyUserRepository, FakeUserRepository) satisfait le port.
    @property
    def users(self) -> UserRepository: ...

    @property
    def clinics(self) -> ClinicRepository: ...


IdentityUoWFactory = Callable[[], IdentityUnitOfWork]
