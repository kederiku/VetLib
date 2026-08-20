"""Routeur FastAPI /clinics : inscription (onboarding B2B) et fiche clinique.

Deux familles de routes :
- POST /clinics/register, endpoint PUBLIC (aucune authentification) : point
  d'entrée du produit, la création du tenant. Le use case RegisterClinic
  crée, dans UNE seule transaction, la clinique (le tenant), son premier
  utilisateur gérant (Role.MANAGER) et un événement ClinicRegistered déposé
  dans la table outbox_events (relayé ensuite par TaskIQ : le pattern Outbox
  garantit que l'effet de bord asynchrone ne part que si le commit a réussi).
- GET/PUT /clinics/me, réservées au MANAGER (require_permission
  "clinic:manage") : consultation et mise à jour de la fiche de SA clinique,
  le clinic_id venant TOUJOURS du token (jamais d'un paramètre client).

Tout tourne sur la UoW système : au register la clinique n'existe pas encore
(pas de clinic_id à donner à la RLS), et la table clinics (celle des
tenants eux-mêmes) est de toute façon hors RLS.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, status

from vetolib.identity.application.dto import (
    CurrentUser,
    RegisterClinicCommand,
    UpdateClinicProfileCommand,
)
from vetolib.identity.application.use_cases import (
    GetClinicProfile,
    RegisterClinic,
    UpdateClinicProfile,
)
from vetolib.identity.presentation.dependencies import (
    get_get_clinic_profile,
    get_register_clinic,
    get_update_clinic_profile,
    require_permission,
)
from vetolib.identity.presentation.schemas import (
    ClinicProfileResponse,
    ClinicRegisteredResponse,
    RegisterClinicRequest,
    UpdateClinicProfileRequest,
)

router = APIRouter(prefix="/clinics", tags=["clinics"])


# operation_id="registerClinic" : nom du hook Orval côté front (registre B2B).
@router.post("/register", operation_id="registerClinic", status_code=status.HTTP_201_CREATED)
async def register_clinic(
    body: RegisterClinicRequest,
    use_case: Annotated[RegisterClinic, Depends(get_register_clinic)],
) -> ClinicRegisteredResponse:
    """Crée la clinique et son gérant ; 201 avec les deux UUID créés.

    Notez que la réponse ne pose PAS de cookies : l'inscription ne connecte
    pas automatiquement, l'utilisateur passe ensuite par /auth/login. Un
    email déjà pris (user ou clinique) -> EmailAlreadyExistsError -> 409.
    La route ne fait que traduire schéma HTTP <-> commande applicative.
    """
    result = await use_case.execute(
        RegisterClinicCommand(
            clinic_name=body.clinic_name,
            phone=body.phone,
            email=body.email,
            # SecretStr -> str seulement ici, au moment de construire la commande.
            password=body.password.get_secret_value(),
            first_name=body.first_name,
            last_name=body.last_name,
        )
    )
    return ClinicRegisteredResponse(clinic_id=result.clinic_id, user_id=result.user_id)


@router.get("/me", operation_id="getMyClinic")
async def get_my_clinic(
    # require_permission("clinic:manage") = authentification (401 sans cookie
    # staff valide) PUIS autorisation (403 si la permission manque : seul le
    # rôle manager la détient). Le clinic_id est celui DU TOKEN.
    current: Annotated[CurrentUser, Depends(require_permission("clinic:manage"))],
    use_case: Annotated[GetClinicProfile, Depends(get_get_clinic_profile)],
) -> ClinicProfileResponse:
    """Fiche de la clinique du manager connecté (adresse, timezone...)."""
    profile = await use_case.execute(current.clinic_id)
    return ClinicProfileResponse.from_dto(profile)


@router.put("/me", operation_id="updateMyClinic")
async def update_my_clinic(
    body: UpdateClinicProfileRequest,
    current: Annotated[CurrentUser, Depends(require_permission("clinic:manage"))],
    use_case: Annotated[UpdateClinicProfile, Depends(get_update_clinic_profile)],
) -> ClinicProfileResponse:
    """PUT (remplacement complet de la fiche) : le formulaire du front envoie
    toujours tous les champs -- plus simple et plus prévisible qu'un PATCH
    partiel. Pas d'email : absent du schéma, donc immuable ici."""
    address = body.address
    updated = await use_case.execute(
        UpdateClinicProfileCommand(
            # Jamais un id venu du body : un manager ne modifie que SA clinique.
            clinic_id=current.clinic_id,
            name=body.name,
            phone=body.phone,
            address_line1=address.line1 if address else None,
            address_line2=address.line2 if address else None,
            postal_code=address.postal_code if address else None,
            city=address.city if address else None,
            country=address.country if address else "FR",
            timezone=body.timezone,
        )
    )
    return ClinicProfileResponse.from_dto(updated)
