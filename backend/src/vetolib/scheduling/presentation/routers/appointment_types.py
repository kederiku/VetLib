"""Routes des types de rendez-vous : lecture staff, gestion manager.

Decoupage des permissions ROUTE PAR ROUTE (et non plus sur le routeur) :
- lister les types (GET "") demande appointment:read : connaitre les types
  et leur duree est un prerequis de la gestion d'agenda (creer un RDV au
  comptoir), un droit que TOUT le staff possede (ASV, veterinaire, manager) ;
- creer/modifier/supprimer un type reste reserve au manager (clinic:manage) :
  c'est un reglage de la clinique, pas de la simple consultation.
Sans ce decoupage, l'ecran Agenda du frontend B2B repondait 403 aux roles
asv/veterinaire des qu'il chargeait la liste des types.
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

# Pas de garde globale sur le routeur : chaque route porte SA permission
# (lecture staff vs gestion manager), voir la docstring du module. Le
# clinic_id du token reste fige dans la fabrique UoW tenant.
router = APIRouter(prefix="/scheduling/appointment-types", tags=["scheduling"])


@router.get(
    "",
    operation_id="listAppointmentTypes",
    dependencies=[Depends(require_permission("appointment:read"))],
)
async def list_appointment_types(
    use_case: Annotated[ListAppointmentTypes, Depends(get_list_appointment_types)],
) -> list[AppointmentTypeResponse]:
    # Liste des types de RDV : accessible a tout le staff (appointment:read),
    # car indispensable a l'ecran Agenda (choix du type lors d'un RDV).
    # Commentaire et non docstring : FastAPI copierait la docstring dans la
    # description OpenAPI, ce qui changerait le client genere par Orval.
    return [AppointmentTypeResponse.from_dto(t) for t in await use_case.execute()]


@router.post("", operation_id="createAppointmentType", status_code=status.HTTP_201_CREATED)
async def create_appointment_type(
    body: CreateAppointmentTypeRequest,
    use_case: Annotated[CreateAppointmentType, Depends(get_create_appointment_type)],
    # La garde clinic:manage est portee par ce parametre : elle verifie la
    # permission ET fournit le CurrentUser (pour son clinic_id). Pas besoin
    # de la dupliquer dans dependencies=[...] du decorateur.
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


@router.put(
    "/{appointment_type_id}",
    operation_id="updateAppointmentType",
    dependencies=[Depends(require_permission("clinic:manage"))],
)
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
    dependencies=[Depends(require_permission("clinic:manage"))],
)
async def delete_appointment_type(
    appointment_type_id: uuid.UUID,
    use_case: Annotated[DeleteAppointmentType, Depends(get_delete_appointment_type)],
) -> None:
    await use_case.execute(appointment_type_id)
