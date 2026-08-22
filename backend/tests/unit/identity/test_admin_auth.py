"""Tests unitaires de l'espace PLATEFORME : entite et use cases d'auth.

Sur fakes, sans IO. On valide ici la logique du troisieme espace de comptes :
- l'entite PlatformAdmin (creation, revocation, horodatage de connexion) ;
- AuthenticateAdmin : erreur generique unique, hash factice pour un email
  inconnu, statut verifie APRES le mot de passe, last_login_at ecrit ;
- RefreshAdminToken et GetCurrentAdmin : relecture en base a chaque fois,
  donc revocation immediate.

Le cloisonnement cryptographique reel (claim `kind`) est verifie a part, sur
les VRAIS adapters PyJWT, dans test_admin_tokens.py.
"""

import uuid
from datetime import UTC, datetime

import pytest

from tests.unit.identity.fakes import (
    FakeHasher,
    FakeIdentityUnitOfWork,
    FakePlatformAdminTokenProvider,
    FixedClock,
)
from vetolib.identity.application.dto import LoginCommand
from vetolib.identity.application.use_cases.admin import (
    AuthenticateAdmin,
    GetCurrentAdmin,
    RefreshAdminToken,
)
from vetolib.identity.domain.errors import (
    AdminInactiveError,
    InvalidCredentialsError,
    InvalidTokenError,
)
from vetolib.identity.domain.platform_admin import PlatformAdmin
from vetolib.identity.domain.value_objects import Email, HashedPassword

_MOT_DE_PASSE = "phrase-de-passe-fondateur"
_PLUS_TARD = datetime(2026, 8, 22, 14, 30, tzinfo=UTC)

# --- Entite -----------------------------------------------------------------


def test_create_normalise_l_email_et_active_le_compte() -> None:
    admin = PlatformAdmin.create(
        email=Email("  Fondateur@VetoLib.FR "),
        hashed_password=HashedPassword("h:peu-importe"),
        first_name="Cedric",
        last_name="Delagree",
        now=datetime(2026, 1, 1, 9, 0, tzinfo=UTC),
    )

    assert admin.email.value == "fondateur@vetolib.fr"
    assert admin.is_active is True
    assert admin.last_login_at is None
    assert admin.deleted_at is None


def test_revocation_et_retablissement_sont_idempotents() -> None:
    admin = _admin()

    admin.deactivate()
    admin.deactivate()
    assert admin.is_active is False

    admin.activate()
    admin.activate()
    assert admin.is_active is True


def test_record_login_horodate_la_derniere_connexion() -> None:
    admin = _admin()

    admin.record_login(_PLUS_TARD)

    assert admin.last_login_at == _PLUS_TARD


# --- Use cases --------------------------------------------------------------


def _admin(*, actif: bool = True) -> PlatformAdmin:
    return PlatformAdmin(
        id=uuid.uuid4(),
        created_at=datetime(2026, 1, 1, 9, 0, tzinfo=UTC),
        email=Email("fondateur@vetolib.fr"),
        # Le FakeHasher considere "h:<clair>" comme l'empreinte de <clair>.
        hashed_password=HashedPassword(f"h:{_MOT_DE_PASSE}"),
        first_name="Cedric",
        last_name="Delagree",
        is_active=actif,
    )


def _uow(*, actif: bool = True) -> tuple[FakeIdentityUnitOfWork, PlatformAdmin]:
    uow = FakeIdentityUnitOfWork()
    admin = _admin(actif=actif)
    uow.admin_store[admin.id] = admin
    return uow, admin


def _authentifier(uow: FakeIdentityUnitOfWork) -> AuthenticateAdmin:
    return AuthenticateAdmin(
        lambda: uow, FakeHasher(), FakePlatformAdminTokenProvider(), FixedClock(_PLUS_TARD)
    )


