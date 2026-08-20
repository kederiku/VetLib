"""Mapper partage entite Appointment -> AppointmentDto (module prive)."""

from vetolib.scheduling.application.dto import AppointmentDto
from vetolib.scheduling.domain.appointment import Appointment


def to_appointment_dto(appointment: Appointment) -> AppointmentDto:
    return AppointmentDto(
        id=appointment.id,
        clinic_id=appointment.clinic_id,
        resource_id=appointment.resource_id,
        appointment_type_id=appointment.appointment_type_id,
        owner_id=appointment.owner_id,
        pet_id=appointment.pet_id,
        guest_name=appointment.guest_name,
        guest_pet_name=appointment.guest_pet_name,
        starts_at=appointment.starts_at,
        ends_at=appointment.ends_at,
        status=appointment.status,
        reason=appointment.reason,
        cancelled_reason=appointment.cancelled_reason,
    )
