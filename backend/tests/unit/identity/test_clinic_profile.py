"""Tests unitaires du profil clinique : VO Timezone et fiche /clinics/me.

Deux niveaux, sans IO :
- le value object Timezone (validation zoneinfo à la construction) ;
- les use cases GetClinicProfile / UpdateClinicProfile sur fakes, dont les
  deux gardes-fous de la mise à jour : timezone invalide rejetée, et adresse
  "tout ou rien" (défense en profondeur, même règle que la fiche owner).
"""

import uuid
from datetime import UTC, datetime

import pytest

from tests.unit.identity.fakes import FakeIdentityUnitOfWork
from vetolib.identity.application.dto import UpdateClinicProfileCommand
from vetolib.identity.application.use_cases import GetClinicProfile, UpdateClinicProfile
from vetolib.identity.domain.clinic import Clinic
from vetolib.identity.domain.errors import ClinicNotFoundError
from vetolib.identity.domain.value_objects import Email, Timezone
from vetolib.shared.domain.errors import DomainValidationError

# --- VO Timezone ------------------------------------------------------------


@pytest.mark.parametrize("value", ["Europe/Paris", "America/New_York", "UTC"])
def test_timezone_accepte_les_identifiants_iana_valides(value: str) -> None:
    assert Timezone(value).value == value


@pytest.mark.parametrize("value", ["Mars/Olympus", "", "Europe/", "n'importe quoi"])
def test_timezone_rejette_les_identifiants_inconnus(value: str) -> None:
    """zoneinfo est l'arbitre : tout identifiant hors base IANA -> 422."""
    with pytest.raises(DomainValidationError):
        Timezone(value)


# --- Use cases de la fiche clinique -----------------------------------------


def _clinic(uow: FakeIdentityUnitOfWork) -> Clinic:
    """Insère une clinique fraîche (fiche vierge : sans adresse, tz défaut)."""
    clinic = Clinic(
        id=uuid.uuid4(),
        created_at=datetime(2026, 1, 1, 9, 0, tzinfo=UTC),
        name="Clinique des Lilas",
        email=Email("contact@lilas.fr"),
        phone=None,
    )
    uow.clinic_store[clinic.id] = clinic
    return clinic


def _command(
    clinic_id: uuid.UUID,
    *,
    timezone: str = "Europe/Paris",
    address_line1: str | None = "12 rue des Lilas",
    postal_code: str | None = "75011",
    city: str | None = "Paris",
) -> UpdateClinicProfileCommand:
    return UpdateClinicProfileCommand(
        clinic_id=clinic_id,
        name="Clinique des Lilas",
        phone="+33140000000",
        address_line1=address_line1,
        address_line2=None,
        postal_code=postal_code,
        city=city,
        country="FR",
        timezone=timezone,
    )


async def test_update_profile_applique_adresse_et_timezone() -> None:
    """Chemin heureux : la fiche est mise à jour, l'email reste intact."""
    uow = FakeIdentityUnitOfWork()
    clinic = _clinic(uow)
    assert clinic.timezone == "Europe/Paris"  # défaut avant toute édition

    profile = await UpdateClinicProfile(lambda: uow).execute(
        _command(clinic.id, timezone="Europe/Brussels")
    )

    assert profile.timezone == "Europe/Brussels"
    assert profile.address is not None and profile.address.city == "Paris"
    # L'email n'est PAS modifiable ici : Clinic.update_profile ne l'accepte
    # pas, la fiche retournée porte toujours l'email d'inscription.
    assert profile.email == "contact@lilas.fr"
    assert uow.clinic_store[clinic.id].timezone == "Europe/Brussels"
    assert uow.commits == 1


async def test_update_profile_rejette_une_timezone_invalide() -> None:
    """ "Mars/Olympus" n'est pas un fuseau IANA -> 422 domaine, rien de commité."""
    uow = FakeIdentityUnitOfWork()
    clinic = _clinic(uow)

    with pytest.raises(DomainValidationError):
        await UpdateClinicProfile(lambda: uow).execute(_command(clinic.id, timezone="Mars/Olympus"))

    assert uow.clinic_store[clinic.id].timezone == "Europe/Paris"  # intact
    assert uow.commits == 0


async def test_update_profile_rejette_une_adresse_partielle() -> None:
    """Tout-ou-rien : line1 sans code postal ni ville -> DomainValidationError.

    Le schéma Pydantic (AddressPayload) impose déjà la complétude côté HTTP ;
    ce test verrouille la défense en profondeur du use case (le VO Address
    refuse la demi-adresse même si la frontière HTTP était contournée).
    """
    uow = FakeIdentityUnitOfWork()
    clinic = _clinic(uow)

    with pytest.raises(DomainValidationError):
        await UpdateClinicProfile(lambda: uow).execute(
            _command(clinic.id, postal_code=None, city=None)
        )

    assert uow.clinic_store[clinic.id].address is None  # pas de demi-adresse
    assert uow.commits == 0


async def test_update_profile_sans_adresse_efface_l_adresse() -> None:
    """PUT = remplacement complet : un body sans bloc adresse la retire."""
    uow = FakeIdentityUnitOfWork()
    clinic = _clinic(uow)
    await UpdateClinicProfile(lambda: uow).execute(_command(clinic.id))
    assert uow.clinic_store[clinic.id].address is not None

    await UpdateClinicProfile(lambda: uow).execute(
        _command(clinic.id, address_line1=None, postal_code=None, city=None)
    )

    assert uow.clinic_store[clinic.id].address is None


async def test_get_clinic_profile_introuvable() -> None:
    """Un token référençant une clinique disparue -> ClinicNotFoundError (404)."""
    uow = FakeIdentityUnitOfWork()

    with pytest.raises(ClinicNotFoundError):
        await GetClinicProfile(lambda: uow).execute(uuid.uuid4())
