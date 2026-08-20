"""Routeur FastAPI /clinics : inscription d'une clinique (onboarding B2B).

Endpoint public (aucune authentification) : c'est le point d'entrée du
produit, la création du tenant. Le use case RegisterClinic crée, dans UNE
seule transaction, la clinique (le tenant), son premier utilisateur gérant
(Role.MANAGER) et un événement ClinicRegistered déposé dans la table
outbox_events (relayé ensuite par TaskIQ : le pattern Outbox garantit que
l'effet de bord asynchrone ne part que si le commit a réussi).

Il tourne forcément sur la UoW système : la clinique n'existant pas encore,
il n'y a pas de clinic_id à donner à la RLS.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, status

from vetolib.identity.application.dto import RegisterClinicCommand
from vetolib.identity.application.use_cases import RegisterClinic
from vetolib.identity.presentation.dependencies import get_register_clinic
from vetolib.identity.presentation.schemas import (
    ClinicRegisteredResponse,
    RegisterClinicRequest,
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
