"""Ports (interfaces) de la couche application du contexte identity.

Un "port" est un contrat abstrait que la couche application impose vers
l'extérieur : les use cases ne dépendent que de ces interfaces, jamais
d'une bibliothèque concrète. Les implémentations réelles (adapters) vivent
en infrastructure : pwdlib/Argon2 pour PasswordHasher, PyJWT pour
TokenProvider, SQLAlchemy pour l'IdentityUnitOfWork.

C'est le coeur de l'architecture hexagonale : on peut tester les use cases
avec des fakes en mémoire et remplacer une techno sans toucher au métier.
`typing.Protocol` plutôt qu'ABC : le typage est structurel, un fake de
test satisfait le port dès qu'il expose les bonnes méthodes, sans hériter
de quoi que ce soit.
"""

from collections.abc import Callable
from typing import Protocol

from vetolib.identity.application.dto import AccessClaims, RefreshClaims, TokenPair
from vetolib.identity.domain.repositories import ClinicRepository, UserRepository
from vetolib.identity.domain.user import User
from vetolib.shared.application.uow import UnitOfWork


class PasswordHasher(Protocol):
    """Async : un hash/verify Argon2 coûte des dizaines de ms de CPU — il ne
    doit jamais s'exécuter sur l'event loop (l'adapter délègue au threadpool)."""

    async def hash(self, plain: str) -> str: ...

    async def verify_and_update(self, plain: str, hashed: str) -> tuple[bool, str | None]:
        """(mot de passe valide ?, nouveau hash si rehash nécessaire)."""
        ...

    def dummy_hash(self) -> str:
        """Hash factice pré-calculé : vérifié quand l'email est inconnu pour
        garder un temps de réponse constant (pas d'oracle temporel)."""
        ...


class TokenProvider(Protocol):
    """Émission et décodage des JWT (adapter concret : PyJWT en infra).

    issue_pair construit le "fat token" d'accès (clinic_id, rôle et
    permissions embarqués -> l'autorisation ne relit pas la base) et le
    refresh token minimal (user_id seul). Les decode_* valident signature,
    expiration ET type de jeton (un refresh ne passe jamais pour un access),
    et lèvent une erreur domaine (InvalidTokenError) en cas de problème.
    """

    def issue_pair(self, user: User) -> TokenPair: ...

    def decode_access(self, token: str) -> AccessClaims: ...

    def decode_refresh(self, token: str) -> RefreshClaims: ...


class IdentityUnitOfWork(UnitOfWork, Protocol):
    """UoW du contexte identity : une transaction + ses repositories.

    Étend le UnitOfWork partagé (commit/rollback + add_event vers l'outbox)
    en exposant les repositories du contexte. Tout ce qui passe par le même
    UoW est commité atomiquement : entités ET événements d'outbox ensemble.
    """

    # Properties (lecture seule) : covariantes — un attribut concret plus
    # spécifique (SqlAlchemyUserRepository, FakeUserRepository) satisfait le port.
    @property
    def users(self) -> UserRepository: ...

    @property
    def clinics(self) -> ClinicRepository: ...


# Les use cases reçoivent une FABRIQUE et non un UoW déjà ouvert : chaque
# execute() ouvre sa propre transaction via `async with`, courte et bien
# délimitée. Pour identity (login, register... flux pré-tenant), la DI
# injecte la fabrique system_uow ; les contextes tenantés utiliseront
# tenant_uow(clinic_id), qui active la RLS via SET LOCAL ROLE vetolib_app.
IdentityUoWFactory = Callable[[], IdentityUnitOfWork]
