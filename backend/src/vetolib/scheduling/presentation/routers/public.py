"""Routes PUBLIQUES du scheduling : types actifs et disponibilites.

Aucune authentification : ce sont les vitrines de la prise de rendez-vous
en ligne (wizard B2C, avant meme le login). UoW systeme + filtres clinic_id
explicites cote use cases -- voir la doc de use_cases/public.py.
"""

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from vetolib.scheduling.application.dto import AvailabilityQuery
from vetolib.scheduling.application.use_cases import (
    GetPublicAvailabilities,
    ListClinicAppointmentTypes,
)
from vetolib.scheduling.presentation.dependencies import (
    get_list_clinic_appointment_types,
    get_public_availabilities,
)
from vetolib.scheduling.presentation.schemas import (
    AvailabilitySlotResponse,
    PublicAppointmentTypeResponse,
)

router = APIRouter(prefix="/public/clinics", tags=["public-clinics"])


@router.get("/{clinic_id}/appointment-types", operation_id="listClinicAppointmentTypes")
async def list_clinic_appointment_types(
    clinic_id: uuid.UUID,
    use_case: Annotated[ListClinicAppointmentTypes, Depends(get_list_clinic_appointment_types)],
) -> list[PublicAppointmentTypeResponse]:
    return [PublicAppointmentTypeResponse.from_dto(t) for t in await use_case.execute(clinic_id)]


@router.get("/{clinic_id}/availabilities", operation_id="listAvailabilities")
async def list_availabilities(
    clinic_id: uuid.UUID,
    use_case: Annotated[GetPublicAvailabilities, Depends(get_public_availabilities)],
    appointment_type_id: Annotated[uuid.UUID, Query()],
    date_from: Annotated[date, Query()],
    date_to: Annotated[date, Query()],
) -> list[AvailabilitySlotResponse]:
    """Creneaux calcules a la volee, en ISO UTC (le front formate seulement)."""
    slots = await use_case.execute(
        AvailabilityQuery(
            clinic_id=clinic_id,
            appointment_type_id=appointment_type_id,
            date_from=date_from,
            date_to=date_to,
        )
    )
    return [AvailabilitySlotResponse.from_dto(s) for s in slots]
