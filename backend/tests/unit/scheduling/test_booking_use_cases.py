"""Tests unitaires des use cases de reservation et d'annulation en ligne.

Points de securite verrouilles ici (avec fakes) :
- revalidation du creneau (non aligne ou pris -> SlotUnavailableError) ;
- appartenance de l'animal (le pet d'un autre -> PetNotFoundError) ;
- annulation : le rendez-vous d'un autre owner est INTROUVABLE (404).
"""

import uuid
from datetime import UTC, datetime, time, timedelta

import pytest

from tests.unit.scheduling.fakes import FakeSchedulingUnitOfWork, FixedClock
from vetolib.patients.domain.errors import PetNotFoundError
from vetolib.scheduling.application.dto import (
    ClinicInfo,
    OwnerBookAppointmentCommand,
    PetInfo,
)
from vetolib.scheduling.application.use_cases import (
    BookAppointmentByOwner,
    CancelAppointmentByOwner,
)
from vetolib.scheduling.domain.appointment_type import AppointmentType
from vetolib.scheduling.domain.errors import (
    AppointmentNotFoundError,
    SlotUnavailableError,
)
from vetolib.scheduling.domain.resource import Resource
from vetolib.scheduling.domain.value_objects import AppointmentStatus, WeeklyTimeRange
from vetolib.scheduling.domain.weekly_schedule import WeeklySchedule

CLINIC_ID = uuid.uuid4()
OWNER_ID = uuid.uuid4()
PET_ID = uuid.uuid4()
# Lundi 2026-01-12 ; horaire 09:00-12:00 Paris (hiver, UTC+1) -> 08:00Z-11:00Z.
NOW = datetime(2026, 1, 10, 12, 0, tzinfo=UTC)
VALID_SLOT_START = datetime(2026, 1, 12, 9, 0, tzinfo=UTC)  # 10:00 Paris, aligne


def _uow() -> tuple[FakeSchedulingUnitOfWork, uuid.UUID, uuid.UUID]:
    """Une clinique configuree : 1 praticien, 1 type 30 min, horaire lundi."""
    uow = FakeSchedulingUnitOfWork()
    uow.clinic_store[CLINIC_ID] = ClinicInfo(
        id=CLINIC_ID, name="Clinique des Lilas", timezone="Europe/Paris"
    )
    uow.pet_store[PET_ID] = PetInfo(id=PET_ID, owner_id=OWNER_ID, name="Rex")
    resource = Resource.create(clinic_id=CLINIC_ID, name="Dr Martin", user_id=None, now=NOW)
    uow.resource_store[resource.id] = resource
    appointment_type = AppointmentType.create(
        clinic_id=CLINIC_ID, name="Consultation", duration_minutes=30, now=NOW
    )
    uow.type_store[appointment_type.id] = appointment_type
    schedule = WeeklySchedule.create(
        clinic_id=CLINIC_ID,
        resource_id=resource.id,
        slot=WeeklyTimeRange(weekday=0, start_time=time(9, 0), end_time=time(12, 0)),
        now=NOW,
    )
    uow.schedule_store[schedule.id] = schedule
    return uow, resource.id, appointment_type.id


def _use_case(uow: FakeSchedulingUnitOfWork) -> BookAppointmentByOwner:
    # La meme UoW fake sert les deux modes (tenant et systeme) : en unit, on
    # teste la LOGIQUE, pas la separation des sessions (couverte en integration).
    return BookAppointmentByOwner(lambda _clinic_id: uow, lambda: uow, FixedClock(NOW))


def _command(
    resource_id: uuid.UUID,
    type_id: uuid.UUID,
    *,
    starts_at: datetime = VALID_SLOT_START,
    pet_id: uuid.UUID = PET_ID,
) -> OwnerBookAppointmentCommand:
    return OwnerBookAppointmentCommand(
        owner_id=OWNER_ID,
        clinic_id=CLINIC_ID,
        appointment_type_id=type_id,
        resource_id=resource_id,
        starts_at=starts_at,
        pet_id=pet_id,
        reason="Boiterie",
    )


async def test_booking_nominal_pending_et_evenement() -> None:
    uow, resource_id, type_id = _uow()
    dto = await _use_case(uow).execute(_command(resource_id, type_id))

    assert dto.status is AppointmentStatus.PENDING
    assert dto.owner_id == OWNER_ID
    assert dto.ends_at == VALID_SLOT_START + timedelta(minutes=30)
    assert uow.commits == 1
    assert [e.event_type for e in uow.events] == ["scheduling.appointment_booked"]


async def test_creneau_non_aligne_refuse() -> None:
    """10:07 n'est pas sur la grille de 15 min : SlotUnavailableError."""
    uow, resource_id, type_id = _uow()
    with pytest.raises(SlotUnavailableError):
        await _use_case(uow).execute(
            _command(resource_id, type_id, starts_at=datetime(2026, 1, 12, 9, 7, tzinfo=UTC))
        )
    assert uow.commits == 0


async def test_creneau_deja_pris_refuse() -> None:
    """Un premier booking occupe le creneau : le second est refuse AVANT
    l'insertion (la contrainte EXCLUDE resterait l'arbitre en cas de course)."""
    uow, resource_id, type_id = _uow()
    use_case = _use_case(uow)
    await use_case.execute(_command(resource_id, type_id))

    other_owner = uuid.uuid4()
    other_pet = uuid.uuid4()
    uow.pet_store[other_pet] = PetInfo(id=other_pet, owner_id=other_owner, name="Mimi")
    with pytest.raises(SlotUnavailableError):
        await use_case.execute(
            OwnerBookAppointmentCommand(
                owner_id=other_owner,
                clinic_id=CLINIC_ID,
                appointment_type_id=type_id,
                resource_id=resource_id,
                starts_at=VALID_SLOT_START,
                pet_id=other_pet,
                reason=None,
            )
        )


async def test_pet_d_un_autre_owner_refuse() -> None:
    """L'animal designe doit appartenir a l'owner du TOKEN."""
    uow, resource_id, type_id = _uow()
    stranger_pet = uuid.uuid4()
    uow.pet_store[stranger_pet] = PetInfo(id=stranger_pet, owner_id=uuid.uuid4(), name="PasAMoi")
    with pytest.raises(PetNotFoundError):
        await _use_case(uow).execute(_command(resource_id, type_id, pet_id=stranger_pet))
    assert uow.commits == 0


async def test_annulation_du_rdv_d_un_autre_introuvable() -> None:
    """get_for_owner filtre en SQL : le RDV d'un autre owner -> 404."""
    uow, resource_id, type_id = _uow()
    dto = await _use_case(uow).execute(_command(resource_id, type_id))

    cancel = CancelAppointmentByOwner(lambda: uow, FixedClock(NOW))
    with pytest.raises(AppointmentNotFoundError):
        await cancel.execute(dto.id, owner_id=uuid.uuid4())

    # Le proprietaire legitime, lui, annule (RDV a J+2 : regle 24 h OK).
    cancelled = await cancel.execute(dto.id, owner_id=OWNER_ID)
    assert cancelled.status is AppointmentStatus.CANCELLED
    assert [e.event_type for e in uow.events][-1] == "scheduling.appointment_cancelled"
