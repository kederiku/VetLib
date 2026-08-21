"""Use case : remplacement de la fiche d'un animal (PUT /owner/pets/x).

Sécurité par construction : le chargement passe par get_for_owner(pet_id,
owner_id du token) -- l'animal d'un autre propriétaire est introuvable EN
SQL, donc PetNotFoundError (404), indistinguable d'un animal inexistant.

Le use case a besoin d'une horloge parce que la validation de la date de
naissance ("pas dans le futur") vit dans le domaine, qui n'a pas le droit
d'appeler datetime.now() : `now` lui est injecté, comme pour CreatePet et
DeletePet.
"""

from vetolib.patients.application.dto import PetDto, UpdatePetCommand
from vetolib.patients.application.mappers import to_pet_dto
from vetolib.patients.application.ports import PatientsUoWFactory
from vetolib.patients.domain.errors import PetNotFoundError
from vetolib.shared.application.clock import Clock


class UpdatePet:
    """Écrit la fiche reçue sur l'animal du propriétaire, puis la retourne."""

    def __init__(self, uow_factory: PatientsUoWFactory, clock: Clock) -> None:
        self._uow_factory = uow_factory
        self._clock = clock

    async def execute(self, cmd: UpdatePetCommand) -> PetDto:
        async with self._uow_factory() as uow:
            pet = await uow.pets.get_for_owner(cmd.pet_id, cmd.owner_id)
            if pet is None:
                raise PetNotFoundError("Animal introuvable.")

            # REMPLACEMENT complet, pas fusion : un champ omis par le client
            # est arrive ici a None et EFFACE la valeur existante. C'est ce
            # qui permet de vider une race saisie par erreur.
            pet.update_profile(
                name=cmd.name,
                species=cmd.species,
                birth_date=cmd.birth_date,
                sex=cmd.sex,
                breed=cmd.breed,
                sterilized=cmd.sterilized,
                now=self._clock.now(),
            )
            await uow.pets.update(pet)
            await uow.commit()
            return to_pet_dto(pet)
