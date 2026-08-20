"""Ports repository du contexte patients (inversion de dépendance).

Comme dans identity : le DOMAINE définit ces interfaces (typing.Protocol,
typage structurel), l'infrastructure les implémente en SQLAlchemy, et les
tests unitaires les remplacent par des fakes en mémoire.

Choix de sécurité central de ce port : il n'existe PAS de get_by_id "nu".
La table pets est globale (pas de clinic_id, donc pas de RLS pour rattraper
un oubli applicatif) : la seule barrière entre les animaux de deux
propriétaires est le filtre owner_id. En l'imposant dans la SIGNATURE
(get_for_owner, list_for_owner), l'API du port rend impossible d'écrire un
use case qui charge l'animal d'un autre owner -- l'oubli du filtre ne peut
pas compiler, au lieu d'être un bug silencieux. Le filtre s'exécute EN SQL
(WHERE owner_id = ...), jamais en Python après un chargement trop large.

Aucune méthode delete : convention soft delete du projet (Pet.soft_delete
pose deleted_at, persisté via update).
"""

import uuid
from typing import Protocol

from vetolib.patients.domain.pet import Pet


class PetRepository(Protocol):
    """Port d'accès aux animaux ; toutes les lectures sont bornées à UN owner.

    Mêmes conventions que les ports d'identity : pas de commit (rôle du
    UnitOfWork), filtre deleted_at IS NULL systématique, `None` traduit par
    le use case (PetNotFoundError -> 404).
    """

    # Les animaux vivants d'un propriétaire (écran "mes animaux" du B2C).
    async def list_for_owner(self, owner_id: uuid.UUID) -> list[Pet]: ...

    # Chargement UNITAIRE, toujours sous condition d'appartenance : renvoie
    # None si l'animal n'existe pas, est soft-deleted, OU appartient à un
    # autre owner -- trois cas indistinguables, par construction.
    async def get_for_owner(self, pet_id: uuid.UUID, owner_id: uuid.UUID) -> Pet | None: ...

    async def add(self, pet: Pet) -> None: ...

    # Persiste les mutations d'une entité (update, soft_delete) : les
    # entités domaine sont des dataclasses détachées de la session, il faut
    # les re-fusionner explicitement (merge) côté infrastructure.
    async def update(self, pet: Pet) -> None: ...
