"""Routes proprietaires du scheduling : reserver, lister, annuler.

Tout en CurrentOwnerDep (cookie owner) : l'owner_id de la session est la
SEULE identite utilisee -- jamais un id du body.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status

from vetolib.identity.presentation.dependencies import CurrentOwnerDep
from vetolib.scheduling.application.dto import OwnerBookAppointmentCommand
from vetolib.scheduling.application.use_cases import (
    BookAppointmentByOwner,
    CancelAppointmentByOwner,
    ListOwnerAppointments,
)
from vetolib.scheduling.presentation.dependencies import (
    get_book_appointment_by_owner,
    get_cancel_appointment_by_owner,
    get_list_owner_appointments,
)
from vetolib.scheduling.presentation.schemas import (
    AppointmentResponse,
    OwnerAppointmentResponse,
    OwnerBookAppointmentRequest,
)

router = APIRouter(prefix="/owner/appointments", tags=["owner-appointments"])


@router.get("", operation_id="listMyAppointments")
async def list_my_appointments(
    current: CurrentOwnerDep,
    use_case: Annotated[ListOwnerAppointments, Depends(get_list_owner_appointments)],
) -> list[OwnerAppointmentResponse]:
    """Mes rendez-vous, TOUTES cliniques confondues (vue enrichie)."""
    views = await use_case.execute(current.id)
    return [OwnerAppointmentResponse.from_view(v) for v in views]


@router.post("", operation_id="bookAppointment", status_code=status.HTTP_201_CREATED)
async def book_appointment(
    body: OwnerBookAppointmentRequest,
    current: CurrentOwnerDep,
    use_case: Annotated[BookAppointmentByOwner, Depends(get_book_appointment_by_owner)],
) -> AppointmentResponse:
    """Demande de rendez-vous en ligne : nait PENDING, la clinique confirme."""
    dto = await use_case.execute(
        OwnerBookAppointmentCommand(
            owner_id=current.id,
            clinic_id=body.clinic_id,
            appointment_type_id=body.appointment_type_id,
            resource_id=body.resource_id,
            starts_at=body.starts_at,
            pet_id=body.pet_id,
            reason=body.reason,
        )
    )
    return AppointmentResponse.from_dto(dto)


@router.post("/{appointment_id}/cancel", operation_id="cancelMyAppointment")
async def cancel_my_appointment(
    appointment_id: uuid.UUID,
    current: CurrentOwnerDep,
    use_case: Annotated[CancelAppointmentByOwner, Depends(get_cancel_appointment_by_owner)],
) -> AppointmentResponse:
    """Annulation en ligne (au moins 24 h avant le debut du rendez-vous)."""
    dto = await use_case.execute(appointment_id, owner_id=current.id)
    return AppointmentResponse.from_dto(dto)
