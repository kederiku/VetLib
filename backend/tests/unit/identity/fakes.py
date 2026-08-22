"""Doublures de test en mémoire pour les ports du contexte identity.

Principe des tests unitaires ici : les use cases (application/) ne dépendent
que de ports (Protocol) -- UoW, PasswordHasher, TokenProvider, Clock. On leur
injecte donc ces "fakes" : de vraies petites implémentations en mémoire, sans
IO, sans Docker, sans crypto. Les tests tournent en millisecondes et valident
la logique métier ; le comportement réel de PostgreSQL (RLS, index uniques,
SET LOCAL) est couvert à part par tests/integration sur testcontainers.

Fake plutôt que mock : un fake a un vrai comportement (le FakeUserRepository
stocke et retrouve réellement des users), le test lit donc l'état final au
lieu de vérifier des appels de méthodes -- moins fragile au refactoring.
Grâce au duck typing des Protocol, aucun héritage n'est nécessaire : il
suffit d'exposer les mêmes méthodes que le port.
"""

import uuid
from datetime import UTC, datetime, timedelta
from types import TracebackType
from typing import Self

from vetolib.identity.application.dto import (
    AccessClaims,
    OwnerAccessClaims,
    OwnerRefreshClaims,
    RefreshClaims,
    TokenPair,
)
from vetolib.identity.domain.clinic import Clinic
from vetolib.identity.domain.errors import InvalidTokenError
from vetolib.identity.domain.owner import Owner
from vetolib.identity.domain.user import User
from vetolib.identity.domain.value_objects import Email, Role
from vetolib.shared.domain.events import DomainEvent


class FakeClinicRepository:
    """Implémentation dict du port ClinicRepository (domain/repositories).

    Le dict est fourni par le FakeIdentityUnitOfWork, qui le garde accessible
    (clinic_store) pour que les tests inspectent l'état final directement.
    """

    def __init__(self, store: dict[uuid.UUID, Clinic]) -> None:
        self._store = store

    async def get_by_id(self, clinic_id: uuid.UUID) -> Clinic | None:
        return self._store.get(clinic_id)

    async def add(self, clinic: Clinic) -> None:
        self._store[clinic.id] = clinic

    async def exists_with_email(self, email: Email) -> bool:
        return any(c.email == email for c in self._store.values())

    async def update(self, clinic: Clinic) -> None:
        self._store[clinic.id] = clinic

    async def list_active(self, *, limit: int, offset: int) -> list[Clinic]:
        # Reproduit la requete reelle, DEUX filtres compris : lignes vivantes
        # (deleted_at) ET non suspendues (is_active). Un fake qui oublierait
        # le second validerait un annuaire public qui n'existe pas.
        # Le tri reprend aussi le departage par id du SQL, pour que la
        # pagination soit stable entre deux cliniques homonymes.
        alive = sorted(
            (c for c in self._store.values() if c.deleted_at is None and c.is_active),
            key=lambda c: (c.name, str(c.id)),
        )
        return alive[offset : offset + limit]


class FakeUserRepository:
    """Implémentation dict du port UserRepository.

    Reproduit fidèlement la sémantique soft delete du vrai repository
    SQLAlchemy : une ligne avec deleted_at renseigné existe toujours
    physiquement mais est invisible pour les lectures -- comme le filtre
    "deleted_at IS NULL" des requêtes SQL réelles.
    """

    def __init__(self, store: dict[uuid.UUID, User]) -> None:
        self._store = store

    async def get_by_id(self, user_id: uuid.UUID) -> User | None:
        # Filtre soft delete : un user "supprimé" reste stocké mais introuvable.
        user = self._store.get(user_id)
        return user if user is not None and user.deleted_at is None else None

    async def get_by_email(self, email: Email) -> User | None:
        for user in self._store.values():
            if user.email == email and user.deleted_at is None:
                return user
        return None

    async def add(self, user: User) -> None:
        self._store[user.id] = user

    async def update(self, user: User) -> None:
        self._store[user.id] = user


