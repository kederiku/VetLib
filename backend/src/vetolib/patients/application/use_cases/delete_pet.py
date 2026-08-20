"""Use case : suppression LOGIQUE d'un animal (DELETE /owner/pets/x -> 204).

"Suppression" au sens du projet : soft delete (deleted_at posé, jamais de
DELETE SQL) -- l'animal disparaît des listes mais sa ligne survit pour
l'audit et le futur historique médical. Même barrière d'appartenance
qu'UpdatePet : get_for_owner avec l'owner_id du token, sinon 404.
"""

import uuid

from vetolib.patients.application.ports import PatientsUoWFactory
from vetolib.patients.domain.errors import PetNotFoundError
from vetolib.shared.application.clock import Clock


class DeletePet:
    """Pose deleted_at sur l'animal du propriétaire de la session."""

    def __init__(self, uow_factory: PatientsUoWFactory, clock: Clock) -> None:
        self._uow_factory = uow_factory
        self._clock = clock

    async def execute(self, *, pet_id: uuid.UUID, owner_id: uuid.UUID) -> None:
        async with self._uow_factory() as uow:
            pet = await uow.pets.get_for_owner(pet_id, owner_id)
            if pet is None:
                # Déjà supprimé, inexistant ou à un autre owner : même 404
                # (le DELETE n'est volontairement PAS idempotent-silencieux,
                # le front sait ainsi que sa vue était périmée).
                raise PetNotFoundError("Animal introuvable.")

            pet.soft_delete(self._clock.now())
            await uow.pets.update(pet)
            await uow.commit()
