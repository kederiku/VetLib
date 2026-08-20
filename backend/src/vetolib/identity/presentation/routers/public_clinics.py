"""Routeur FastAPI /public/clinics : l'annuaire public des cliniques.

Consommé par le portail B2C AVANT toute connexion (un propriétaire cherche
où prendre rendez-vous) : AUCUNE authentification, d'où le préfixe /public
qui rend l'intention lisible dans l'URL et l'OpenAPI. La contrepartie de
cette ouverture : la réponse est la projection MINIMALE PublicClinic (nom +
ville), jamais la fiche complète, et la pagination est bornée (limit <= 100)
pour qu'on ne puisse pas aspirer la table en une requête.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from vetolib.identity.application.use_cases import ListPublicClinics
from vetolib.identity.presentation.dependencies import get_list_public_clinics
from vetolib.identity.presentation.schemas import PublicClinicResponse

router = APIRouter(prefix="/public/clinics", tags=["public-clinics"])


@router.get("", operation_id="listClinics")
async def list_clinics(
    use_case: Annotated[ListPublicClinics, Depends(get_list_public_clinics)],
    # Query(...) documente et valide les bornes dans l'OpenAPI : limit hors
    # [1, 100] ou offset négatif -> 422 automatique, le use case ne voit
    # jamais de pagination aberrante.
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[PublicClinicResponse]:
    """Page de l'annuaire : cliniques actives triées par nom."""
    clinics = await use_case.execute(limit=limit, offset=offset)
    return [PublicClinicResponse.from_dto(clinic) for clinic in clinics]
