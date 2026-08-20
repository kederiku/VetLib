"""Matrice complete de la machine a etats des rendez-vous.

Chaque transition interdite doit lever InvalidAppointmentTransitionError :
c'est la garantie qu'un rendez-vous annule ne peut pas etre confirme, qu'un
rendez-vous termine ne bouge plus, etc. On teste aussi la regle des 24 h de
l'annulation en ligne, a la frontiere exacte.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from vetolib.scheduling.domain.appointment import Appointment
from vetolib.scheduling.domain.errors import (
    CancellationTooLateError,
    InvalidAppointmentTransitionError,
)
from vetolib.scheduling.domain.value_objects import AppointmentStatus
from vetolib.shared.domain.errors import DomainValidationError

NOW = datetime(2026, 8, 20, 9, 0, tzinfo=UTC)


def _booked(starts_in: timedelta = timedelta(days=3)) -> Appointment:
    appointment, _event = Appointment.book_by_owner(
        clinic_id=uuid.uuid4(),
        resource_id=uuid.uuid4(),
        appointment_type_id=uuid.uuid4(),
        owner_id=uuid.uuid4(),
        pet_id=uuid.uuid4(),
        starts_at=NOW + starts_in,
        ends_at=NOW + starts_in + timedelta(minutes=30),
        reason="Boiterie",
        now=NOW,
    )
    return appointment


def test_book_by_owner_nait_pending_avec_evenement() -> None:
    appointment, event = Appointment.book_by_owner(
        clinic_id=uuid.uuid4(),
        resource_id=uuid.uuid4(),
        appointment_type_id=uuid.uuid4(),
        owner_id=uuid.uuid4(),
        pet_id=uuid.uuid4(),
        starts_at=NOW + timedelta(days=1),
        ends_at=NOW + timedelta(days=1, minutes=30),
        reason=None,
        now=NOW,
    )
    assert appointment.status is AppointmentStatus.PENDING
    assert event.event_type == "scheduling.appointment_booked"
    assert event.appointment_id == appointment.id


def test_create_by_staff_nait_confirmed() -> None:
    appointment = Appointment.create_by_staff(
        clinic_id=uuid.uuid4(),
        resource_id=uuid.uuid4(),
        appointment_type_id=uuid.uuid4(),
        owner_id=None,
        pet_id=None,
        guest_name="M. Dupont",
        guest_pet_name="Rex",
        starts_at=NOW + timedelta(hours=2),
        ends_at=NOW + timedelta(hours=2, minutes=30),
        reason=None,
        now=NOW,
    )
    assert appointment.status is AppointmentStatus.CONFIRMED


def test_invariant_owner_ou_guest() -> None:
    """Ni compte proprietaire ni nom de client : rendez-vous impossible."""
    with pytest.raises(DomainValidationError):
        Appointment.create_by_staff(
            clinic_id=uuid.uuid4(),
            resource_id=uuid.uuid4(),
            appointment_type_id=uuid.uuid4(),
            owner_id=None,
            pet_id=None,
            guest_name=None,
            guest_pet_name=None,
            starts_at=NOW + timedelta(hours=2),
            ends_at=NOW + timedelta(hours=2, minutes=30),
            reason=None,
            now=NOW,
        )


def test_pending_confirm_complete() -> None:
    """Chemin heureux complet : pending -> confirmed -> completed."""
    appointment = _booked()
    event = appointment.confirm(NOW)
    assert appointment.status is AppointmentStatus.CONFIRMED
    assert event.event_type == "scheduling.appointment_confirmed"
    appointment.complete()
    # Variable re-annotee : mypy a fige le type sur CONFIRMED via l'assert
    # ci-dessus et ne voit pas la mutation faite par complete().
    final_status: AppointmentStatus = appointment.status
    assert final_status is AppointmentStatus.COMPLETED


def test_transitions_interdites() -> None:
    # pending -> complete : interdit (il faut confirmer d'abord).
    appointment = _booked()
    with pytest.raises(InvalidAppointmentTransitionError):
        appointment.complete()

    # confirmed -> confirm : interdit (deja confirme).
    appointment = _booked()
    appointment.confirm(NOW)
    with pytest.raises(InvalidAppointmentTransitionError):
        appointment.confirm(NOW)

    # completed -> cancel : interdit (la consultation a eu lieu).
    appointment = _booked()
    appointment.confirm(NOW)
    appointment.complete()
    with pytest.raises(InvalidAppointmentTransitionError):
        appointment.cancel(cancelled_reason=None, now=NOW, cancelled_by="staff")

    # cancelled -> confirm et cancelled -> cancel : interdits.
    appointment = _booked()
    appointment.cancel(cancelled_reason="Empeche", now=NOW, cancelled_by="staff")
    with pytest.raises(InvalidAppointmentTransitionError):
        appointment.confirm(NOW)
    with pytest.raises(InvalidAppointmentTransitionError):
        appointment.cancel(cancelled_reason=None, now=NOW, cancelled_by="staff")


def test_annulation_depuis_pending_et_confirmed() -> None:
    for confirm_first in (False, True):
        appointment = _booked()
        if confirm_first:
            appointment.confirm(NOW)
        event = appointment.cancel(cancelled_reason="Imprevu", now=NOW, cancelled_by="staff")
        assert appointment.status is AppointmentStatus.CANCELLED
        assert appointment.cancelled_reason == "Imprevu"
        assert event.cancelled_by == "staff"


def test_annulation_owner_frontiere_24h() -> None:
    """A exactement 24 h : encore possible ; une seconde de moins : refuse."""
    at_boundary = _booked(starts_in=timedelta(hours=24))
    event = at_boundary.cancel_by_owner(cancelled_reason=None, now=NOW)
    assert event.cancelled_by == "owner"

    too_late = _booked(starts_in=timedelta(hours=23, minutes=59, seconds=59))
    with pytest.raises(CancellationTooLateError):
        too_late.cancel_by_owner(cancelled_reason=None, now=NOW)
