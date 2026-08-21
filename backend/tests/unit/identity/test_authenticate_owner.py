"""Tests unitaires du use case AuthenticateOwner (login proprietaire B2C).

Memes protections que le login staff, verifiees ici sur l'espace owner :
erreur generique unique (pas d'oracle d'existence), hash factice pour les
emails inconnus (temps constant), soft delete = compte invisible.
"""

import uuid

import pytest

from tests.unit.identity.fakes import (
    FakeBreachChecker,
    FakeHasher,
    FakeIdentityUnitOfWork,
    FakeOwnerTokenProvider,
    FixedClock,
)
from vetolib.identity.application.dto import LoginCommand, RegisterOwnerCommand
from vetolib.identity.application.use_cases import AuthenticateOwner, RegisterOwner
from vetolib.identity.domain.errors import InvalidCredentialsError
from vetolib.identity.domain.owner import Owner
from vetolib.identity.domain.value_objects import Email, HashedPassword


async def _uow_with_owner() -> FakeIdentityUnitOfWork:
    """Arrange partage : un compte proprietaire cree par le vrai use case."""
    uow = FakeIdentityUnitOfWork()
    await RegisterOwner(lambda: uow, FakeHasher(), FixedClock(), FakeBreachChecker()).execute(
        RegisterOwnerCommand(
            email="ana@exemple.fr",
            password="croquettes-pour-rex",
            first_name="Ana",
            last_name="Martin",
            phone=None,
        )
    )
    return uow


async def test_login_valide_retourne_tokens_et_profil() -> None:
    uow = await _uow_with_owner()
    use_case = AuthenticateOwner(lambda: uow, FakeHasher(), FakeOwnerTokenProvider())

    # Email avec une casse differente : normalise par le VO Email.
    pair, current = await use_case.execute(
        LoginCommand(email="Ana@Exemple.FR", password="croquettes-pour-rex")
    )

    assert pair.access_token.startswith("owner_access:")
    assert current.email == "ana@exemple.fr"
    assert current.first_name == "Ana"


async def test_mauvais_mot_de_passe_est_rejete() -> None:
    uow = await _uow_with_owner()
    use_case = AuthenticateOwner(lambda: uow, FakeHasher(), FakeOwnerTokenProvider())

    with pytest.raises(InvalidCredentialsError):
        await use_case.execute(LoginCommand(email="ana@exemple.fr", password="wrong"))


async def test_email_inconnu_verifie_un_hash_factice() -> None:
    """Anti-oracle temporel : meme cout et meme erreur qu'un mauvais mot de
    passe, prouve par l'espion verify_calls du FakeHasher."""
    uow = await _uow_with_owner()
    hasher = FakeHasher()
    use_case = AuthenticateOwner(lambda: uow, hasher, FakeOwnerTokenProvider())
    hasher.verify_calls.clear()

    with pytest.raises(InvalidCredentialsError):
        await use_case.execute(LoginCommand(email="inconnu@exemple.fr", password="whatever"))

    assert hasher.verify_calls == [("whatever", "h:dummy")]


async def test_owner_soft_deleted_est_rejete_comme_inexistant() -> None:
    """Revocation d'un owner = soft delete : au login, indistinguable d'un
    compte inexistant (meme erreur generique, hash factice verifie)."""
    from datetime import UTC, datetime

    uow = await _uow_with_owner()
    owner = next(iter(uow.owner_store.values()))
    owner.deleted_at = datetime(2026, 2, 1, tzinfo=UTC)
    use_case = AuthenticateOwner(lambda: uow, FakeHasher(), FakeOwnerTokenProvider())

    with pytest.raises(InvalidCredentialsError):
        await use_case.execute(LoginCommand(email="ana@exemple.fr", password="croquettes-pour-rex"))


async def test_un_mot_de_passe_non_conforme_a_la_politique_permet_toujours_de_se_connecter() -> (
    None
):
    """GARDE-FOU : la politique de mot de passe ne vaut qu'a la CREATION.

    Ce test protege les comptes anterieurs au durcissement de la regle. Le
    jour ou quelqu'un ajoutera par reflexe un PlainPassword() ou un appel au
    verificateur de fuites dans AuthenticateOwner, il verrouillera dehors
    toutes les personnes inscrites avant -- et donnera au passage un oracle
    a un attaquant, qui apprendrait quels comptes ont un vieux mot de passe.

    On fabrique donc l'entite a la main : le use case d'inscription, lui,
    refuserait ce mot de passe de six caracteres.
    """
    uow = FakeIdentityUnitOfWork()
    hasher = FakeHasher()
    ancien = Owner(
        id=uuid.uuid4(),
        created_at=FixedClock().now(),
        email=Email("vieux@exemple.fr"),
        hashed_password=HashedPassword(await hasher.hash("court1")),
        first_name="Ana",
        last_name="Martin",
    )
    await uow.owners.add(ancien)

    use_case = AuthenticateOwner(lambda: uow, hasher, FakeOwnerTokenProvider())
    _, current = await use_case.execute(LoginCommand(email="vieux@exemple.fr", password="court1"))

    assert current.email == "vieux@exemple.fr"
