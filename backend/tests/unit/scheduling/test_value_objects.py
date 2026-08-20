"""Tests des value objects scheduling : bornes et invariants."""

from datetime import UTC, datetime, time

import pytest

from vetolib.scheduling.domain.appointment_type import AppointmentType
from vetolib.scheduling.domain.value_objects import TimeSlot, WeeklyTimeRange
from vetolib.shared.domain.errors import DomainValidationError


def test_weekly_time_range_valide() -> None:
    slot = WeeklyTimeRange(weekday=0, start_time=time(9, 0), end_time=time(12, 0))
    assert slot.weekday == 0


@pytest.mark.parametrize("weekday", [-1, 7])
def test_weekly_time_range_weekday_hors_bornes(weekday: int) -> None:
    with pytest.raises(DomainValidationError):
        WeeklyTimeRange(weekday=weekday, start_time=time(9, 0), end_time=time(12, 0))


def test_weekly_time_range_fin_avant_debut() -> None:
    with pytest.raises(DomainValidationError):
        WeeklyTimeRange(weekday=0, start_time=time(12, 0), end_time=time(9, 0))
    with pytest.raises(DomainValidationError):
        WeeklyTimeRange(weekday=0, start_time=time(9, 0), end_time=time(9, 0))


def test_time_slot_overlaps_bornes_demi_ouvertes() -> None:
    """Deux creneaux ADJACENTS ne se chevauchent pas (10:00-10:30 puis
    10:30-11:00) : meme convention que le tstzrange de la contrainte EXCLUDE."""
    base = datetime(2026, 8, 20, 10, 0, tzinfo=UTC)
    first = TimeSlot(starts_at=base, ends_at=base.replace(minute=30))
    adjacent = TimeSlot(starts_at=base.replace(minute=30), ends_at=base.replace(hour=11, minute=0))
    overlapping = TimeSlot(starts_at=base.replace(minute=15), ends_at=base.replace(minute=45))

    assert not first.overlaps(adjacent)
    assert not adjacent.overlaps(first)
    assert first.overlaps(overlapping)
    assert overlapping.overlaps(first)


def test_time_slot_exige_des_datetimes_aware() -> None:
    with pytest.raises(DomainValidationError):
        TimeSlot(
            starts_at=datetime(2026, 8, 20, 10, 0),  # naive
            ends_at=datetime(2026, 8, 20, 10, 30, tzinfo=UTC),
        )


@pytest.mark.parametrize("duration", [0, -5, 7, 13])
def test_appointment_type_duree_invalide(duration: int) -> None:
    """La duree doit etre un multiple de 5 strictement positif (grille de 15
    min du calcul de creneaux)."""
    import uuid

    with pytest.raises(DomainValidationError):
        AppointmentType.create(
            clinic_id=uuid.uuid4(),
            name="Consultation",
            duration_minutes=duration,
            now=datetime(2026, 8, 20, tzinfo=UTC),
        )
