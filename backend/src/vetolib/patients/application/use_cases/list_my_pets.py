"""Use case : les animaux du propriétaire connecté (GET /owner/pets).

L'owner_id vient TOUJOURS du token (CurrentOwnerDep) : la liste est bornée
au propriétaire de la session par l'API même du port (list_for_owner). Les
animaux soft-deleted sont filtrés par le repository (deleted_at IS NULL).
"""

import uuid

from vetolib.patients.application.dto import PetDto
from vetolib.patients.application.mappers import to_pet_dto
from vetolib.patients.application.ports import PatientsUoWFactory


class ListMyPets:
    """Liste les animaux vivants de l'owner de la session."""

    def __init__(self, uow_factory: PatientsUoWFactory) -> None:
        self._uow_factory = uow_factory

    async def execute(self, owner_id: uuid.UUID) -> list[PetDto]:
        async with self._uow_factory() as uow:
            pets = await uow.pets.list_for_owner(owner_id)
            return [to_pet_dto(pet) for pet in pets]
