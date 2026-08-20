"""DTOs de la couche application du contexte patients.

Mêmes conventions que dans identity : dataclasses frozen=True (instantanés
immuables, sûrs à partager entre couches) et kw_only=True (appel par
mots-clés obligatoire, pas d'inversion silencieuse de champs).

Règle transverse à toutes les commandes : owner_id vient TOUJOURS du token
de la session (dépendance CurrentOwnerDep), jamais du body HTTP. Combinée à
l'API du port PetRepository (filtre owner_id dans la signature), elle
garantit qu'un propriétaire ne voit et ne touche que SES animaux.
"""

import uuid
from dataclasses import dataclass

from vetolib.patients.domain.pet import Species


@dataclass(frozen=True, kw_only=True)
class PetDto:
    """Projection d'un animal pour la couche presentation (fiche exposable)."""

    id: uuid.UUID
    name: str
    species: Species


@dataclass(frozen=True, kw_only=True)
class CreatePetCommand:
    """Entrée de CreatePet : déclaration d'un animal par son propriétaire."""

    owner_id: uuid.UUID
    name: str
    species: Species


@dataclass(frozen=True, kw_only=True)
class UpdatePetCommand:
    """Entrée d'UpdatePet : édition PARTIELLE de la fiche (sémantique PATCH).

    None = champ non fourni, donc inchangé (l'entité Pet.update n'écrase que
    le non-None). pet_id vient du chemin de l'URL, owner_id du token : le
    couple est vérifié en base par get_for_owner (404 si l'animal n'est pas
    au propriétaire de la session).
    """

    pet_id: uuid.UUID
    owner_id: uuid.UUID
    name: str | None
    species: Species | None
