"""Use case : la fiche d'UN animal du propriétaire (GET /owner/pets/x).

Sert la page de fiche animal du portail. Même barrière que l'édition et la
suppression : get_for_owner(pet_id, owner_id du token) filtre EN SQL, donc
l'animal d'un autre propriétaire est introuvable par construction -- 404
uniforme, indistinguable d'un identifiant inexistant.

Le port PetRepository n'expose volontairement pas de get_by_id "nu" : cette
lecture unitaire n'a donc rien coûté en surface de risque.
"""

import uuid

from vetolib.patients.application.dto import PetDto
from vetolib.patients.application.mappers import to_pet_dto
from vetolib.patients.application.ports import PatientsUoWFactory
from vetolib.patients.domain.errors import PetNotFoundError


class GetMyPet:
    """Retourne la fiche de l'animal, ou lève PetNotFoundError."""

    def __init__(self, uow_factory: PatientsUoWFactory) -> None:
        self._uow_factory = uow_factory

    async def execute(self, *, pet_id: uuid.UUID, owner_id: uuid.UUID) -> PetDto:
        async with self._uow_factory() as uow:
            pet = await uow.pets.get_for_owner(pet_id, owner_id)
            if pet is None:
                raise PetNotFoundError("Animal introuvable.")
            return to_pet_dto(pet)
