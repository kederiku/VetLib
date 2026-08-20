import pytest

from tests.unit.identity.fakes import (
    FakeHasher,
    FakeIdentityUnitOfWork,
    FakeTokenProvider,
    FixedClock,
)
from vetolib.identity.application.dto import LoginCommand, RegisterClinicCommand
from vetolib.identity.application.use_cases import AuthenticateUser, RegisterClinic
from vetolib.identity.domain.errors import InvalidCredentialsError, UserInactiveError


async def _uow_with_account() -> FakeIdentityUnitOfWork:
    uow = FakeIdentityUnitOfWork()
    await RegisterClinic(lambda: uow, FakeHasher(), FixedClock()).execute(
        RegisterClinicCommand(
            clinic_name="Clinique des Lilas",
            phone=None,
            email="manager@clinique.fr",
            password="correct-horse-battery",
            first_name="Ana",
            last_name="Martin",
        )
    )
    return uow


async def test_login_valide_retourne_tokens_et_profil() -> None:
    uow = await _uow_with_account()
    use_case = AuthenticateUser(lambda: uow, FakeHasher(), FakeTokenProvider())

    pair, current = await use_case.execute(
        LoginCommand(email="Manager@Clinique.FR", password="correct-horse-battery")
    )

    assert pair.access_token.startswith("access:")
    assert current.email == "manager@clinique.fr"
    assert current.clinic_name == "Clinique des Lilas"
    assert "clinic:manage" in current.permissions


async def test_mauvais_mot_de_passe_est_rejete() -> None:
    uow = await _uow_with_account()
    use_case = AuthenticateUser(lambda: uow, FakeHasher(), FakeTokenProvider())

    with pytest.raises(InvalidCredentialsError):
        await use_case.execute(LoginCommand(email="manager@clinique.fr", password="wrong"))


async def test_email_inconnu_verifie_un_hash_factice() -> None:
    """Même coût de vérification et même erreur que pour un mauvais mot de
    passe : pas d'oracle d'existence de compte."""
    uow = await _uow_with_account()
    hasher = FakeHasher()
    use_case = AuthenticateUser(lambda: uow, hasher, FakeTokenProvider())
    hasher.verify_calls.clear()

    with pytest.raises(InvalidCredentialsError):
        await use_case.execute(LoginCommand(email="inconnu@clinique.fr", password="whatever"))

    assert hasher.verify_calls == [("whatever", "h:dummy")]


async def test_compte_desactive_est_rejete() -> None:
    uow = await _uow_with_account()
    user = next(iter(uow.user_store.values()))
    user.deactivate()
    use_case = AuthenticateUser(lambda: uow, FakeHasher(), FakeTokenProvider())

    with pytest.raises(UserInactiveError):
        await use_case.execute(
            LoginCommand(email="manager@clinique.fr", password="correct-horse-battery")
        )
