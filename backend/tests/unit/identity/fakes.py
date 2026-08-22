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

import unicodedata
import uuid
from collections.abc import Callable, Sequence
from datetime import UTC, datetime, timedelta
from types import TracebackType
from typing import Self

from vetolib.identity.application.dto import (
    AccessClaims,
    OwnerAccessClaims,
    OwnerRefreshClaims,
    PlatformAdminAccessClaims,
    PlatformAdminRefreshClaims,
    RefreshClaims,
    TokenPair,
)
from vetolib.identity.domain.admin_audit import AdminAuditEntry
from vetolib.identity.domain.clinic import Clinic
from vetolib.identity.domain.errors import InvalidTokenError
from vetolib.identity.domain.owner import Owner
from vetolib.identity.domain.platform_admin import PlatformAdmin
from vetolib.identity.domain.repositories import (
    ClinicRow,
    ClinicSearchCriteria,
    ClinicSortField,
    OwnerRow,
    OwnerSearchCriteria,
    OwnerSortField,
    PlatformStats,
    StaffRow,
    StaffSearchCriteria,
    StaffSortField,
)
from vetolib.identity.domain.user import User
from vetolib.identity.domain.value_objects import AccountStatus, Email, Role
from vetolib.shared.domain.events import DomainEvent
from vetolib.shared.domain.page import Page, SortDirection


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


class FakePlatformAdminRepository:
    """Double de test du port PlatformAdminRepository (dict en memoire).

    Memes conventions que les deux autres : filtre soft delete a la lecture,
    pas de commit. count_active reproduit le double filtre du SQL reel
    (deleted_at IS NULL ET is_active) -- un fake qui compterait toutes les
    lignes ferait passer le garde-fou "dernier administrateur" pour bon
    alors qu'il serait faux.
    """

    def __init__(self, store: dict[uuid.UUID, PlatformAdmin]) -> None:
        self._store = store

    async def get_by_id(self, admin_id: uuid.UUID) -> PlatformAdmin | None:
        admin = self._store.get(admin_id)
        return admin if admin is not None and admin.deleted_at is None else None

    async def get_by_email(self, email: Email) -> PlatformAdmin | None:
        for admin in self._store.values():
            if admin.email == email and admin.deleted_at is None:
                return admin
        return None

    async def add(self, admin: PlatformAdmin) -> None:
        self._store[admin.id] = admin

    async def update(self, admin: PlatformAdmin) -> None:
        self._store[admin.id] = admin

    async def count_active(self) -> int:
        return sum(1 for a in self._store.values() if a.deleted_at is None and a.is_active)


def _sans_accent(valeur: str) -> str:
    """Normalise comme le fait lower(unaccent(...)) cote PostgreSQL.

    NFD decompose "é" en "e" + accent combinant, que l'on retire ensuite.
    Sans cette normalisation, le fake trouverait "Veterinaire" mais pas
    "Vétérinaire" -- et les tests valideraient une recherche qui n'est pas
    celle de la production.
    """
    decompose = unicodedata.normalize("NFD", valeur.casefold())
    return "".join(c for c in decompose if not unicodedata.combining(c))


def _correspond(terme: str, *champs: str | None) -> bool:
    """Sous-chaine insensible a la casse et aux accents, dans l'un des champs.

    La comparaison par sous-chaine Python reproduit fidelement le SQL une
    fois les jokers echappes : un terme contenant "%" ou "_" y est traite
    litteralement, exactement comme cote base grace a _echapper_like.
    """
    aiguille = _sans_accent(terme)
    return any(aiguille in _sans_accent(champ) for champ in champs if champ is not None)


def _statut_correspond(actif: bool, statut: AccountStatus | None) -> bool:
    """None = les deux statuts (voir AccountStatus)."""
    return statut is None or actif == (statut is AccountStatus.ACTIVE)


def _trancher[T](
    lignes: list[T], criteres: ClinicSearchCriteria | OwnerSearchCriteria | StaffSearchCriteria
) -> Page[T]:
    """Calcule le total AVANT le tranchage, puis rend la page.

    C'EST LE PIEGE de ce fake, et il est classique : un double naif
    renverrait total=len(page). Les tests de pagination passeraient tous, en
    validant un comportement qui n'existe pas -- le "x sur N" de l'ecran
    afficherait alors le nombre de lignes visibles au lieu du total.
    """
    return Page(
        items=lignes[criteres.offset : criteres.offset + criteres.limit],
        total=len(lignes),
        limit=criteres.limit,
        offset=criteres.offset,
    )


