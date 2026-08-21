"""Use case : déclaration d'un animal par son propriétaire (POST /owner/pets).

L'owner_id de la commande vient TOUJOURS du token : impossible de créer un
animal au nom d'un autre propriétaire. Pas de contrôle d'existence de
l'owner ici : la session l'a déjà rechargé en base (CurrentOwnerDep), et la
FK pets.owner_id arbitre le cas limite (compte supprimé entre deux requêtes).
"""

from vetolib.patients.application.dto import CreatePetCommand, PetDto
from vetolib.patients.application.mappers import to_pet_dto
from vetolib.patients.application.ports import PatientsUoWFactory
from vetolib.patients.domain.pet import Pet
from vetolib.shared.application.clock import Clock


class CreatePet:
    """Crée l'animal et retourne sa fiche."""

    def __init__(self, uow_factory: PatientsUoWFactory, clock: Clock) -> None:
        self._uow_factory = uow_factory
        self._clock = clock

    async def execute(self, cmd: CreatePetCommand) -> PetDto:
        # `now` injecté via le port Clock : le domaine reste déterministe et
        # testable avec une horloge figée (même convention qu'identity).
        pet = Pet.create(
            owner_id=cmd.owner_id,
            name=cmd.name,
            species=cmd.species,
            birth_date=cmd.birth_date,
            sex=cmd.sex,
            breed=cmd.breed,
            sterilized=cmd.sterilized,
            now=self._clock.now(),
        )
        async with self._uow_factory() as uow:
            await uow.pets.add(pet)
            await uow.commit()
            return to_pet_dto(pet)
