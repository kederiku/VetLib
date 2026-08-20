"""Routes des types de rendez-vous (reglages, manager uniquement).

`dependencies=[Depends(require_permission("clinic:manage"))]` au niveau du
routeur : CHAQUE route exige un staff authentifie AVEC la permission --
premier consommateur reel de require_permission.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status

from vetolib.identity.application.dto import CurrentUser
from vetolib.identity.presentation.dependencies import require_permission
from vetolib.scheduling.application.dto import (
    CreateAppointmentTypeCommand,
    UpdateAppointmentTypeCommand,
)
from vetolib.scheduling.application.use_cases import (
    CreateAppointmentType,
    DeleteAppointmentType,
    ListAppointmentTypes,
    UpdateAppointmentType,
)
from vetolib.scheduling.presentation.dependencies import (
    get_create_appointment_type,
    get_delete_appointment_type,
    get_list_appointment_types,
    get_update_appointment_type,
)
from vetolib.scheduling.presentation.schemas import (
    AppointmentTypeResponse,
    CreateAppointmentTypeRequest,
    UpdateAppointmentTypeRequest,
)

# CurrentUser injecte via require_permission : la garde du routeur suffit,
# le clinic_id du token est deja fige dans la fabrique UoW tenant.
router = APIRouter(
    prefix="/scheduling/appointment-types",
    tags=["scheduling"],
    dependencies=[Depends(require_permission("clinic:manage"))],
)


@router.get("", operation_id="listAppointmentTypes")
async def list_appointment_types(
    use_case: Annotated[ListAppointmentTypes, Depends(get_list_appointment_types)],
) -> list[AppointmentTypeResponse]:
    return [AppointmentTypeResponse.from_dto(t) for t in await use_case.execute()]


@router.post("", operation_id="createAppointmentType", status_code=status.HTTP_201_CREATED)
async def create_appointment_type(
    body: CreateAppointmentTypeRequest,
    use_case: Annotated[CreateAppointmentType, Depends(get_create_appointment_type)],
    current: Annotated[CurrentUser, Depends(require_permission("clinic:manage"))],
) -> AppointmentTypeResponse:
    dto = await use_case.execute(
        CreateAppointmentTypeCommand(
            clinic_id=current.clinic_id,
            name=body.name,
            duration_minutes=body.duration_minutes,
        )
    )
    return AppointmentTypeResponse.from_dto(dto)


@router.put("/{appointment_type_id}", operation_id="updateAppointmentType")
async def update_appointment_type(
    appointment_type_id: uuid.UUID,
    body: UpdateAppointmentTypeRequest,
    use_case: Annotated[UpdateAppointmentType, Depends(get_update_appointment_type)],
) -> AppointmentTypeResponse:
    dto = await use_case.execute(
        UpdateAppointmentTypeCommand(
            appointment_type_id=appointment_type_id,
            name=body.name,
            duration_minutes=body.duration_minutes,
            active=body.active,
        )
    )
    return AppointmentTypeResponse.from_dto(dto)


@router.delete(
    "/{appointment_type_id}",
    operation_id="deleteAppointmentType",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_appointment_type(
    appointment_type_id: uuid.UUID,
    use_case: Annotated[DeleteAppointmentType, Depends(get_delete_appointment_type)],
) -> None:
    await use_case.execute(appointment_type_id)
