"""Façade HTTP du contexte patients : routes /owner/pets + mapping erreurs.

Comme identity, le contexte expose exactement deux choses à main.py :
1. patients_router : le CRUD des animaux du propriétaire connecté (portail
   B2C). Toutes les routes déclarent CurrentOwnerDep : cookie owner exigé
   (401 sinon), et l'owner_id transmis aux use cases est TOUJOURS celui de
   la session -- jamais un id venu du client.
2. PATIENTS_ERROR_STATUS : la traduction des erreurs métier du contexte en
   statuts HTTP, fusionnée avec les autres mappings par main.py.

Le préfixe /owner/pets place ces routes dans l'espace PROPRIETAIRES (à côté
de /owner/auth et /owner/profile d'identity) : l'URL dit qui peut appeler.

Ordre de declaration : si un chemin litteral (type /owner/pets/stats) etait
ajoute un jour, il devrait etre declare AVANT /{pet_id}, sinon FastAPI
tenterait de lire "stats" comme un UUID.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status

from vetolib.patients.application.dto import CreatePetCommand, UpdatePetCommand
from vetolib.patients.application.use_cases import (
    CreatePet,
    DeletePet,
    GetMyPet,
    ListMyPets,
    UpdatePet,
)
from vetolib.patients.domain.errors import PetNotFoundError
from vetolib.patients.presentation.dependencies import (
    CurrentOwnerDep,
    get_create_pet,
    get_delete_pet,
    get_list_my_pets,
    get_my_pet,
    get_update_pet,
)
from vetolib.patients.presentation.schemas import (
    CreatePetRequest,
    PetResponse,
    UpdatePetRequest,
)
from vetolib.shared.domain.errors import DomainError

patients_router = APIRouter(prefix="/owner/pets", tags=["pets"])

# Statuts HTTP spécifiques au contexte (fusionnés avec les défauts et les
# autres contextes par main.py). PetNotFoundError couvre aussi l'animal d'un
# AUTRE propriétaire : 404 uniforme, sans révéler l'existence de la donnée.
# Les refus de validation du domaine (date de naissance future, race trop
# longue) levent DomainValidationError, deja mappee sur 422 par defaut :
# aucune entree a ajouter ici.
PATIENTS_ERROR_STATUS: dict[type[DomainError], int] = {
    PetNotFoundError: status.HTTP_404_NOT_FOUND,
}


@patients_router.get("", operation_id="listMyPets")
async def list_my_pets(
    current: CurrentOwnerDep,
    use_case: Annotated[ListMyPets, Depends(get_list_my_pets)],
) -> list[PetResponse]:
    """Les animaux vivants du propriétaire connecté (tri par nom)."""
    pets = await use_case.execute(current.id)
    return [PetResponse.from_dto(pet) for pet in pets]


@patients_router.post("", operation_id="createPet", status_code=status.HTTP_201_CREATED)
async def create_pet(
    body: CreatePetRequest,
    current: CurrentOwnerDep,
    use_case: Annotated[CreatePet, Depends(get_create_pet)],
) -> PetResponse:
    """Déclare un animal ; 201 avec la fiche créée (id généré côté domaine)."""
    created = await use_case.execute(
        CreatePetCommand(
            owner_id=current.id,
            name=body.name,
            species=body.species,
            birth_date=body.birth_date,
            sex=body.sex,
            breed=body.breed,
            sterilized=body.sterilized,
        )
    )
    return PetResponse.from_dto(created)


@patients_router.get("/{pet_id}", operation_id="getMyPet")
async def get_pet(
    pet_id: uuid.UUID,
    current: CurrentOwnerDep,
    use_case: Annotated[GetMyPet, Depends(get_my_pet)],
) -> PetResponse:
    """La fiche d'un animal, pour sa page de détail dans le portail.

    L'animal d'un autre propriétaire est introuvable par construction
    (get_for_owner filtre en SQL) -> 404, indistinguable d'un id inexistant.
    """
    pet = await use_case.execute(pet_id=pet_id, owner_id=current.id)
    return PetResponse.from_dto(pet)


@patients_router.put("/{pet_id}", operation_id="updatePet")
async def update_pet(
    pet_id: uuid.UUID,
    body: UpdatePetRequest,
    current: CurrentOwnerDep,
    use_case: Annotated[UpdatePet, Depends(get_update_pet)],
) -> PetResponse:
    """PUT : la fiche envoyee REMPLACE l'existante.

    Un champ facultatif omis vaut null, donc EFFACE la valeur precedente --
    c'est ce qui permet de vider une race saisie par erreur. Meme
    convention que PUT /owner/profile.

    L'animal d'un autre propriétaire est introuvable par construction
    (get_for_owner filtre en SQL) -> 404, indistinguable d'un id inexistant.
    """
    updated = await use_case.execute(
        UpdatePetCommand(
            pet_id=pet_id,
            owner_id=current.id,
            name=body.name,
            species=body.species,
            birth_date=body.birth_date,
            sex=body.sex,
            breed=body.breed,
            sterilized=body.sterilized,
        )
    )
    return PetResponse.from_dto(updated)


@patients_router.delete(
    "/{pet_id}", operation_id="deletePet", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_pet(
    pet_id: uuid.UUID,
    current: CurrentOwnerDep,
    use_case: Annotated[DeletePet, Depends(get_delete_pet)],
) -> None:
    """Suppression LOGIQUE (soft delete) ; 204 sans corps.

    La ligne survit en base (audit, futur historique médical) mais disparaît
    de listMyPets. Même barrière d'appartenance que le PUT : 404 si l'animal
    n'est pas à l'owner de la session.
    """
    await use_case.execute(pet_id=pet_id, owner_id=current.id)
