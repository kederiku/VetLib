"""Schémas Pydantic v2 du contexte patients : le contrat HTTP de /owner/pets.

Mêmes conventions que dans identity : xxxRequest validés par FastAPI en
entrée (422 automatique), xxxResponse filtrant la sortie, et alimentation de
l'OpenAPI dont Orval génère les hooks des frontends (`make generate-api`
après tout changement ici).

Aucun champ owner_id dans les schémas : le propriétaire est TOUJOURS celui
de la session (cookie), le contrat HTTP ne permet même pas d'en parler.
"""

import uuid

from pydantic import BaseModel, Field

from vetolib.patients.application.dto import PetDto
from vetolib.patients.domain.pet import Species


class PetResponse(BaseModel):
    """Fiche d'un animal (liste, création et édition)."""

    id: uuid.UUID
    name: str
    species: Species  # enum du domaine : sérialisé en chaîne, listé dans l'OpenAPI

    @classmethod
    def from_dto(cls, pet: PetDto) -> "PetResponse":
        """Convertit le DTO applicatif PetDto en schéma de réponse."""
        return cls(id=pet.id, name=pet.name, species=pet.species)


class CreatePetRequest(BaseModel):
    """Corps de POST /owner/pets : tous les champs de la fiche sont requis."""

    name: str = Field(min_length=1, max_length=100)
    # L'enum Species valide l'entrée : une espèce inconnue -> 422 Pydantic,
    # bien avant la contrainte CHECK de la base (défense en profondeur).
    species: Species


class UpdatePetRequest(BaseModel):
    """Corps de PATCH /owner/pets/x : édition PARTIELLE, tout est optionnel.

    None (ou champ absent) = inchangé -- la sémantique PATCH est portée
    jusqu'à l'entité (Pet.update n'écrase que le non-None). Un body vide est
    donc accepté et ne modifie rien.
    """

    name: str | None = Field(default=None, min_length=1, max_length=100)
    species: Species | None = None
