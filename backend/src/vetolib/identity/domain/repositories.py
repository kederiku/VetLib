"""Ports repository du contexte identity (inversion de dépendance).

C'est le DOMAINE qui définit ces interfaces, et l'infrastructure qui les
implémente (repos SQLAlchemy 2.0 async) : le sens de la dépendance est
inversé, le coeur métier ne dépend jamais de la technique. Bénéfices :
- les use cases se testent avec des fakes en mémoire, sans base de données ;
- la persistance est remplaçable sans toucher au domaine ni aux use cases.

typing.Protocol = typage structurel : l'implémentation concrète n'a pas
besoin d'hériter de ces classes, il lui suffit d'exposer les mêmes méthodes
(mypy vérifie la conformité). Le domaine n'exporte ainsi aucune classe de
base technique vers l'infrastructure.

Aucune méthode delete : convention soft delete du projet (on renseigne
deleted_at, jamais de DELETE SQL). Méthodes async car les implémentations
réelles font des requêtes SQL non bloquantes (asyncpg).
"""

import uuid
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Protocol

from vetolib.identity.domain.admin_audit import AdminAuditEntry
from vetolib.identity.domain.clinic import Clinic
from vetolib.identity.domain.owner import Owner
from vetolib.identity.domain.platform_admin import PlatformAdmin
from vetolib.identity.domain.user import User
from vetolib.identity.domain.value_objects import AccountStatus, Email, Role
from vetolib.shared.domain.page import Page, SortDirection


class ClinicRepository(Protocol):
    """Port : les repositories ne commitent jamais (rôle du UnitOfWork).

    Chaque méthode s'exécute dans la transaction ouverte par le UoW ; c'est
    uow.commit() qui valide d'un bloc les entités ET les événements outbox.
    Retour `Clinic | None` plutôt qu'une exception : c'est le use case qui
    décide si l'absence est une erreur (ClinicNotFoundError) ou un cas normal.
    """

    async def get_by_id(self, clinic_id: uuid.UUID) -> Clinic | None: ...

    async def add(self, clinic: Clinic) -> None: ...

    # Test d'unicité pour l'inscription (use case RegisterClinic).
    async def exists_with_email(self, email: Email) -> bool: ...

    # Persiste les mutations d'une entité (update_profile) : les entités
    # domaine sont des dataclasses détachées de la session, il faut les
    # re-fusionner explicitement (merge) côté infrastructure.
    async def update(self, clinic: Clinic) -> None: ...

    # Annuaire public (portail B2C) : uniquement les cliniques vivantes,
    # triées par nom pour une pagination stable (limit/offset).
    async def list_active(self, *, limit: int, offset: int) -> list[Clinic]: ...


class UserRepository(Protocol):
    """Port d'accès aux utilisateurs ; implémenté en infrastructure.

    get_by_email sert au login : flux pré-tenant (UoW système), car on
    cherche l'utilisateur AVANT de connaître sa clinique, donc avant de
    pouvoir activer le filtre RLS. Le `None` éventuel est traduit par le use
    case en InvalidCredentialsError, sans révéler si le compte existe.
    """

    async def get_by_id(self, user_id: uuid.UUID) -> User | None: ...

    async def get_by_email(self, email: Email) -> User | None: ...

    async def add(self, user: User) -> None: ...

    # Persiste les mutations d'une entité (change_password, deactivate).
    # Nécessaire car les entités domaine sont de pures dataclasses détachées
    # de la session SQLAlchemy : rien ne trace leurs modifications, il faut
    # les re-fusionner explicitement (merge) côté infrastructure.
    async def update(self, user: User) -> None: ...


class OwnerRepository(Protocol):
    """Port d'accès aux propriétaires (comptes B2C globaux, hors tenant).

    Mêmes conventions que UserRepository : pas de commit, pas de delete
    (soft delete), None traduit par le use case. get_by_email ne cherche QUE
    dans owners : les espaces de comptes staff et owner sont indépendants.
    """

    async def get_by_id(self, owner_id: uuid.UUID) -> Owner | None: ...

    async def get_by_email(self, email: Email) -> Owner | None: ...

    async def add(self, owner: Owner) -> None: ...

    # Rehash transparent au login et mise à jour de la fiche (update_profile).
    async def update(self, owner: Owner) -> None: ...


