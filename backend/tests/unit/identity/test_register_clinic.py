"""Tests unitaires du use case RegisterClinic (inscription d'une clinique).

Fakes en mémoire uniquement (voir fakes.py) : pas de PostgreSQL ni d'Argon2.
On prouve la logique métier de l'inscription : création atomique du tenant
(clinic) + premier user gérant, hachage du mot de passe, émission de
l'événement outbox, et refus d'un email déjà pris. Le comportement SQL réel
(index unique partiel, course concurrente) est couvert en intégration.
"""

import pytest

from tests.unit.identity.fakes import FakeHasher, FakeIdentityUnitOfWork, FixedClock
from vetolib.identity.application.dto import RegisterClinicCommand
from vetolib.identity.application.use_cases import RegisterClinic
from vetolib.identity.domain.errors import EmailAlreadyExistsError
from vetolib.identity.domain.events import ClinicRegistered
from vetolib.identity.domain.value_objects import Role


def _command(email: str = "manager@clinique.fr") -> RegisterClinicCommand:
    """Commande d'inscription type ; l'email est paramétrable pour tester
    les variantes (doublon, casse différente)."""
    return RegisterClinicCommand(
        clinic_name="Clinique des Lilas",
        phone="+33102030405",
        email=email,
        password="correct-horse-battery",
        first_name="Ana",
        last_name="Martin",
    )


async def test_register_cree_clinic_user_gerant_et_evenement_outbox() -> None:
    """Chemin heureux : une inscription = un tenant + son gérant + un
    événement destiné à l'outbox, le tout validé en un seul commit."""
    # Arrange : UoW vide et use case câblé sur les fakes ("lambda: uow" joue
    # la factory du port tout en gardant l'instance inspectable par le test).
    uow = FakeIdentityUnitOfWork()
    use_case = RegisterClinic(lambda: uow, FakeHasher(), FixedClock())

    # Act
    result = await use_case.execute(_command())

    # Assert : la clinique (le tenant) est créée...
    clinic = uow.clinic_store[result.clinic_id]
    assert clinic.name == "Clinique des Lilas"

    # ... et son premier user, rattaché au tenant (clé de partition RLS)
    # avec le rôle le plus élevé : c'est lui qui administrera la clinique.
    user = uow.user_store[result.user_id]
    assert user.clinic_id == clinic.id
    assert user.role is Role.MANAGER
    # Le mot de passe n'est jamais stocké en clair.
    assert user.hashed_password.value == "h:correct-horse-battery"

    # Un commit unique : clinic, user et événement partent dans la même
    # transaction. C'est le coeur du pattern outbox : l'événement est écrit
    # avec les données (atomique), le relais TaskIQ le publiera ensuite --
    # pas d'événement fantôme si la transaction échoue, pas d'oubli si le
    # broker est indisponible au moment du register.
    assert uow.commits == 1
    assert len(uow.events) == 1
    event = uow.events[0]
    assert isinstance(event, ClinicRegistered)
    assert event.event_type == "identity.clinic_registered"
    assert event.payload()["manager_email"] == "manager@clinique.fr"


async def test_register_refuse_un_email_deja_utilise() -> None:
    """Le contrôle applicatif d'unicité rejette un email déjà pris.

    (Il reste une fenêtre de course entre deux requêtes simultanées : ce
    cas-là est arbitré par l'index unique de PostgreSQL, testé en
    intégration -- ici on ne valide que le contrôle applicatif.)
    """
    # Arrange : une première inscription occupe l'email.
    uow = FakeIdentityUnitOfWork()
    use_case = RegisterClinic(lambda: uow, FakeHasher(), FixedClock())
    await use_case.execute(_command())

    # Act + Assert : casse différente, même email une fois normalisé par le
    # value object Email -> refus.
    with pytest.raises(EmailAlreadyExistsError):
        await use_case.execute(_command(email="Manager@Clinique.FR"))

    assert uow.commits == 1  # pas de second commit
