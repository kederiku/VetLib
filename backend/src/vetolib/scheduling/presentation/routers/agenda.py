"""Routes de l'agenda staff : lecture, creation, transitions d'etat.

Permissions : appointment:read pour lire, appointment:write pour agir --
tous les roles staff les possedent (l'ASV gere l'agenda, c'est son metier).
"""

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from vetolib.identity.application.dto import CurrentUser
from vetolib.identity.presentation.dependencies import require_permission
from vetolib.scheduling.application.dto import (
    GetAgendaQuery,
    StaffCreateAppointmentCommand,
)
from vetolib.scheduling.application.use_cases import (
    CancelAppointmentByStaff,
    CompleteAppointment,
    ConfirmAppointment,
    CreateAppointmentByStaff,
    GetAgenda,
)
from vetolib.scheduling.presentation.dependencies import (
    get_cancel_appointment_by_staff,
    get_complete_appointment,
    get_confirm_appointment,
    get_create_appointment_by_staff,
    get_get_agenda,
)
from vetolib.scheduling.presentation.schemas import (
    AgendaEntryResponse,
    AppointmentResponse,
    CancelAppointmentRequest,
    StaffCreateAppointmentRequest,
)

router = APIRouter(prefix="/scheduling", tags=["scheduling"])


@router.get("/agenda", operation_id="getAgenda")
async def get_agenda(
    use_case: Annotated[GetAgenda, Depends(get_get_agenda)],
    current: Annotated[CurrentUser, Depends(require_permission("appointment:read"))],
    date_from: Annotated[date, Query()],
    date_to: Annotated[date, Query()],
    resource_id: Annotated[uuid.UUID | None, Query()] = None,
) -> list[AgendaEntryResponse]:
    entries = await use_case.execute(
        GetAgendaQuery(date_from=date_from, date_to=date_to, resource_id=resource_id),
        clinic_id=current.clinic_id,
    )
    return [AgendaEntryResponse.from_dto(e) for e in entries]


@router.post("/appointments", operation_id="createAppointment", status_code=status.HTTP_201_CREATED)
async def create_appointment(
    body: StaffCreateAppointmentRequest,
    use_case: Annotated[CreateAppointmentByStaff, Depends(get_create_appointment_by_staff)],
    current: Annotated[CurrentUser, Depends(require_permission("appointment:write"))],
) -> AppointmentResponse:
    dto = await use_case.execute(
        StaffCreateAppointmentCommand(
            clinic_id=current.clinic_id,
            resource_id=body.resource_id,
            appointment_type_id=body.appointment_type_id,
            starts_at=body.starts_at,
            owner_id=body.owner_id,
            pet_id=body.pet_id,
            guest_name=body.guest_name,
            guest_pet_name=body.guest_pet_name,
            reason=body.reason,
        )
    )
    return AppointmentResponse.from_dto(dto)


@router.post(
    "/appointments/{appointment_id}/confirm",
    operation_id="confirmAppointment",
    dependencies=[Depends(require_permission("appointment:write"))],
)
async def confirm_appointment(
    appointment_id: uuid.UUID,
    use_case: Annotated[ConfirmAppointment, Depends(get_confirm_appointment)],
) -> AppointmentResponse:
    return AppointmentResponse.from_dto(await use_case.execute(appointment_id))


@router.post(
    "/appointments/{appointment_id}/complete",
    operation_id="completeAppointment",
    dependencies=[Depends(require_permission("appointment:write"))],
)
async def complete_appointment(
    appointment_id: uuid.UUID,
    use_case: Annotated[CompleteAppointment, Depends(get_complete_appointment)],
) -> AppointmentResponse:
    return AppointmentResponse.from_dto(await use_case.execute(appointment_id))


@router.post(
    "/appointments/{appointment_id}/cancel",
    operation_id="cancelAppointment",
    dependencies=[Depends(require_permission("appointment:write"))],
)
async def cancel_appointment(
    appointment_id: uuid.UUID,
    body: CancelAppointmentRequest,
    use_case: Annotated[CancelAppointmentByStaff, Depends(get_cancel_appointment_by_staff)],
) -> AppointmentResponse:
    return AppointmentResponse.from_dto(
        await use_case.execute(appointment_id, cancelled_reason=body.cancelled_reason)
    )