class PlatformAdminRepository(Protocol):
    """Port d'acces aux comptes du back-office plateforme.

    Memes conventions que les deux autres espaces : pas de commit (role du
    UoW), pas de delete (soft delete), None traduit par l'appelant. La table
    etant hors RLS et hors des privileges du role applicatif, ces methodes ne
    s'executent QUE sous UoW systeme -- une transaction tenant echouerait sur
    un "permission denied" franc, ce qui est le comportement voulu.

    count_active sert un seul garde-fou, mais essentiel : refuser de
    desactiver le DERNIER administrateur actif, faute de quoi plus personne
    ne pourrait entrer dans le back-office (et aucune route ne permet d'en
    recreer un -- seule la commande locale le peut).
    """

    async def get_by_id(self, admin_id: uuid.UUID) -> PlatformAdmin | None: ...

    async def get_by_email(self, email: Email) -> PlatformAdmin | None: ...

    async def add(self, admin: PlatformAdmin) -> None: ...

    async def update(self, admin: PlatformAdmin) -> None: ...

    async def count_active(self) -> int: ...


# --- Criteres de recherche des listes du back-office ------------------------
#
# Chaque ressource declare DEUX choses : un StrEnum des colonnes triables et
# une dataclass de criteres. L'enum est une LISTE BLANCHE -- c'est ici, et
# nulle part ailleurs, que se decide ce sur quoi on peut trier. Le nom y est
# LOGIQUE (vocabulaire metier) ; la correspondance vers une colonne
# SQLAlchemy vit dans infrastructure/admin_repositories.py. Une valeur hors
# de l'enum est refusee par Pydantic (422) avant meme d'atteindre le use
# case : aucune chaine venue de l'utilisateur ne peut donc se retrouver dans
# un ORDER BY.
#
# Un objet de criteres plutot que sept parametres nommes : la signature du
# port reste lisible, et ajouter un filtre plus tard ne casse aucun appelant.
#
# Aucun de ces objets n'a de champ `include_deleted`. Par convention du
# projet, une ligne soft-deletee est invisible, point. La suspension passe
# par is_active, et aucun ecran demande ne montre de ligne supprimee :
# exposer le drapeau creerait une seconde lecture de toute la table pour un
# besoin inexistant.


class ClinicSortField(StrEnum):
    """Colonnes triables de la liste des cliniques."""

    NAME = "name"
    EMAIL = "email"
    CITY = "city"
    CREATED_AT = "created_at"


@dataclass(frozen=True, kw_only=True)
class ClinicSearchCriteria:
    """Criteres d'une page de la liste des cliniques."""

    search: str | None = None
    """Sous-chaine cherchee dans le nom, l'email et la ville."""

    status: AccountStatus | None = None
    """None = les deux statuts (voir AccountStatus)."""

    sort_by: ClinicSortField = ClinicSortField.NAME
    sort_dir: SortDirection = SortDirection.ASC
    limit: int = 20
    offset: int = 0


class OwnerSortField(StrEnum):
    """Colonnes triables de la liste des proprietaires."""

    LAST_NAME = "last_name"
    EMAIL = "email"
    CREATED_AT = "created_at"


@dataclass(frozen=True, kw_only=True)
class OwnerSearchCriteria:
    """Criteres d'une page de la liste des proprietaires."""

    search: str | None = None
    """Email, prenom, nom, et la concatenation "prenom nom" -- pour qu'on
    puisse taper "jean dupont" d'une traite, ce que fait tout le monde."""

    status: AccountStatus | None = None
    sort_by: OwnerSortField = OwnerSortField.LAST_NAME
    sort_dir: SortDirection = SortDirection.ASC
    limit: int = 20
    offset: int = 0


class StaffSortField(StrEnum):
    """Colonnes triables de la liste transverse du personnel."""

    LAST_NAME = "last_name"
    EMAIL = "email"
    ROLE = "role"
    CLINIC_NAME = "clinic_name"
    CREATED_AT = "created_at"


@dataclass(frozen=True, kw_only=True)
class StaffSearchCriteria:
    """Criteres d'une page de la liste du personnel, TOUTES cliniques confondues.

    `clinic_id` est un FILTRE facultatif, pas une cle d'isolation -- c'est
    toute la difference avec les repositories tenantes du contexte
    scheduling. La lecture est volontairement cross-tenant : voir la note de
    module d'infrastructure/admin_repositories.py.
    """

    search: str | None = None
    """Email, prenom, nom, concatenation, ET nom de la clinique : taper
    "Lilas" doit sortir le personnel de cette clinique."""

    status: AccountStatus | None = None
    role: Role | None = None
    clinic_id: uuid.UUID | None = None
    sort_by: StaffSortField = StaffSortField.LAST_NAME
    sort_dir: SortDirection = SortDirection.ASC
    limit: int = 20
    offset: int = 0


