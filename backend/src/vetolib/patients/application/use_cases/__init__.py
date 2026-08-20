"""Use cases du contexte patients (couche application).

CRUD des animaux d'un propriétaire, tous bornés à l'owner de la session
(owner_id du token, jamais du body). Re-export pour offrir un point d'import
stable à la couche presentation, comme dans identity.
"""

from vetolib.patients.application.use_cases.create_pet import CreatePet
from vetolib.patients.application.use_cases.delete_pet import DeletePet
from vetolib.patients.application.use_cases.list_my_pets import ListMyPets
from vetolib.patients.application.use_cases.update_pet import UpdatePet

__all__ = [
    "CreatePet",
    "DeletePet",
    "ListMyPets",
    "UpdatePet",
]
