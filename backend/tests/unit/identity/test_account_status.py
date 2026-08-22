"""Tests unitaires du statut des comptes : suspension et desactivation.

Deux niveaux, sans IO :

1. les methodes de domaine (Clinic.suspend/reactivate,
   Owner.deactivate/reactivate) et leur IDEMPOTENCE -- un second appel ne
   doit ni lever d'erreur ni produire un evenement, sinon le back-office
   afficherait une alerte rouge sur un double-clic et l'outbox recevrait un
   fait qui ne s'est pas produit ;
2. les SIX points ou le statut coupe reellement un acces. Ce sont eux qui
   font la difference entre une colonne booleenne decorative et une vraie
   suspension : login, rotation du refresh et /me, pour le staff comme pour
   les proprietaires. Le septieme point (l'annuaire public) est verifie ici
   aussi, via ListPublicClinics.

L'ORDRE des controles au login est une propriete de securite testee
explicitement : mot de passe d'abord, etat du compte ensuite. Inverser
transformerait le message "clinique suspendue" en oracle permettant de
savoir quels emails existent.
"""

import uuid
from datetime import UTC, datetime

import pytest

from tests.unit.identity.fakes import (
    FakeBreachChecker,
    FakeHasher,
    FakeIdentityUnitOfWork,
    FakeOwnerTokenProvider,
    FakeTokenProvider,
    FixedClock,
)
from vetolib.identity.application.dto import (
    LoginCommand,
    RegisterClinicCommand,
    RegisterOwnerCommand,
)
from vetolib.identity.application.use_cases import (
    AuthenticateOwner,
    AuthenticateUser,
    GetCurrentOwner,
    GetCurrentUser,
    ListPublicClinics,
    RefreshOwnerToken,
    RefreshToken,
    RegisterClinic,
    RegisterOwner,
)
from vetolib.identity.domain.clinic import Clinic
from vetolib.identity.domain.errors import (
    ClinicSuspendedError,
    InvalidCredentialsError,
    OwnerInactiveError,
)
from vetolib.identity.domain.owner import Owner
from vetolib.identity.domain.value_objects import Email, HashedPassword

_NOW = datetime(2026, 8, 22, 9, 0, tzinfo=UTC)
_MOT_DE_PASSE = "correct-horse-battery"

# --- Methodes de domaine ----------------------------------------------------


def _clinique(*, active: bool = True) -> Clinic:
    return Clinic(
        id=uuid.uuid4(),
        created_at=_NOW,
        name="Clinique des Lilas",
        email=Email("contact@lilas.fr"),
        phone=None,
        is_active=active,
    )


def _proprietaire(*, active: bool = True) -> Owner:
    return Owner(
        id=uuid.uuid4(),
        created_at=_NOW,
        email=Email("ana@exemple.fr"),
        hashed_password=HashedPassword("h:peu-importe"),
        first_name="Ana",
        last_name="Martin",
        is_active=active,
    )


def test_suspendre_une_clinique_active_produit_un_evenement() -> None:
    clinique = _clinique()

    evenement = clinique.suspend(_NOW)

    assert clinique.is_active is False
    assert evenement is not None
    assert evenement.event_type == "identity.clinic_suspended"
    assert evenement.payload() == {
        "clinic_id": str(clinique.id),
        "clinic_name": "Clinique des Lilas",
    }


def test_suspendre_une_clinique_deja_suspendue_ne_fait_rien() -> None:
    """Idempotence : ni erreur, ni evenement -- le back-office repond 200."""
    clinique = _clinique(active=False)

    assert clinique.suspend(_NOW) is None
    assert clinique.is_active is False


def test_reactiver_une_clinique_suspendue_produit_un_evenement() -> None:
    clinique = _clinique(active=False)

    evenement = clinique.reactivate(_NOW)

    assert clinique.is_active is True
    assert evenement is not None
    assert evenement.event_type == "identity.clinic_reactivated"