class FakeAdminDirectoryRepository:
    """Double de test des lectures transverses du back-office.

    Reproduit fidelement la semantique du SQL reel : filtre soft delete,
    filtre de statut, recherche insensible casse/accents, tri avec departage
    par identifiant, et total calcule avant tranchage. Un fake approximatif
    ferait passer des tests sur un comportement fictif -- ce qui est pire que
    pas de test du tout.
    """

    def __init__(
        self,
        clinics: dict[uuid.UUID, Clinic],
        users: dict[uuid.UUID, User],
        owners: dict[uuid.UUID, Owner],
        pet_counts: dict[uuid.UUID, int],
    ) -> None:
        self._clinics = clinics
        self._users = users
        self._owners = owners
        self._pet_counts = pet_counts

    def _effectif(self, clinic_id: uuid.UUID) -> int:
        return sum(
            1
            for u in self._users.values()
            if u.clinic_id == clinic_id and u.deleted_at is None and u.is_active
        )

    async def search_clinics(self, criteria: ClinicSearchCriteria) -> Page[ClinicRow]:
        retenues = [
            c
            for c in self._clinics.values()
            if c.deleted_at is None
            and _statut_correspond(c.is_active, criteria.status)
            and (
                not criteria.search
                or _correspond(
                    criteria.search,
                    c.name,
                    c.email.value,
                    c.address.city if c.address is not None else None,
                )
            )
        ]
        cles: dict[ClinicSortField, Callable[[Clinic], object]] = {
            ClinicSortField.NAME: lambda c: c.name,
            ClinicSortField.EMAIL: lambda c: c.email.value,
            ClinicSortField.CITY: lambda c: c.address.city if c.address else "",
            ClinicSortField.CREATED_AT: lambda c: c.created_at,
        }
        retenues.sort(
            key=lambda c: (cles[criteria.sort_by](c), str(c.id)),
            reverse=criteria.sort_dir is SortDirection.DESC,
        )
        lignes = [ClinicRow(clinic=c, staff_count=self._effectif(c.id)) for c in retenues]
        return _trancher(lignes, criteria)

    async def search_owners(self, criteria: OwnerSearchCriteria) -> Page[OwnerRow]:
        retenus = [
            o
            for o in self._owners.values()
            if o.deleted_at is None
            and _statut_correspond(o.is_active, criteria.status)
            and (
                not criteria.search
                or _correspond(
                    criteria.search,
                    o.email.value,
                    o.first_name,
                    o.last_name,
                    f"{o.first_name} {o.last_name}",
                )
            )
        ]
        cles: dict[OwnerSortField, Callable[[Owner], object]] = {
            OwnerSortField.LAST_NAME: lambda o: o.last_name,
            OwnerSortField.EMAIL: lambda o: o.email.value,
            OwnerSortField.CREATED_AT: lambda o: o.created_at,
        }
        retenus.sort(
            key=lambda o: (cles[criteria.sort_by](o), str(o.id)),
            reverse=criteria.sort_dir is SortDirection.DESC,
        )
        lignes = [OwnerRow(owner=o, pet_count=self._pet_counts.get(o.id, 0)) for o in retenus]
        return _trancher(lignes, criteria)

    def _ligne_personnel(self, user: User) -> StaffRow | None:
        clinique = self._clinics.get(user.clinic_id)
        if clinique is None or clinique.deleted_at is not None:
            return None
        return StaffRow(
            id=user.id,
            clinic_id=user.clinic_id,
            clinic_name=clinique.name,
            clinic_is_active=clinique.is_active,
            email=user.email.value,
            first_name=user.first_name,
            last_name=user.last_name,
            role=user.role,
            is_active=user.is_active,
            created_at=user.created_at,
        )

    async def search_staff(self, criteria: StaffSearchCriteria) -> Page[StaffRow]:
        lignes: list[StaffRow] = []
        for user in self._users.values():
            if user.deleted_at is not None:
                continue
            ligne = self._ligne_personnel(user)
            if ligne is None:
                continue
            if not _statut_correspond(ligne.is_active, criteria.status):
                continue
            if criteria.role is not None and ligne.role is not criteria.role:
                continue
            if criteria.clinic_id is not None and ligne.clinic_id != criteria.clinic_id:
                continue
            if criteria.search and not _correspond(
                criteria.search,
                ligne.email,
                ligne.first_name,
                ligne.last_name,
                f"{ligne.first_name} {ligne.last_name}",
                ligne.clinic_name,
            ):
                continue
            lignes.append(ligne)

        cles: dict[StaffSortField, Callable[[StaffRow], object]] = {
            StaffSortField.LAST_NAME: lambda r: r.last_name,
            StaffSortField.EMAIL: lambda r: r.email,
            StaffSortField.ROLE: lambda r: r.role.value,
            StaffSortField.CLINIC_NAME: lambda r: r.clinic_name,
            StaffSortField.CREATED_AT: lambda r: r.created_at,
        }
        lignes.sort(
            key=lambda r: (cles[criteria.sort_by](r), str(r.id)),
            reverse=criteria.sort_dir is SortDirection.DESC,
        )
        return _trancher(lignes, criteria)

    async def get_staff_row(self, user_id: uuid.UUID) -> StaffRow | None:
        user = self._users.get(user_id)
        if user is None or user.deleted_at is not None:
            return None
        return self._ligne_personnel(user)

    async def count_active_staff(self, clinic_id: uuid.UUID) -> int:
        return self._effectif(clinic_id)

    async def count_active_managers(self, clinic_id: uuid.UUID) -> int:
        return sum(
            1
            for u in self._users.values()
            if u.clinic_id == clinic_id
            and u.deleted_at is None
            and u.is_active
            and u.role is Role.MANAGER
        )

    async def platform_stats(self) -> PlatformStats:
        cliniques = [c for c in self._clinics.values() if c.deleted_at is None]
        proprietaires = [o for o in self._owners.values() if o.deleted_at is None]
        personnel = [u for u in self._users.values() if u.deleted_at is None]
        return PlatformStats(
            active_clinics=sum(1 for c in cliniques if c.is_active),
            suspended_clinics=sum(1 for c in cliniques if not c.is_active),
            active_owners=sum(1 for o in proprietaires if o.is_active),
            inactive_owners=sum(1 for o in proprietaires if not o.is_active),
            active_staff=sum(1 for u in personnel if u.is_active),
            inactive_staff=sum(1 for u in personnel if not u.is_active),
        )


