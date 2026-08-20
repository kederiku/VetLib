"""Erreurs métier du contexte patients.

Couche domain : exceptions pures, traduites en statuts HTTP par les error
handlers partagés (via PATIENTS_ERROR_STATUS dans presentation/router.py).
Le champ `code` est l'identifiant stable machine-readable exposé aux
frontends -- convention "<contexte>.<cas>", comme dans identity.
"""

from vetolib.shared.domain.errors import EntityNotFoundError


class PetNotFoundError(EntityNotFoundError):
    """Animal inexistant, soft-deleted, OU appartenant à un autre owner -> 404.

    Un seul et même 404 pour les trois cas : répondre différemment pour
    "l'animal d'un autre" révélerait l'existence de la donnée (même logique
    que le 404 des entités filtrées par la RLS côté staff).
    """

    code = "patients.pet_not_found"
