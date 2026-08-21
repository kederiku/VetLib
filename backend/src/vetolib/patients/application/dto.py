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
from datetime import date

from vetolib.patients.domain.pet import Sex, Species


@dataclass(frozen=True, kw_only=True)
class PetDto:
    """Projection d'un animal pour la couche presentation (fiche exposable)."""

    id: uuid.UUID
    name: str
    species: Species
    birth_date: date | None
    sex: Sex
    breed: str | None
    sterilized: bool | None


@dataclass(frozen=True, kw_only=True)
class CreatePetCommand:
    """Entrée de CreatePet : déclaration d'un animal par son propriétaire.

    Les champs de la fiche enrichie ont un défaut : déclarer un animal en
    urgence ne doit demander qu'un nom et une espèce.
    """

    owner_id: uuid.UUID
    name: str
    species: Species
    birth_date: date | None = None
    sex: Sex = Sex.UNKNOWN
    breed: str | None = None
    sterilized: bool | None = None


@dataclass(frozen=True, kw_only=True)
class UpdatePetCommand:
    """Entrée d'UpdatePet : REMPLACEMENT complet de la fiche (sémantique PUT).

    ATTENTION EN RELECTURE : le type de birth_date et breed n'a pas change
    (X | None), mais leur SENS s'est inverse. Ils ne veulent plus dire
    "inchange" : ils portent la nouvelle valeur, null compris -- donc null
    EFFACE. C'est ce qui rend possible de vider une race saisie par erreur,
    impossible avec l'ancienne semantique PATCH.

    Aucun champ n'a de defaut, pour la meme raison que Pet.update_profile :
    un oubli doit etre une erreur de compilation, pas un effacement muet.

    pet_id vient du chemin de l'URL, owner_id du token : le couple est
    verifie en base par get_for_owner (404 si l'animal n'est pas au
    proprietaire de la session).
    """

    pet_id: uuid.UUID
    owner_id: uuid.UUID
    name: str
    species: Species
    birth_date: date | None
    sex: Sex
    breed: str | None
    sterilized: bool | None