@dataclass(frozen=True, kw_only=True)
class StaffRow:
    """Ligne de la liste transverse du personnel : une PROJECTION de lecture.

    Ce n'est volontairement PAS l'entite User. L'ecran affiche le nom de la
    clinique, qui n'est pas un champ de User : resoudre ce nom par une
    requete par ligne serait un N+1, alors que la jointure ne coute rien en
    SQL. Une projection dediee dit aussi clairement que ces donnees sortent
    pour etre AFFICHEES, pas pour etre mutees.
    """

    id: uuid.UUID
    clinic_id: uuid.UUID
    clinic_name: str
    clinic_is_active: bool
    email: str
    first_name: str
    last_name: str
    role: Role
    is_active: bool
    created_at: datetime


@dataclass(frozen=True, kw_only=True)
class ClinicRow:
    """Ligne de la liste des cliniques : l'entite, plus son effectif.

    staff_count vient d'une sous-requete : il sert la colonne "Personnel" de
    la liste, mais surtout le dialogue de suspension, qui doit annoncer
    combien de personnes vont perdre leur acces. Un ecran qui dit "les 7
    membres du personnel seront deconnectes" fait reflechir ; un ecran qui
    dit "cette clinique sera suspendue" ne fait rien reflechir du tout.
    """

    clinic: Clinic
    staff_count: int


@dataclass(frozen=True, kw_only=True)
class OwnerRow:
    """Ligne de la liste des proprietaires : l'entite, plus son nombre d'animaux."""

    owner: Owner
    pet_count: int


@dataclass(frozen=True, kw_only=True)
class PlatformStats:
    """Compteurs du tableau de bord du back-office.

    Une seule requete cote infrastructure plutot que six appels : ces six
    nombres s'affichent ensemble, ils doivent etre coherents entre eux.
    """

    active_clinics: int
    suspended_clinics: int
    active_owners: int
    inactive_owners: int
    active_staff: int
    inactive_staff: int


class AdminDirectoryRepository(Protocol):
    """Port des lectures TRANSVERSES du back-office plateforme.

    Port distinct des trois repositories d'agregat, et pour une raison qui
    n'est pas cosmetique : ces methodes sont les SEULES du projet a lire
    volontairement a travers les tenants. Les isoler derriere une interface
    dediee, implementee dans un seul fichier, donne au relecteur un endroit
    unique a surveiller -- et rend visible qu'un use case tenant qui
    l'importerait serait une faute.

    Toutes renvoient une `Page` : une liste non bornee sur des donnees
    personnelles de tout le parc serait une fonction d'exfiltration.
    """

    async def search_clinics(self, criteria: ClinicSearchCriteria) -> Page[ClinicRow]: ...

    async def search_owners(self, criteria: OwnerSearchCriteria) -> Page[OwnerRow]: ...

    async def search_staff(self, criteria: StaffSearchCriteria) -> Page[StaffRow]: ...

    async def get_staff_row(self, user_id: uuid.UUID) -> StaffRow | None: ...

    async def count_active_staff(self, clinic_id: uuid.UUID) -> int:
        """Effectif ACTIF d'une clinique.

        Sert la fiche, mais surtout le dialogue de suspension : annoncer
        "les 7 membres du personnel seront deconnectes" fait reflechir, la ou
        "cette clinique sera suspendue" ne fait rien reflechir du tout.
        """
        ...

    async def count_active_managers(self, clinic_id: uuid.UUID) -> int:
        """Nombre de gerants ACTIFS d'une clinique.

        Sert un seul garde-fou, mais essentiel : retrograder ou desactiver le
        dernier gerant actif rendrait la clinique ingouvernable -- plus
        personne pour clinic:manage, donc ni fiche ni reglages d'agenda.
        """
        ...

    async def platform_stats(self) -> PlatformStats: ...


class AdminAuditLogRepository(Protocol):
    """Port du journal d'audit : APPEND-ONLY, par l'interface.

    Ni update, ni delete, et ce n'est pas un oubli : une ligne d'audit ne se
    corrige pas. Si un fait enregistre est faux, c'est un second fait qu'on
    ajoute, pas le premier qu'on efface.
    """

    async def add(self, entry: AdminAuditEntry) -> None: ...

    async def list_for_target(
        self, *, target_type: str, target_id: uuid.UUID, limit: int
    ) -> list[AdminAuditEntry]: ...
