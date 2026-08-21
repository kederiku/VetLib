"""Mappers domaine -> DTO du contexte patients (couche application).

Même rôle que dans identity : traduire les entités du domaine en projections
exposables, pour que la couche presentation ne manipule jamais les entités
directement.
"""

from vetolib.patients.application.dto import PetDto
from vetolib.patients.domain.pet import Pet


def to_pet_dto(pet: Pet) -> PetDto:
    """Projette un Pet en PetDto (fiche exposable).

    owner_id ne traverse volontairement pas : le client connaît déjà SON
    identité (c'est celle de sa session), la republier n'apporterait rien.
    """
    return PetDto(
        id=pet.id,
        name=pet.name,
        species=pet.species,
        birth_date=pet.birth_date,
        sex=pet.sex,
        breed=pet.breed,
        sterilized=pet.sterilized,
    )
