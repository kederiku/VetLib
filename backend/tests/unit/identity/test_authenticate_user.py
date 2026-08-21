"""Tests unitaires du use case AuthenticateUser (login).

Uniquement des fakes en mémoire (voir fakes.py) : ni base de données, ni
Argon2, ni JWT réels. On valide ici la LOGIQUE du login -- identifiants
corrects, mot de passe faux, email inconnu, compte désactivé -- pas la
plomberie HTTP/SQL, couverte par tests/integration/test_auth_flow.py.

Chaque test suit la structure Arrange (préparer un compte via le use case
RegisterClinic), Act (exécuter AuthenticateUser), Assert (résultat ou
exception du domaine attendue).
"""

import pytest

from tests.unit.identity.fakes import (
    FakeBreachChecker,
    FakeHasher,
    FakeIdentityUnitOfWork,
    FakeTokenProvider,
    FixedClock,
)
from vetolib.identity.application.dto import LoginCommand, RegisterClinicCommand
from vetolib.identity.application.use_cases import AuthenticateUser, RegisterClinic
from vetolib.identity.domain.errors import InvalidCredentialsError, UserInactiveError


async def _uow_with_account() -> FakeIdentityUnitOfWork:
    """Arrange partagé : un UoW contenant une clinique et son gérant.

    Le compte est créé par le vrai use case RegisterClinic (et non en
    insérant des objets à la main) : les tests de login partent ainsi d'un
    état construit par les mêmes règles métier que la production.
    Le "lambda: uow" satisfait le port IdentityUoWFactory (une factory qui
    fabrique un UoW par exécution) tout en renvoyant toujours la même
    instance, que le test garde sous la main pour inspecter son contenu.
    """
    uow = FakeIdentityUnitOfWork()
    await RegisterClinic(lambda: uow, FakeHasher(), FixedClock(), FakeBreachChecker()).execute(
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
    """Chemin heureux : bons identifiants -> paire de tokens + profil."""
    # Arrange
    uow = await _uow_with_account()
    use_case = AuthenticateUser(lambda: uow, FakeHasher(), FakeTokenProvider())

    # Act -- email saisi avec une casse différente de l'inscription : le
    # value object Email normalise (trim + lowercase), le login reste valide.
    pair, current = await use_case.execute(
        LoginCommand(email="Manager@Clinique.FR", password="correct-horse-battery")
    )

    # Assert : tokens émis et profil "fat token" (permissions du gérant).
    assert pair.access_token.startswith("access:")
    assert current.email == "manager@clinique.fr"
    assert current.clinic_name == "Clinique des Lilas"
    assert "clinic:manage" in current.permissions


async def test_mauvais_mot_de_passe_est_rejete() -> None:
    """Mot de passe faux -> InvalidCredentialsError, la même erreur que pour
    un email inconnu : la réponse ne dit pas lequel des deux est faux."""
    # Arrange
    uow = await _uow_with_account()
    use_case = AuthenticateUser(lambda: uow, FakeHasher(), FakeTokenProvider())

    # Act + Assert
    with pytest.raises(InvalidCredentialsError):
        await use_case.execute(LoginCommand(email="manager@clinique.fr", password="wrong"))


async def test_email_inconnu_verifie_un_hash_factice() -> None:
    """Même coût de vérification et même erreur que pour un mauvais mot de
    passe : pas d'oracle d'existence de compte.

    Sans cette parade, un attaquant pourrait deviner quels emails ont un
    compte en chronométrant les réponses : email inconnu = réponse rapide
    (pas de hash à vérifier), email connu = ~50 ms d'Argon2. Le use case
    vérifie donc TOUJOURS un hash (factice si besoin), et l'espion
    verify_calls du FakeHasher permet de le prouver.
    """
    # Arrange -- on instancie le hasher nous-mêmes pour pouvoir lire son
    # espion verify_calls après l'appel (l'inscription de _uow_with_account
    # utilise son propre FakeHasher : celui-ci démarre donc vierge, le
    # clear() n'est qu'une précaution).
    uow = await _uow_with_account()
    hasher = FakeHasher()
    use_case = AuthenticateUser(lambda: uow, hasher, FakeTokenProvider())
    hasher.verify_calls.clear()

    # Act + Assert : même erreur générique que pour un mauvais mot de passe.
    with pytest.raises(InvalidCredentialsError):
        await use_case.execute(LoginCommand(email="inconnu@clinique.fr", password="whatever"))

    # Assert : le hash factice a bien été vérifié malgré l'email inconnu.
    assert hasher.verify_calls == [("whatever", "h:dummy")]


async def test_compte_desactive_est_rejete() -> None:
    """Compte désactivé -> UserInactiveError, MÊME avec le bon mot de passe.

    L'erreur est distincte d'InvalidCredentialsError : le mot de passe est
    vérifié d'abord, donc seul son détenteur légitime apprend que le compte
    est désactivé (un attaquant, lui, reçoit l'erreur générique).
    """
    # Arrange : on désactive le user directement dans le store du fake.
    uow = await _uow_with_account()
    user = next(iter(uow.user_store.values()))
    user.deactivate()
    use_case = AuthenticateUser(lambda: uow, FakeHasher(), FakeTokenProvider())

    # Act + Assert
    with pytest.raises(UserInactiveError):
        await use_case.execute(
            LoginCommand(email="manager@clinique.fr", password="correct-horse-battery")
        )
