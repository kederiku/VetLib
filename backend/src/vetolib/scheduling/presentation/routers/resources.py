"""Routes des praticiens : CRUD + semaine type + absences (manager)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status

from vetolib.identity.application.dto import CurrentUser
from vetolib.identity.presentation.dependencies import require_permission
from vetolib.scheduling.application.dto import (
    CreateExceptionCommand,
    CreateResourceCommand,
    SetWeeklyScheduleCommand,
    UpdateResourceCommand,
)
from vetolib.scheduling.application.use_cases import (
    CreateResource,
    CreateResourceException,
    DeleteResource,
    DeleteResourceException,
    GetResourceWeeklySchedule,
    ListResourceExceptions,
    ListResources,
    SetResourceWeeklySchedule,
    UpdateResource,
)
from vetolib.scheduling.domain.value_objects import WeeklyTimeRange
from vetolib.scheduling.presentation.dependencies import (
    get_create_resource,
    get_create_resource_exception,
    get_delete_resource,
    get_delete_resource_exception,
    get_get_resource_weekly_schedule,
    get_list_resource_exceptions,
    get_list_resources,
    get_set_resource_weekly_schedule,
    get_update_resource,
)
from vetolib.scheduling.presentation.schemas import (
    CreateResourceRequest,
    CreateScheduleExceptionRequest,
    ResourceResponse,
    ScheduleExceptionResponse,
    SetWeeklySchedulesRequest,
    UpdateResourceRequest,
    WeeklyScheduleResponse,
)

router = APIRouter(
    prefix="/scheduling/resources",
    tags=["scheduling"],
    dependencies=[Depends(require_permission("clinic:manage"))],
)


@router.get("", operation_id="listResources")
async def list_resources(
    use_case: Annotated[ListResources, Depends(get_list_resources)],
) -> list[ResourceResponse]:
    return [ResourceResponse.from_dto(r) for r in await use_case.execute()]


@router.post("", operation_id="createResource", status_code=status.HTTP_201_CREATED)
async def create_resource(
    body: CreateResourceRequest,
    use_case: Annotated[CreateResource, Depends(get_create_resource)],
    current: Annotated[CurrentUser, Depends(require_permission("clinic:manage"))],
) -> ResourceResponse:
    dto = await use_case.execute(
        CreateResourceCommand(clinic_id=current.clinic_id, name=body.name, user_id=body.user_id)
    )
    return ResourceResponse.from_dto(dto)


@router.put("/{resource_id}", operation_id="updateResource")
async def update_resource(
    resource_id: uuid.UUID,
    body: UpdateResourceRequest,
    use_case: Annotated[UpdateResource, Depends(get_update_resource)],
) -> ResourceResponse:
    dto = await use_case.execute(
        UpdateResourceCommand(
            resource_id=resource_id,
            name=body.name,
            active=body.active,
            user_id=body.user_id,
        )
    )
    return ResourceResponse.from_dto(dto)


@router.delete(
    "/{resource_id}", operation_id="deleteResource", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_resource(
    resource_id: uuid.UUID,
    use_case: Annotated[DeleteResource, Depends(get_delete_resource)],
) -> None:
    await use_case.execute(resource_id)


@router.get("/{resource_id}/weekly-schedule", operation_id="getResourceWeeklySchedule")
async def get_resource_weekly_schedule(
    resource_id: uuid.UUID,
    use_case: Annotated[GetResourceWeeklySchedule, Depends(get_get_resource_weekly_schedule)],
) -> list[WeeklyScheduleResponse]:
    return [WeeklyScheduleResponse.from_dto(s) for s in await use_case.execute(resource_id)]


@router.put("/{resource_id}/weekly-schedule", operation_id="setResourceWeeklySchedule")
async def set_resource_weekly_schedule(
    resource_id: uuid.UUID,
    body: SetWeeklySchedulesRequest,
    use_case: Annotated[SetResourceWeeklySchedule, Depends(get_set_resource_weekly_schedule)],
) -> list[WeeklyScheduleResponse]:
    # La construction des VOs WeeklyTimeRange rejoue la validation domaine
    # (weekday 0-6, fin apres debut) en plus des bornes du schema Pydantic.
    items = [
        WeeklyTimeRange(weekday=i.weekday, start_time=i.start_time, end_time=i.end_time)
        for i in body.items
    ]
    dtos = await use_case.execute(SetWeeklyScheduleCommand(resource_id=resource_id, items=items))
    return [WeeklyScheduleResponse.from_dto(s) for s in dtos]


@router.get("/{resource_id}/exceptions", operation_id="listResourceExceptions")
async def list_resource_exceptions(
    resource_id: uuid.UUID,
    use_case: Annotated[ListResourceExceptions, Depends(get_list_resource_exceptions)],
) -> list[ScheduleExceptionResponse]:
    return [ScheduleExceptionResponse.from_dto(e) for e in await use_case.execute(resource_id)]


@router.post(
    "/{resource_id}/exceptions",
    operation_id="createResourceException",
    status_code=status.HTTP_201_CREATED,
)
async def create_resource_exception(
    resource_id: uuid.UUID,
    body: CreateScheduleExceptionRequest,
    use_case: Annotated[CreateResourceException, Depends(get_create_resource_exception)],
) -> ScheduleExceptionResponse:
    dto = await use_case.execute(
        CreateExceptionCommand(
            resource_id=resource_id,
            starts_at=body.starts_at,
            ends_at=body.ends_at,
            reason=body.reason,
        )
    )
    return ScheduleExceptionResponse.from_dto(dto)


@router.delete(
    "/{resource_id}/exceptions/{exception_id}",
    operation_id="deleteResourceException",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_resource_exception(
    resource_id: uuid.UUID,
    exception_id: uuid.UUID,
    use_case: Annotated[DeleteResourceException, Depends(get_delete_resource_exception)],
) -> None:
    await use_case.execute(resource_id, exception_id)
