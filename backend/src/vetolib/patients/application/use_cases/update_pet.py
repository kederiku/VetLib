"""Use case : édition partielle de la fiche d'un animal (PATCH /owner/pets/x).

Sécurité par construction : le chargement passe par get_for_owner(pet_id,
owner_id du token) -- l'animal d'un autre propriétaire est introuvable EN
SQL, donc PetNotFoundError (404), indistinguable d'un animal inexistant.
"""

from vetolib.patients.application.dto import PetDto, UpdatePetCommand
from vetolib.patients.application.mappers import to_pet_dto
from vetolib.patients.application.ports import PatientsUoWFactory
from vetolib.patients.domain.errors import PetNotFoundError


class UpdatePet:
    """Applique les champs fournis (non-None) à l'animal, puis le retourne."""

    def __init__(self, uow_factory: PatientsUoWFactory) -> None:
        self._uow_factory = uow_factory

    async def execute(self, cmd: UpdatePetCommand) -> PetDto:
        async with self._uow_factory() as uow:
            pet = await uow.pets.get_for_owner(cmd.pet_id, cmd.owner_id)
            if pet is None:
                raise PetNotFoundError("Animal introuvable.")

            # Sémantique PATCH portée par l'entité : seuls les champs non-None
            # sont écrasés (Pet.update).
            pet.update(name=cmd.name, species=cmd.species)
            await uow.pets.update(pet)
            await uow.commit()
            return to_pet_dto(pet)
