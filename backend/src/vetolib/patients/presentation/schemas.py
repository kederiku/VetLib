"""Schémas Pydantic v2 du contexte patients : le contrat HTTP de /owner/pets.

Mêmes conventions que dans identity : xxxRequest validés par FastAPI en
entrée (422 automatique), xxxResponse filtrant la sortie, et alimentation de
l'OpenAPI dont Orval génère les hooks des frontends (`make generate-api`
après tout changement ici).

Aucun champ owner_id dans les schémas : le propriétaire est TOUJOURS celui
de la session (cookie), le contrat HTTP ne permet même pas d'en parler.

str_strip_whitespace : la validation porte sur les valeurs NORMALISEES,
jamais sur les valeurs brutes. Sans elle, {"name": "  "} passerait le
min_length=1 (deux caracteres) et stockerait un nom vide -- le meme piege
que le value object Address d'identity documente cote domaine.
"""

import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict, Field

from vetolib.patients.application.dto import PetDto
from vetolib.patients.domain.pet import Sex, Species


class PetResponse(BaseModel):
    """Fiche d'un animal (liste, lecture unitaire, création et édition)."""

    id: uuid.UUID
    name: str
    species: Species  # enum du domaine : sérialisé en chaîne, listé dans l'OpenAPI
    birth_date: date | None
    sex: Sex
    breed: str | None
    sterilized: bool | None

    @classmethod
    def from_dto(cls, pet: PetDto) -> "PetResponse":
        """Convertit le DTO applicatif PetDto en schéma de réponse."""
        return cls(
            id=pet.id,
            name=pet.name,
            species=pet.species,
            birth_date=pet.birth_date,
            sex=pet.sex,
            breed=pet.breed,
            sterilized=pet.sterilized,
        )


class CreatePetRequest(BaseModel):
    """Corps de POST /owner/pets : nom et espèce requis, le reste facultatif.

    Les champs de la fiche enrichie ont tous un défaut : un client qui
    n'envoie que {name, species} reste parfaitement valide. C'est ce qui rend
    l'enrichissement RETRO-COMPATIBLE.
    """

    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=100)
    # L'enum Species valide l'entrée : une espèce inconnue -> 422 Pydantic,
    # bien avant la contrainte CHECK de la base (défense en profondeur).
    species: Species
    birth_date: date | None = None
    sex: Sex = Sex.UNKNOWN
    breed: str | None = Field(default=None, max_length=100)
    sterilized: bool | None = None


class UpdatePetRequest(BaseModel):
    """Corps de PUT /owner/pets/x : REPRESENTATION COMPLETE de la fiche.

    Un champ facultatif OMIS vaut null, donc EFFACE la valeur existante.
    C'est volontaire, et c'est la seule facon d'effacer une race ou une date
    de naissance saisie par erreur.

    Pourquoi pas un PATCH partiel : il faudrait distinguer "absent" de
    "null", ce qu'OpenAPI ne sait pas exprimer -- le client genere par Orval
    produirait `breed?: string | null` sans moyen fiable de faire la
    difference. On aurait paye la complexite sans obtenir la garantie. Meme
    parti pris que PUT /owner/profile dans identity, et le formulaire du
    portail envoie de toute facon la fiche entiere.
    """

    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=100)
    species: Species
    birth_date: date | None = None
    sex: Sex = Sex.UNKNOWN
    breed: str | None = Field(default=None, max_length=100)
    sterilized: bool | None = None
