"""Tests unitaires du use case RegisterOwner (inscription proprietaire B2C).

Fakes en memoire uniquement : on valide la logique metier de l'inscription
d'un compte proprietaire -- creation, hachage, evenement outbox, refus d'un
doublon -- et la regle d'INDEPENDANCE des espaces de comptes (un email deja
utilise par le STAFF n'est pas bloquant cote owners).
"""

import pytest

from tests.unit.identity.fakes import (
    FakeBreachChecker,
    FakeHasher,
    FakeIdentityUnitOfWork,
    FixedClock,
)
from vetolib.identity.application.dto import RegisterClinicCommand, RegisterOwnerCommand
from vetolib.identity.application.use_cases import RegisterClinic, RegisterOwner
from vetolib.identity.domain.errors import (
    CompromisedPasswordError,
    EmailAlreadyExistsError,
)
from vetolib.identity.domain.events import OwnerRegistered
from vetolib.shared.domain.errors import DomainValidationError


def _command(email: str = "ana@exemple.fr") -> RegisterOwnerCommand:
    return RegisterOwnerCommand(
        email=email,
        password="croquettes-pour-rex",
        first_name="Ana",
        last_name="Martin",
        phone="+33601020304",
    )


async def test_register_cree_owner_et_evenement_outbox() -> None:
    """Chemin heureux : un compte + un evenement OwnerRegistered, un commit."""
    # Arrange
    uow = FakeIdentityUnitOfWork()
    use_case = RegisterOwner(lambda: uow, FakeHasher(), FixedClock(), FakeBreachChecker())

    # Act
    result = await use_case.execute(_command())

    # Assert : le compte est cree, mot de passe hashe (jamais en clair),
    # fiche par defaut (pas d'adresse, prefs email=on / sms=off).
    owner = uow.owner_store[result.owner_id]
    assert owner.email.value == "ana@exemple.fr"
    assert owner.hashed_password.value == "h:croquettes-pour-rex"
    assert owner.address is None
    assert owner.notification_preferences.email is True
    assert owner.notification_preferences.sms is False

    assert uow.commits == 1
    assert len(uow.events) == 1
    event = uow.events[0]
    assert isinstance(event, OwnerRegistered)
    assert event.event_type == "identity.owner_registered"
    assert event.payload() == {
        "owner_id": str(owner.id),
        "email": "ana@exemple.fr",
        "first_name": "Ana",
    }


async def test_register_refuse_un_email_deja_utilise_par_un_owner() -> None:
    """Doublon dans l'espace owners -> EmailAlreadyExistsError (409)."""
    uow = FakeIdentityUnitOfWork()
    use_case = RegisterOwner(lambda: uow, FakeHasher(), FixedClock(), FakeBreachChecker())
    await use_case.execute(_command())

    # Casse differente, meme email une fois normalise par le VO Email.
    with pytest.raises(EmailAlreadyExistsError):
        await use_case.execute(_command(email="Ana@Exemple.FR"))

    assert uow.commits == 1  # pas de second commit


async def test_un_email_staff_n_est_pas_bloquant_pour_un_owner() -> None:
    """Les espaces de comptes sont INDEPENDANTS : un veterinaire (compte
    staff dans users) peut aussi etre proprietaire (compte dans owners)
    avec le meme email. Ce test documente et verrouille la decision."""
    uow = FakeIdentityUnitOfWork()
    # Un compte STAFF existe avec cet email (inscription de clinique).
    await RegisterClinic(lambda: uow, FakeHasher(), FixedClock(), FakeBreachChecker()).execute(
        RegisterClinicCommand(
            clinic_name="Clinique des Lilas",
            phone=None,
            email="ana@exemple.fr",
            password="mot-de-passe-staff",
            first_name="Ana",
            last_name="Martin",
        )
    )

    # Le MEME email s'inscrit comme proprietaire : accepte.
    result = await RegisterOwner(
        lambda: uow, FakeHasher(), FixedClock(), FakeBreachChecker()
    ).execute(_command())
    assert result.owner_id in uow.owner_store


async def test_un_mot_de_passe_compromis_est_refuse() -> None:
    """Contrepartie de l'abandon des regles de composition : un mot de passe
    parfaitement conforme peut etre deja connu de tous les attaquants."""
    uow = FakeIdentityUnitOfWork()
    breaches = FakeBreachChecker({"croquettes-pour-rex"})
    use_case = RegisterOwner(lambda: uow, FakeHasher(), FixedClock(), breaches)

    with pytest.raises(CompromisedPasswordError):
        await use_case.execute(_command())

    # Rien n'a ete ecrit : ni compte, ni evenement, ni commit.
    assert uow.owner_store == {}
    assert uow.commits == 0


async def test_un_mot_de_passe_trop_court_ne_coute_aucun_appel_reseau() -> None:
    """L'ordre des controles compte : la forme d'abord (gratuite), la
    compromission ensuite (un appel a un service tiers). Verifier un mot de
    passe deja refuse serait payer pour rien -- et exposerait l'inscription
    a la latence d'un tiers meme dans le cas le plus banal."""
    uow = FakeIdentityUnitOfWork()
    breaches = FakeBreachChecker()
    use_case = RegisterOwner(lambda: uow, FakeHasher(), FixedClock(), breaches)

    with pytest.raises(DomainValidationError):
        await use_case.execute(
            RegisterOwnerCommand(
                email="ana@exemple.fr",
                password="court",
                first_name="Ana",
                last_name="Martin",
                phone=None,
            )
        )

    assert breaches.calls == []