def test_reactiver_une_clinique_deja_active_ne_fait_rien() -> None:
    clinique = _clinique()

    assert clinique.reactivate(_NOW) is None
    assert clinique.is_active is True


def test_suspension_ne_touche_pas_au_soft_delete() -> None:
    """La distinction centrale : is_active gele, deleted_at efface.

    Confondre les deux libererait l'email dans l'index unique partiel
    uq_clinics_email_active, et la reactivation deviendrait impossible des
    qu'un tiers l'aurait repris.
    """
    clinique = _clinique()

    clinique.suspend(_NOW)

    assert clinique.deleted_at is None


def test_desactiver_puis_reactiver_un_proprietaire() -> None:
    proprietaire = _proprietaire()

    desactivation = proprietaire.deactivate(_NOW)
    assert proprietaire.is_active is False
    assert desactivation is not None
    assert desactivation.event_type == "identity.owner_deactivated"
    # Idempotence dans les deux sens.
    assert proprietaire.deactivate(_NOW) is None

    reactivation = proprietaire.reactivate(_NOW)
    assert proprietaire.is_active is True
    assert reactivation is not None
    assert reactivation.event_type == "identity.owner_reactivated"
    assert proprietaire.reactivate(_NOW) is None


# --- Cote staff : une clinique suspendue coupe tout son personnel -----------


async def _uow_avec_clinique() -> tuple[FakeIdentityUnitOfWork, uuid.UUID, uuid.UUID]:
    """Arrange : une clinique et son gerant, crees par le vrai use case."""
    uow = FakeIdentityUnitOfWork()
    resultat = await RegisterClinic(
        lambda: uow, FakeHasher(), FixedClock(), FakeBreachChecker()
    ).execute(
        RegisterClinicCommand(
            clinic_name="Clinique des Lilas",
            phone=None,
            email="manager@lilas.fr",
            password=_MOT_DE_PASSE,
            first_name="Ana",
            last_name="Martin",
        )
    )
    return uow, resultat.clinic_id, resultat.user_id


def _suspendre(uow: FakeIdentityUnitOfWork, clinic_id: uuid.UUID) -> None:
    uow.clinic_store[clinic_id].suspend(_NOW)


async def test_login_staff_refuse_si_la_clinique_est_suspendue() -> None:
    uow, clinic_id, _ = await _uow_avec_clinique()
    _suspendre(uow, clinic_id)
    use_case = AuthenticateUser(lambda: uow, FakeHasher(), FakeTokenProvider())

    with pytest.raises(ClinicSuspendedError):
        await use_case.execute(LoginCommand(email="manager@lilas.fr", password=_MOT_DE_PASSE))


async def test_login_staff_verifie_le_mot_de_passe_avant_la_suspension() -> None:
    """Propriete de securite : l'ordre des controles ne doit pas s'inverser.

    Avec un mauvais mot de passe sur une clinique suspendue, la reponse doit
    rester le generique InvalidCredentialsError. Sinon un attaquant apprend
    qu'un compte existe (et que sa clinique est suspendue) sans le connaitre.
    """
    uow, clinic_id, _ = await _uow_avec_clinique()
    _suspendre(uow, clinic_id)
    use_case = AuthenticateUser(lambda: uow, FakeHasher(), FakeTokenProvider())

    with pytest.raises(InvalidCredentialsError):
        await use_case.execute(LoginCommand(email="manager@lilas.fr", password="mauvais"))


async def test_refresh_staff_refuse_si_la_clinique_est_suspendue() -> None:
    """Sans ce controle, une session ouverte avant la suspension survivrait."""
    uow, clinic_id, user_id = await _uow_avec_clinique()
    _suspendre(uow, clinic_id)
    use_case = RefreshToken(lambda: uow, FakeTokenProvider())

    with pytest.raises(ClinicSuspendedError):
        await use_case.execute(f"refresh:{user_id}")


