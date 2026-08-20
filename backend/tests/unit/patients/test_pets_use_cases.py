"""Tests unitaires des use cases du contexte patients (CRUD des animaux).

Fakes en mémoire uniquement : on valide la logique métier (création, PATCH
partiel, soft delete) et surtout la BARRIERE D'APPARTENANCE -- l'animal d'un
autre propriétaire est introuvable par construction (get_for_owner filtre),
donc PetNotFoundError (404), sans révéler son existence.
"""

import uuid

import pytest

from tests.unit.identity.fakes import FixedClock
from tests.unit.patients.fakes import FakePatientsUnitOfWork
from vetolib.patients.application.dto import CreatePetCommand, UpdatePetCommand
from vetolib.patients.application.use_cases import CreatePet, DeletePet, ListMyPets, UpdatePet
from vetolib.patients.domain.errors import PetNotFoundError
from vetolib.patients.domain.pet import Species

OWNER_A = uuid.UUID("00000000-0000-0000-0000-00000000000a")
OWNER_B = uuid.UUID("00000000-0000-0000-0000-00000000000b")


def _create_command(
    owner_id: uuid.UUID = OWNER_A, name: str = "Rex", species: Species = Species.DOG
) -> CreatePetCommand:
    return CreatePetCommand(owner_id=owner_id, name=name, species=species)


async def test_create_pet_cree_l_animal_pour_l_owner_du_token() -> None:
    """Chemin heureux : l'animal est créé, horodaté par l'horloge injectée."""
    # Arrange
    uow = FakePatientsUnitOfWork()
    clock = FixedClock()

    # Act
    created = await CreatePet(lambda: uow, clock).execute(_create_command())

    # Assert : fiche retournée ET état persisté cohérents.
    assert created.name == "Rex"
    assert created.species is Species.DOG
    pet = uow.pet_store[created.id]
    assert pet.owner_id == OWNER_A
    assert pet.created_at == clock.at
    assert pet.deleted_at is None
    assert uow.commits == 1
    # Pas d'effet de bord asynchrone pour cette tranche : outbox vide.
    assert uow.events == []


async def test_update_pet_patch_partiel_n_ecrase_que_le_non_none() -> None:
    """Sémantique PATCH : species change, name (None = absent) est conservé."""
    uow = FakePatientsUnitOfWork()
    created = await CreatePet(lambda: uow, FixedClock()).execute(_create_command())

    updated = await UpdatePet(lambda: uow).execute(
        UpdatePetCommand(pet_id=created.id, owner_id=OWNER_A, name=None, species=Species.CAT)
    )

    assert updated.name == "Rex"  # inchangé : non fourni dans le PATCH
    assert updated.species is Species.CAT
    assert uow.pet_store[created.id].species is Species.CAT


async def test_update_du_pet_d_un_autre_owner_est_introuvable() -> None:
    """SECURITE : owner B tente de modifier l'animal de A -> PetNotFoundError.

    get_for_owner(pet_id, OWNER_B) renvoie None (le filtre d'appartenance
    est dans l'API du port) : indistinguable d'un animal inexistant, et
    l'animal de A reste intact.
    """
    uow = FakePatientsUnitOfWork()
    created = await CreatePet(lambda: uow, FixedClock()).execute(_create_command())

    with pytest.raises(PetNotFoundError):
        await UpdatePet(lambda: uow).execute(
            UpdatePetCommand(pet_id=created.id, owner_id=OWNER_B, name="Pirate", species=None)
        )

    assert uow.pet_store[created.id].name == "Rex"  # intact
    assert uow.commits == 1  # seul le create a commité


async def test_delete_du_pet_d_un_autre_owner_est_introuvable() -> None:
    """SECURITE : owner B tente de supprimer l'animal de A -> PetNotFoundError."""
    uow = FakePatientsUnitOfWork()
    created = await CreatePet(lambda: uow, FixedClock()).execute(_create_command())

    with pytest.raises(PetNotFoundError):
        await DeletePet(lambda: uow, FixedClock()).execute(pet_id=created.id, owner_id=OWNER_B)

    assert uow.pet_store[created.id].deleted_at is None  # toujours vivant


async def test_delete_soft_masque_l_animal_des_listes() -> None:
    """Soft delete : deleted_at posé, la ligne survit mais sort de la liste."""
    uow = FakePatientsUnitOfWork()
    clock = FixedClock()
    kept = await CreatePet(lambda: uow, clock).execute(_create_command(name="Alba"))
    removed = await CreatePet(lambda: uow, clock).execute(_create_command(name="Rex"))

    await DeletePet(lambda: uow, clock).execute(pet_id=removed.id, owner_id=OWNER_A)

    # La ligne existe toujours (jamais de DELETE physique)...
    assert uow.pet_store[removed.id].deleted_at == clock.at
    # ... mais listMyPets ne voit plus que l'animal restant.
    pets = await ListMyPets(lambda: uow).execute(OWNER_A)
    assert [pet.id for pet in pets] == [kept.id]

    # Un second delete du même animal : introuvable (déjà soft-deleted).
    with pytest.raises(PetNotFoundError):
        await DeletePet(lambda: uow, clock).execute(pet_id=removed.id, owner_id=OWNER_A)


async def test_list_my_pets_est_bornee_a_l_owner_et_triee_par_nom() -> None:
    """Chaque owner ne voit que SES animaux, dans un ordre stable (nom)."""
    uow = FakePatientsUnitOfWork()
    clock = FixedClock()
    create = CreatePet(lambda: uow, clock)
    await create.execute(_create_command(name="Rex"))
    await create.execute(_create_command(name="Alba", species=Species.CAT))
    await create.execute(_create_command(owner_id=OWNER_B, name="Kiwi", species=Species.NAC))

    pets_a = await ListMyPets(lambda: uow).execute(OWNER_A)
    pets_b = await ListMyPets(lambda: uow).execute(OWNER_B)

    assert [pet.name for pet in pets_a] == ["Alba", "Rex"]
    assert [pet.name for pet in pets_b] == ["Kiwi"]