async def test_login_valide_emet_les_jetons_et_horodate() -> None:
    uow, admin = _uow()

    pair, current = await _authentifier(uow).execute(
        # Casse differente : le value object Email normalise.
        LoginCommand(email="Fondateur@VetoLib.FR", password=_MOT_DE_PASSE)
    )

    assert pair.access_token == f"admin_access:{admin.id}"
    assert current.email == "fondateur@vetolib.fr"
    assert uow.admin_store[admin.id].last_login_at == _PLUS_TARD
    # L'horodatage est une ECRITURE : elle doit etre commitee, sinon la
    # colonne resterait desesperement vide.
    assert uow.commits == 1


async def test_email_inconnu_verifie_un_hash_factice() -> None:
    """Pas d'oracle d'existence : meme erreur et meme cout qu'un mot de passe faux."""
    uow = FakeIdentityUnitOfWork()
    hasher = FakeHasher()
    use_case = AuthenticateAdmin(
        lambda: uow, hasher, FakePlatformAdminTokenProvider(), FixedClock()
    )

    with pytest.raises(InvalidCredentialsError):
        await use_case.execute(LoginCommand(email="inconnu@vetolib.fr", password=_MOT_DE_PASSE))

    assert hasher.verify_calls == [(_MOT_DE_PASSE, "h:dummy")]


async def test_mauvais_mot_de_passe_est_rejete() -> None:
    uow, _ = _uow()

    with pytest.raises(InvalidCredentialsError):
        await _authentifier(uow).execute(
            LoginCommand(email="fondateur@vetolib.fr", password="pas-le-bon")
        )


async def test_email_malforme_donne_la_meme_erreur_generique() -> None:
    uow, _ = _uow()

    with pytest.raises(InvalidCredentialsError):
        await _authentifier(uow).execute(LoginCommand(email="pas-un-email", password="x"))


async def test_compte_revoque_est_refuse_apres_verification_du_mot_de_passe() -> None:
    """L'ordre est une propriete de securite, verifiee dans les deux sens."""
    uow, _ = _uow(actif=False)

    with pytest.raises(AdminInactiveError):
        await _authentifier(uow).execute(
            LoginCommand(email="fondateur@vetolib.fr", password=_MOT_DE_PASSE)
        )
    # Avec un mauvais mot de passe, l'etat du compte ne doit PAS fuiter.
    with pytest.raises(InvalidCredentialsError):
        await _authentifier(uow).execute(
            LoginCommand(email="fondateur@vetolib.fr", password="pas-le-bon")
        )


async def test_refresh_recharge_le_compte_et_refuse_un_acces_revoque() -> None:
    uow, admin = _uow()
    use_case = RefreshAdminToken(lambda: uow, FakePlatformAdminTokenProvider())

    pair, _ = await use_case.execute(f"admin_refresh:{admin.id}")
    assert pair.refresh_token == f"admin_refresh:{admin.id}"

    admin.deactivate()
    with pytest.raises(AdminInactiveError):
        await use_case.execute(f"admin_refresh:{admin.id}")


async def test_refresh_refuse_un_jeton_d_un_autre_espace() -> None:
    """Un refresh proprietaire glisse dans le cookie admin ne passe pas.

    Le fake mime le controle du claim `kind` par un prefixe : le contrat
    reel est verifie sur les vrais adapters dans test_admin_tokens.py.
    """
    uow, admin = _uow()
    use_case = RefreshAdminToken(lambda: uow, FakePlatformAdminTokenProvider())

    with pytest.raises(InvalidTokenError):
        await use_case.execute(f"owner_refresh:{admin.id}")


async def test_me_refuse_un_compte_supprime_ou_revoque() -> None:
    uow, admin = _uow()
    use_case = GetCurrentAdmin(lambda: uow, FakePlatformAdminTokenProvider())

    current = await use_case.execute(f"admin_access:{admin.id}")
    assert current.id == admin.id

    admin.deactivate()
    with pytest.raises(AdminInactiveError):
        await use_case.execute(f"admin_access:{admin.id}")

    admin.activate()
    admin.deleted_at = _PLUS_TARD
    with pytest.raises(InvalidTokenError):
        await use_case.execute(f"admin_access:{admin.id}")
