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

from collections.abc import Callable, Sequence
from typing import Protocol

from vetolib.identity.application.dto import (
    AccessClaims,
    OwnerAccessClaims,
    OwnerRefreshClaims,
    PlatformAdminAccessClaims,
    PlatformAdminRefreshClaims,
    RefreshClaims,
    TokenPair,
)
from vetolib.identity.domain.owner import Owner
from vetolib.identity.domain.platform_admin import PlatformAdmin
from vetolib.identity.domain.repositories import (
    ClinicRepository,
    OwnerRepository,
    PlatformAdminRepository,
    UserRepository,
)
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


class CompromisedPasswordChecker(Protocol):
    """Confronte un mot de passe à un corpus de secrets déjà compromis.

    Pourquoi un PORT et non une fonction du domaine : la vérification est une
    ENTREE/SORTIE (appel à l'API Have I Been Pwned, ou lecture d'une liste
    embarquée). Le domaine, lui, doit rester pur et synchrone -- il ne porte
    donc que la longueur minimale (value object PlainPassword). Les deux
    moitiés de la politique NIST SP 800-63B se répartissent ainsi : la forme
    dans le domaine, la compromission derrière ce port.

    Contrat : ne lève JAMAIS pour une raison technique. Un adapter
    injoignable doit se rabattre sur une source dégradée et répondre quand
    même -- une panne réseau ne peut pas empêcher quelqu'un de s'inscrire.
    """

    async def is_compromised(self, password: str) -> bool: ...


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


class OwnerTokenProvider(Protocol):
    """Émission et décodage des JWT PROPRIÉTAIRES (adapter : PyJWT en infra).

    Port distinct de TokenProvider (et non des méthodes en plus) : le typage
    rend impossible d'injecter le provider staff dans un use case owner. Les
    jetons portent un claim `kind` vérifié au décodage — un token staff n'est
    JAMAIS accepté ici, et réciproquement (cloisonnement B2B / B2C).
    """

    def issue_pair(self, owner: Owner) -> TokenPair: ...

    def decode_access(self, token: str) -> OwnerAccessClaims: ...

    def decode_refresh(self, token: str) -> OwnerRefreshClaims: ...


class PlatformAdminTokenProvider(Protocol):
    """Émission et décodage des JWT SUPER-ADMIN (adapter : PyJWT en infra).

    Troisième port distinct, et non un provider paramétrable par `kind` : le
    typage doit rendre IMPOSSIBLE d'injecter le provider staff dans un use
    case admin. Une classe unique capable d'émettre pour n'importe quel
    espace transformerait une erreur de câblage en escalade de privilèges ;
    ici, elle reste une erreur mypy.
    """

    def issue_pair(self, admin: PlatformAdmin) -> TokenPair: ...

    def decode_access(self, token: str) -> PlatformAdminAccessClaims: ...

    def decode_refresh(self, token: str) -> PlatformAdminRefreshClaims: ...


class LoginThrottle(Protocol):
    """Limitation de débit des tentatives de connexion (adapter : Redis).

    Pourquoi un port de la couche application alors que c'est de la
    plomberie : la POLITIQUE (combien d'échecs, pendant combien de temps)
    est une décision, pas un détail technique -- et on veut pouvoir la
    tester sans Redis.

    Contrat, calqué sur celui de CompromisedPasswordChecker : un adapter
    injoignable NE LÈVE JAMAIS. Refuser toutes les connexions parce que
    Redis est tombé transformerait une panne d'un service auxiliaire en
    panne totale du back-office ; l'adapter se contente alors de journaliser
    et de laisser passer (fail-open assumé, et écrit noir sur blanc).
    """

    async def seconds_until_retry(self, keys: Sequence[str]) -> int | None:
        """Délai d'attente restant en secondes, ou None si la voie est libre."""
        ...

    async def record_failure(self, keys: Sequence[str]) -> None:
        """Compte une tentative infructueuse."""
        ...

    async def reset(self, keys: Sequence[str]) -> None:
        """Efface les compteurs après une connexion réussie."""
        ...


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

    # owners est global (hors tenant) mais reste dans le contexte identity :
    # même session, même outbox, même traduction des erreurs d'intégrité.
    # Toujours atteint via la UoW système (les flux owner sont pré-tenant).
    @property
    def owners(self) -> OwnerRepository: ...

    # admins : les comptes du back-office plateforme. Hors tenant, hors RLS
    # et hors des privilèges du rôle applicatif -- donc atteignable
    # uniquement sous UoW système, comme les deux autres flux d'authentification.
    @property
    def admins(self) -> PlatformAdminRepository: ...


# Les use cases reçoivent une FABRIQUE et non un UoW déjà ouvert : chaque
# execute() ouvre sa propre transaction via `async with`, courte et bien
# délimitée. Pour identity (login, register... flux pré-tenant), la DI
# injecte la fabrique system_uow ; les contextes tenantés utiliseront
# tenant_uow(clinic_id), qui active la RLS via SET LOCAL ROLE vetolib_app.
IdentityUoWFactory = Callable[[], IdentityUnitOfWork]