class FakeAdminAuditLogRepository:
    """Double de test du journal d'audit : une liste, exposee aux assertions."""

    def __init__(self, entries: list[AdminAuditEntry]) -> None:
        self.entries = entries

    async def add(self, entry: AdminAuditEntry) -> None:
        self.entries.append(entry)

    async def list_for_target(
        self, *, target_type: str, target_id: uuid.UUID, limit: int
    ) -> list[AdminAuditEntry]:
        retenues = [
            e
            for e in self.entries
            if e.target_type.value == target_type and e.target_id == target_id
        ]
        retenues.sort(key=lambda e: (e.occurred_at, str(e.id)), reverse=True)
        return retenues[:limit]


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
        self.admin_store: dict[uuid.UUID, PlatformAdmin] = {}
        # Nombre d'animaux par proprietaire : la table pets appartient au
        # contexte patients, ce fake n'en a pas besoin autrement.
        self.pet_counts: dict[uuid.UUID, int] = {}
        self.audit_entries: list[AdminAuditEntry] = []
        self.clinics = FakeClinicRepository(self.clinic_store)
        self.users = FakeUserRepository(self.user_store)
        self.owners = FakeOwnerRepository(self.owner_store)
        self.admins = FakePlatformAdminRepository(self.admin_store)
        self.directory = FakeAdminDirectoryRepository(
            self.clinic_store, self.user_store, self.owner_store, self.pet_counts
        )
        self.audit_log = FakeAdminAuditLogRepository(self.audit_entries)
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


class FakePlatformAdminTokenProvider:
    """Double de test du port PlatformAdminTokenProvider.

    Jetons en clair prefixes ("admin_access:<id>") : les decode_* rejettent
    tout autre prefixe, ce qui mime structurellement le controle du claim
    `kind` -- un jeton du fake staff ("access:<id>") ou owner
    ("owner_access:<id>") est refuse ici, comme en production. Le controle
    sur les VRAIS adapters PyJWT est couvert par test_admin_tokens.py.
    """

    def issue_pair(self, admin: PlatformAdmin) -> TokenPair:
        now = datetime(2026, 1, 1, 9, 0, tzinfo=UTC)
        # Durees calquees sur la prod : access 15 min, refresh 12 h (TTL
        # dedie a l'espace plateforme, plus court que les 7 jours des autres).
        return TokenPair(
            access_token=f"admin_access:{admin.id}",
            refresh_token=f"admin_refresh:{admin.id}",
            access_expires_at=now + timedelta(minutes=15),
            refresh_expires_at=now + timedelta(hours=12),
        )

    def decode_access(self, token: str) -> PlatformAdminAccessClaims:
        if not token.startswith("admin_access:"):
            raise InvalidTokenError("Jeton invalide.")
        return PlatformAdminAccessClaims(
            admin_id=uuid.UUID(token.removeprefix("admin_access:")), jti="fake-jti"
        )

    def decode_refresh(self, token: str) -> PlatformAdminRefreshClaims:
        if not token.startswith("admin_refresh:"):
            raise InvalidTokenError("Jeton invalide.")
        return PlatformAdminRefreshClaims(
            admin_id=uuid.UUID(token.removeprefix("admin_refresh:")), jti="fake-jti"
        )


class FakeLoginThrottle:
    """Double de test du port LoginThrottle : compteur en memoire.

    Par defaut il ne bloque jamais (`blocage` a None) : les tests de login
    qui ne s'interessent pas a la limitation n'ont rien a configurer. Ceux
    qui la testent posent `blocage` et lisent `failures` / `resets`, qui
    servent d'espions.
    """

    def __init__(self, blocage: int | None = None) -> None:
        self.blocage = blocage
        self.failures: list[tuple[str, ...]] = []
        self.resets: list[tuple[str, ...]] = []

    async def seconds_until_retry(self, keys: Sequence[str]) -> int | None:
        return self.blocage

    async def record_failure(self, keys: Sequence[str]) -> None:
        self.failures.append(tuple(keys))

    async def reset(self, keys: Sequence[str]) -> None:
        self.resets.append(tuple(keys))