class FakeOwnerRepository:
    """Double de test du port OwnerRepository (dict en memoire).

    Memes conventions que FakeUserRepository : filtre soft delete, pas de
    commit (role du UoW).
    """

    def __init__(self, store: dict[uuid.UUID, Owner]) -> None:
        self._store = store

    async def get_by_id(self, owner_id: uuid.UUID) -> Owner | None:
        owner = self._store.get(owner_id)
        return owner if owner is not None and owner.deleted_at is None else None

    async def get_by_email(self, email: Email) -> Owner | None:
        for owner in self._store.values():
            if owner.email == email and owner.deleted_at is None:
                return owner
        return None

    async def add(self, owner: Owner) -> None:
        self._store[owner.id] = owner

    async def update(self, owner: Owner) -> None:
        self._store[owner.id] = owner


class FakeIdentityUnitOfWork:
    """UoW in-memory : implémente le port IdentityUnitOfWork sans IO.

    En production, le UoW ouvre une transaction PostgreSQL (system_uow ou
    tenant_uow avec SET LOCAL ROLE + app.clinic_id pour la RLS) et écrit les
    événements dans la table outbox_events. Ici, tout est remplacé par des
    structures Python : les compteurs commits/rollbacks et la liste events
    permettent aux tests de vérifier QUAND le use case commite et QUELS
    événements il destine à l'outbox, sans base de données.
    """

    def __init__(self) -> None:
        self.clinic_store: dict[uuid.UUID, Clinic] = {}
        self.user_store: dict[uuid.UUID, User] = {}
        self.owner_store: dict[uuid.UUID, Owner] = {}
        self.clinics = FakeClinicRepository(self.clinic_store)
        self.users = FakeUserRepository(self.user_store)
        self.owners = FakeOwnerRepository(self.owner_store)
        self.events: list[DomainEvent] = []
        self.commits = 0
        self.rollbacks = 0

    # Le vrai UoW est un context manager async (ouvre/ferme la session DB) :
    # on honore le contrat, mais entrer et sortir ne coûtent rien ici.
    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        return None

    async def commit(self) -> None:
        # Pas de transaction à valider : on compte l'appel, c'est l'assertion.
        self.commits += 1

    async def rollback(self) -> None:
        self.rollbacks += 1

    def add_event(self, event: DomainEvent) -> None:
        # Équivalent en mémoire de l'écriture dans outbox_events.
        self.events.append(event)


class FakeHasher:
    """Remplace l'adapter Argon2 (pwdlib) par un "hash" lisible : "h:<clair>".

    Argon2 est volontairement lent (des dizaines de ms) : inacceptable en
    test unitaire. Ce schéma trivial garde la propriété utile (verify ne
    réussit que pour le bon mot de passe) et rend les assertions lisibles.
    verify_calls joue le rôle d'espion : il enregistre chaque vérification,
    ce qui permet de prouver qu'un hash factice (dummy) est bien vérifié
    quand l'email est inconnu (défense anti-oracle temporel).
    """

    def __init__(self) -> None:
        self.verify_calls: list[tuple[str, str]] = []

    async def hash(self, plain: str) -> str:
        return f"h:{plain}"

    async def verify_and_update(self, plain: str, hashed: str) -> tuple[bool, str | None]:
        self.verify_calls.append((plain, hashed))
        # Second élément None : jamais de rehash à proposer dans les tests.
        return (hashed == f"h:{plain}", None)

    def dummy_hash(self) -> str:
        # Pendant du hash factice pré-calculé de l'adapter réel : vérifié
        # quand l'email est inconnu, pour un temps de réponse constant.
        return "h:dummy"


