"""Agregation du contexte scheduling : un routeur + une table d'erreurs.

Le contexte n'expose que ces deux symboles a main.py (meme contrat
qu'identity et patients).
"""

from fastapi import APIRouter, status

from vetolib.scheduling.domain.errors import (
    AppointmentNotFoundError,
    AppointmentTypeNotFoundError,
    CancellationTooLateError,
    InvalidAppointmentTransitionError,
    ResourceNotFoundError,
    SchedulingClinicNotFoundError,
    SlotAlreadyBookedError,
    SlotUnavailableError,
)
from vetolib.scheduling.presentation.routers.agenda import router as agenda_router
from vetolib.scheduling.presentation.routers.appointment_types import (
    router as appointment_types_router,
)
from vetolib.scheduling.presentation.routers.owner import router as owner_router
from vetolib.scheduling.presentation.routers.public import router as public_router
from vetolib.scheduling.presentation.routers.resources import router as resources_router
from vetolib.shared.domain.errors import DomainError

scheduling_router = APIRouter()
scheduling_router.include_router(appointment_types_router)
scheduling_router.include_router(resources_router)
scheduling_router.include_router(agenda_router)
scheduling_router.include_router(public_router)
scheduling_router.include_router(owner_router)

# Statuts HTTP du contexte. Redondant avec les defauts (ConflictError -> 409,
# EntityNotFoundError -> 404) mais EXPLICITE : le contrat du contexte se lit
# ici, d'un coup d'oeil.
SCHEDULING_ERROR_STATUS: dict[type[DomainError], int] = {
    SlotAlreadyBookedError: status.HTTP_409_CONFLICT,
    SlotUnavailableError: status.HTTP_409_CONFLICT,
    InvalidAppointmentTransitionError: status.HTTP_409_CONFLICT,
    CancellationTooLateError: status.HTTP_409_CONFLICT,
    ResourceNotFoundError: status.HTTP_404_NOT_FOUND,
    AppointmentTypeNotFoundError: status.HTTP_404_NOT_FOUND,
    AppointmentNotFoundError: status.HTTP_404_NOT_FOUND,
    SchedulingClinicNotFoundError: status.HTTP_404_NOT_FOUND,
}