async def test_me_staff_refuse_si_la_clinique_est_suspendue() -> None:
    """Le controle rejoue a chaque requete : effet immediat, pas dans 15 min."""
    uow, clinic_id, user_id = await _uow_avec_clinique()
    _suspendre(uow, clinic_id)
    use_case = GetCurrentUser(lambda: uow, FakeTokenProvider())

    with pytest.raises(ClinicSuspendedError):
        await use_case.execute(f"access:{user_id}")


async def test_le_staff_retrouve_son_acces_apres_reactivation() -> None:
    uow, clinic_id, _ = await _uow_avec_clinique()
    _suspendre(uow, clinic_id)
    uow.clinic_store[clinic_id].reactivate(_NOW)
    use_case = AuthenticateUser(lambda: uow, FakeHasher(), FakeTokenProvider())

    _, current = await use_case.execute(
        LoginCommand(email="manager@lilas.fr", password=_MOT_DE_PASSE)
    )

    assert current.clinic_name == "Clinique des Lilas"


# --- Cote proprietaires -----------------------------------------------------


async def _uow_avec_proprietaire() -> tuple[FakeIdentityUnitOfWork, uuid.UUID]:
    uow = FakeIdentityUnitOfWork()
    resultat = await RegisterOwner(
        lambda: uow, FakeHasher(), FixedClock(), FakeBreachChecker()
    ).execute(
        RegisterOwnerCommand(
            email="ana@exemple.fr",
            password=_MOT_DE_PASSE,
            first_name="Ana",
            last_name="Martin",
            phone=None,
        )
    )
    return uow, resultat.owner_id


async def test_login_proprietaire_refuse_si_le_compte_est_desactive() -> None:
    uow, owner_id = await _uow_avec_proprietaire()
    uow.owner_store[owner_id].deactivate(_NOW)
    use_case = AuthenticateOwner(lambda: uow, FakeHasher(), FakeOwnerTokenProvider())

    with pytest.raises(OwnerInactiveError):
        await use_case.execute(LoginCommand(email="ana@exemple.fr", password=_MOT_DE_PASSE))


async def test_login_proprietaire_verifie_le_mot_de_passe_avant_le_statut() -> None:
    uow, owner_id = await _uow_avec_proprietaire()
    uow.owner_store[owner_id].deactivate(_NOW)
    use_case = AuthenticateOwner(lambda: uow, FakeHasher(), FakeOwnerTokenProvider())

    with pytest.raises(InvalidCredentialsError):
        await use_case.execute(LoginCommand(email="ana@exemple.fr", password="mauvais"))


async def test_refresh_proprietaire_refuse_si_le_compte_est_desactive() -> None:
    uow, owner_id = await _uow_avec_proprietaire()
    uow.owner_store[owner_id].deactivate(_NOW)
    use_case = RefreshOwnerToken(lambda: uow, FakeOwnerTokenProvider())

    with pytest.raises(OwnerInactiveError):
        await use_case.execute(f"owner_refresh:{owner_id}")


async def test_me_proprietaire_refuse_si_le_compte_est_desactive() -> None:
    uow, owner_id = await _uow_avec_proprietaire()
    uow.owner_store[owner_id].deactivate(_NOW)
    use_case = GetCurrentOwner(lambda: uow, FakeOwnerTokenProvider())

    with pytest.raises(OwnerInactiveError):
        await use_case.execute(f"owner_access:{owner_id}")


# --- Annuaire public --------------------------------------------------------


async def test_l_annuaire_public_exclut_les_cliniques_suspendues() -> None:
    """Une clinique gelee ne doit plus etre proposee a la reservation."""
    uow, clinic_id, _ = await _uow_avec_clinique()
    visible = _clinique()
    visible.name = "Clinique du Parc"
    uow.clinic_store[visible.id] = visible

    avant = await ListPublicClinics(lambda: uow).execute(limit=20, offset=0)
    assert {c.name for c in avant} == {"Clinique des Lilas", "Clinique du Parc"}

    _suspendre(uow, clinic_id)

    apres = await ListPublicClinics(lambda: uow).execute(limit=20, offset=0)
    assert [c.name for c in apres] == ["Clinique du Parc"]
