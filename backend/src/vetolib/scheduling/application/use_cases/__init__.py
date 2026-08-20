"""Use cases du contexte scheduling (couche application).

Organisation : un MODULE par flux metier (reglages, agenda, public, owner),
chaque classe restant un use case autonome au gabarit identity (ctor avec
les ports, une methode execute). Regrouper 20+ petites classes par flux
garde le meme niveau de testabilite avec une navigation plus simple que
20+ fichiers d'une classe.
"""

from vetolib.scheduling.application.use_cases.agenda import (
    CancelAppointmentByStaff,
    CompleteAppointment,
    ConfirmAppointment,
    CreateAppointmentByStaff,
    GetAgenda,
)
from vetolib.scheduling.application.use_cases.appointment_types import (
    CreateAppointmentType,
    DeleteAppointmentType,
    ListAppointmentTypes,
    UpdateAppointmentType,
)
from vetolib.scheduling.application.use_cases.owner import (
    BookAppointmentByOwner,
    CancelAppointmentByOwner,
    ListOwnerAppointments,
)
from vetolib.scheduling.application.use_cases.public import (
    GetPublicAvailabilities,
    ListClinicAppointmentTypes,
)
from vetolib.scheduling.application.use_cases.resources import (
    CreateResource,
    DeleteResource,
    ListResources,
    UpdateResource,
)
from vetolib.scheduling.application.use_cases.schedules import (
    CreateResourceException,
    DeleteResourceException,
    GetResourceWeeklySchedule,
    ListResourceExceptions,
    SetResourceWeeklySchedule,
)

__all__ = [
    "BookAppointmentByOwner",
    "CancelAppointmentByOwner",
    "CancelAppointmentByStaff",
    "CompleteAppointment",
    "ConfirmAppointment",
    "CreateAppointmentByStaff",
    "CreateAppointmentType",
    "CreateResource",
    "CreateResourceException",
    "DeleteAppointmentType",
    "DeleteResource",
    "DeleteResourceException",
    "GetAgenda",
    "GetPublicAvailabilities",
    "GetResourceWeeklySchedule",
    "ListAppointmentTypes",
    "ListClinicAppointmentTypes",
    "ListOwnerAppointments",
    "ListResourceExceptions",
    "ListResources",
    "SetResourceWeeklySchedule",
    "UpdateAppointmentType",
    "UpdateResource",
]