class FakeBreachChecker:
    """Double de test du port CompromisedPasswordChecker.

    Par defaut, AUCUN mot de passe n'est considere comme compromis : les
    tests d'inscription qui ne s'interessent pas a cette regle n'ont rien a
    configurer. Ceux qui la testent passent la liste voulue au constructeur.

    `calls` sert d'espion : il prouve que la verification a bien eu lieu, et
    surtout qu'elle n'est PAS payee inutilement (voir le test qui verifie
    qu'un mot de passe trop court est refuse sans appel reseau).
    """

    def __init__(self, compromised: set[str] | None = None) -> None:
        self.compromised = compromised or set()
        self.calls: list[str] = []

    async def is_compromised(self, password: str) -> bool:
        self.calls.append(password)
        return password in self.compromised


class FixedClock:
    """Horloge figée (port Clock) : le temps devient un paramètre du test.

    Les use cases ne font jamais datetime.now() eux-mêmes ; injecter une
    horloge fixe rend les timestamps (created_at, occurred_at) déterministes
    et donc vérifiables.
    """

    def __init__(self, at: datetime | None = None) -> None:
        self.at = at or datetime(2026, 1, 1, 9, 0, tzinfo=UTC)

    def now(self) -> datetime:
        return self.at


class FakeTokenProvider:
    """Remplace l'adapter PyJWT : tokens transparents "access:<user_id>".

    Aucune signature ni crypto : les tests des use cases valident QUAND un
    token est émis ou refusé, pas la solidité de JWT (testée ailleurs).
    Le format préfixé permet un decode trivial et des erreurs réalistes
    (InvalidTokenError) pour les tokens mal formés.
    """

    def issue_pair(self, user: User) -> TokenPair:
        now = datetime(2026, 1, 1, 9, 0, tzinfo=UTC)
        # Durées calquées sur la prod : access 15 min, refresh 7 jours.
        return TokenPair(
            access_token=f"access:{user.id}",
            refresh_token=f"refresh:{user.id}",
            access_expires_at=now + timedelta(minutes=15),
            refresh_expires_at=now + timedelta(days=7),
        )

    def decode_access(self, token: str) -> AccessClaims:
        if not token.startswith("access:"):
            raise InvalidTokenError("Jeton invalide.")
        user_id = uuid.UUID(token.removeprefix("access:"))
        return AccessClaims(
            user_id=user_id,
            clinic_id=uuid.uuid4(),
            role=Role.MANAGER,
            permissions=frozenset(),
            jti="fake-jti",
        )

    def decode_refresh(self, token: str) -> RefreshClaims:
        if not token.startswith("refresh:"):
            raise InvalidTokenError("Jeton invalide.")
        return RefreshClaims(user_id=uuid.UUID(token.removeprefix("refresh:")), jti="fake-jti")


class FakeOwnerTokenProvider:
    """Double de test du port OwnerTokenProvider.

    Tokens en clair prefixes ("owner_access:<id>") : les decode_* rejettent
    tout autre prefixe, ce qui mime naturellement le controle du claim
    `kind` — un token du FakeTokenProvider staff ("access:<id>") est refuse
    ici, comme en production. Le controle sur les VRAIS adapters PyJWT est
    couvert par test_owner_tokens.py.
    """

    def issue_pair(self, owner: Owner) -> TokenPair:
        now = datetime(2026, 1, 1, 9, 0, tzinfo=UTC)
        return TokenPair(
            access_token=f"owner_access:{owner.id}",
            refresh_token=f"owner_refresh:{owner.id}",
            access_expires_at=now + timedelta(minutes=15),
            refresh_expires_at=now + timedelta(days=7),
        )

    def decode_access(self, token: str) -> OwnerAccessClaims:
        if not token.startswith("owner_access:"):
            raise InvalidTokenError("Jeton invalide.")
        return OwnerAccessClaims(
            owner_id=uuid.UUID(token.removeprefix("owner_access:")), jti="fake-jti"
        )

    def decode_refresh(self, token: str) -> OwnerRefreshClaims:
        if not token.startswith("owner_refresh:"):
            raise InvalidTokenError("Jeton invalide.")
        return OwnerRefreshClaims(
            owner_id=uuid.UUID(token.removeprefix("owner_refresh:")), jti="fake-jti"
        )
