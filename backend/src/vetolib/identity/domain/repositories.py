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
from typing import Protocol

from vetolib.identity.domain.clinic import Clinic
from vetolib.identity.domain.owner import Owner
from vetolib.identity.domain.user import User
from vetolib.identity.domain.value_objects import Email


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
