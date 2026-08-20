"""Route de la fiche personnelle du propriétaire (adresse, téléphone, prefs).

Séparée des routes d'auth : /owner/auth/* gère la SESSION (qui suis-je ?),
/owner/profile gère la FICHE (mes informations). La route est protégée par
CurrentOwnerDep : l'owner modifié est TOUJOURS celui de la session, jamais
un id venu du body — un propriétaire ne peut toucher que sa propre fiche.
"""

from typing import Annotated

from fastapi import APIRouter, Depends

from vetolib.identity.application.dto import UpdateOwnerProfileCommand
from vetolib.identity.application.use_cases import UpdateOwnerProfile
from vetolib.identity.presentation.dependencies import (
    CurrentOwnerDep,
    get_update_owner_profile,
)
from vetolib.identity.presentation.schemas import OwnerResponse, UpdateOwnerProfileRequest

router = APIRouter(prefix="/owner", tags=["owner-profile"])


@router.put("/profile", operation_id="updateOwnerProfile")
async def update_owner_profile(
    body: UpdateOwnerProfileRequest,
    current: CurrentOwnerDep,
    use_case: Annotated[UpdateOwnerProfile, Depends(get_update_owner_profile)],
) -> OwnerResponse:
    """PUT (remplacement complet de la fiche) : le formulaire du front envoie
    toujours tous les champs — plus simple et plus prévisible qu'un PATCH
    partiel. Ni email ni mot de passe : absents du schéma, donc immuables ici."""
    address = body.address
    updated = await use_case.execute(
        UpdateOwnerProfileCommand(
            owner_id=current.id,
            first_name=body.first_name,
            last_name=body.last_name,
            phone=body.phone,
            address_line1=address.line1 if address else None,
            address_line2=address.line2 if address else None,
            postal_code=address.postal_code if address else None,
            city=address.city if address else None,
            country=address.country if address else "FR",
            notify_email=body.notification_preferences.email,
            notify_sms=body.notification_preferences.sms,
        )
    )
    return OwnerResponse.from_current_owner(updated)
