"""Doublures de test en mémoire pour les ports du contexte patients.

Mêmes principes que tests/unit/identity/fakes.py : de vrais petits
comportements (le FakePetRepository stocke et filtre réellement), pas des
mocks -- les tests lisent l'état final au lieu de vérifier des appels. Le
comportement réel de PostgreSQL (FK, CHECK, GRANT) est couvert à part par
tests/integration sur testcontainers.
"""

import uuid
from types import TracebackType
from typing import Self

from vetolib.patients.domain.pet import Pet
from vetolib.shared.domain.events import DomainEvent


class FakePetRepository:
    """Implémentation dict du port PetRepository.

    Reproduit fidèlement les DEUX filtres du vrai repository SQL : le soft
    delete (deleted_at IS NULL) et surtout l'APPARTENANCE (WHERE owner_id) --
    c'est elle que les tests de sécurité exercent : l'animal d'un autre
    owner est introuvable, par construction de l'API du port.
    """

    def __init__(self, store: dict[uuid.UUID, Pet]) -> None:
        self._store = store

    async def list_for_owner(self, owner_id: uuid.UUID) -> list[Pet]:
        pets = [
            pet
            for pet in self._store.values()
            if pet.owner_id == owner_id and pet.deleted_at is None
        ]
        # Tri par nom, comme la requête réelle (liste stable).
        return sorted(pets, key=lambda pet: pet.name)

    async def get_for_owner(self, pet_id: uuid.UUID, owner_id: uuid.UUID) -> Pet | None:
        pet = self._store.get(pet_id)
        if pet is None or pet.owner_id != owner_id or pet.deleted_at is not None:
            return None
        return pet

    async def add(self, pet: Pet) -> None:
        self._store[pet.id] = pet

    async def update(self, pet: Pet) -> None:
        self._store[pet.id] = pet


class FakePatientsUnitOfWork:
    """UoW in-memory : implémente le port PatientsUnitOfWork sans IO.

    Compteurs commits/rollbacks et liste events : les tests vérifient QUAND
    le use case commite (et qu'il ne destine rien à l'outbox pour cette
    tranche), sans base de données.
    """

    def __init__(self) -> None:
        self.pet_store: dict[uuid.UUID, Pet] = {}
        self.pets = FakePetRepository(self.pet_store)
        self.events: list[DomainEvent] = []
        self.commits = 0
        self.rollbacks = 0

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
        self.commits += 1

    async def rollback(self) -> None:
        self.rollbacks += 1

    def add_event(self, event: DomainEvent) -> None:
        self.events.append(event)
