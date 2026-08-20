import pytest

from tests.unit.identity.fakes import FakeHasher, FakeIdentityUnitOfWork, FixedClock
from vetolib.identity.application.dto import RegisterClinicCommand
from vetolib.identity.application.use_cases import RegisterClinic
from vetolib.identity.domain.errors import EmailAlreadyExistsError
from vetolib.identity.domain.events import ClinicRegistered
from vetolib.identity.domain.value_objects import Role


def _command(email: str = "manager@clinique.fr") -> RegisterClinicCommand:
    return RegisterClinicCommand(
        clinic_name="Clinique des Lilas",
        phone="+33102030405",
        email=email,
        password="correct-horse-battery",
        first_name="Ana",
        last_name="Martin",
    )


async def test_register_cree_clinic_user_gerant_et_evenement_outbox() -> None:
    uow = FakeIdentityUnitOfWork()
    use_case = RegisterClinic(lambda: uow, FakeHasher(), FixedClock())

    result = await use_case.execute(_command())

    clinic = uow.clinic_store[result.clinic_id]
    assert clinic.name == "Clinique des Lilas"

    user = uow.user_store[result.user_id]
    assert user.clinic_id == clinic.id
    assert user.role is Role.MANAGER
    # Le mot de passe n'est jamais stocké en clair.
    assert user.hashed_password.value == "h:correct-horse-battery"

    assert uow.commits == 1
    assert len(uow.events) == 1
    event = uow.events[0]
    assert isinstance(event, ClinicRegistered)
    assert event.event_type == "identity.clinic_registered"
    assert event.payload()["manager_email"] == "manager@clinique.fr"


async def test_register_refuse_un_email_deja_utilise() -> None:
    uow = FakeIdentityUnitOfWork()
    use_case = RegisterClinic(lambda: uow, FakeHasher(), FixedClock())
    await use_case.execute(_command())

    with pytest.raises(EmailAlreadyExistsError):
        await use_case.execute(_command(email="Manager@Clinique.FR"))

    assert uow.commits == 1  # pas de second commit
