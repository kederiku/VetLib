"""Tests des jetons owner : use cases (fakes) ET cloisonnement kind (reels).

Deux niveaux :
1. RefreshOwnerToken / GetCurrentOwner / UpdateOwnerProfile avec les fakes
   (logique des use cases, sans crypto) ;
2. le CONTROLE DU CLAIM `kind` sur les VRAIS adapters PyJWT (rapides, sans
   IO) : c'est LA barriere qui empeche un jeton staff d'ouvrir une session
   owner et reciproquement -- y compris la retrocompatibilite des jetons
   staff "legacy" emis avant l'introduction du claim.
"""

import uuid
from datetime import UTC, datetime

import jwt as pyjwt
import pytest
from pydantic import SecretStr

from tests.unit.identity.fakes import (
    FakeBreachChecker,
    FakeHasher,
    FakeIdentityUnitOfWork,
    FakeOwnerTokenProvider,
    FixedClock,
)
from vetolib.config import Settings
from vetolib.identity.application.dto import RegisterOwnerCommand, UpdateOwnerProfileCommand
from vetolib.identity.application.use_cases import (
    GetCurrentOwner,
    RefreshOwnerToken,
    RegisterOwner,
    UpdateOwnerProfile,
)
from vetolib.identity.domain.errors import InvalidTokenError
from vetolib.identity.domain.user import User
from vetolib.identity.domain.value_objects import Email, HashedPassword, Role
from vetolib.identity.infrastructure.token_provider import (
    PyJWTOwnerTokenProvider,
    PyJWTTokenProvider,
)
from vetolib.shared.domain.errors import DomainValidationError

# --- Niveau 1 : use cases avec fakes --------------------------------------


async def _uow_with_owner() -> tuple[FakeIdentityUnitOfWork, uuid.UUID]:
    uow = FakeIdentityUnitOfWork()
    result = await RegisterOwner(
        lambda: uow, FakeHasher(), FixedClock(), FakeBreachChecker()
    ).execute(
        RegisterOwnerCommand(
            email="ana@exemple.fr",
            password="croquettes-pour-rex",
            first_name="Ana",
            last_name="Martin",
            phone=None,
        )
    )
    return uow, result.owner_id


async def test_refresh_valide_reemet_une_paire() -> None:
    uow, owner_id = await _uow_with_owner()
    use_case = RefreshOwnerToken(lambda: uow, FakeOwnerTokenProvider())

    pair, current = await use_case.execute(f"owner_refresh:{owner_id}")

    assert pair.access_token == f"owner_access:{owner_id}"
    assert current.id == owner_id


async def test_refresh_avec_token_staff_est_rejete() -> None:
    """Un refresh STAFF ("refresh:<id>") presente au flux owner -> 401.
    Le fake mime le controle kind du vrai adapter (prefixes distincts)."""
    uow, owner_id = await _uow_with_owner()
    use_case = RefreshOwnerToken(lambda: uow, FakeOwnerTokenProvider())

    with pytest.raises(InvalidTokenError):
        await use_case.execute(f"refresh:{owner_id}")


async def test_get_current_owner_soft_deleted_est_rejete() -> None:
    uow, owner_id = await _uow_with_owner()
    uow.owner_store[owner_id].deleted_at = datetime(2026, 2, 1, tzinfo=UTC)
    use_case = GetCurrentOwner(lambda: uow, FakeOwnerTokenProvider())

    with pytest.raises(InvalidTokenError):
        await use_case.execute(f"owner_access:{owner_id}")


async def test_update_profile_applique_la_fiche_complete() -> None:
    uow, owner_id = await _uow_with_owner()
    use_case = UpdateOwnerProfile(lambda: uow)

    current = await use_case.execute(
        UpdateOwnerProfileCommand(
            owner_id=owner_id,
            first_name="Anna",
            last_name="Martin-Dupont",
            phone="+33601020304",
            address_line1="12 rue des Lilas",
            address_line2=None,
            postal_code="75011",
            city="Paris",
            country="FR",
            notify_email=True,
            notify_sms=True,
        )
    )

    assert current.first_name == "Anna"
    assert current.address is not None
    assert current.address.postal_code == "75011"
    assert current.notification_preferences.sms is True
    # La fiche est persistee (un commit) et l'email n'a pas bouge.
    assert uow.commits == 2  # register + update
    assert uow.owner_store[owner_id].email.value == "ana@exemple.fr"


async def test_update_profile_refuse_une_adresse_partielle() -> None:
    """Defense en profondeur : meme si le schema Pydantic laissait passer
    une adresse incomplete, le VO Address la refuse (DomainValidationError)."""
    uow, owner_id = await _uow_with_owner()
    use_case = UpdateOwnerProfile(lambda: uow)

    with pytest.raises(DomainValidationError):
        await use_case.execute(
            UpdateOwnerProfileCommand(
                owner_id=owner_id,
                first_name="Ana",
                last_name="Martin",
                phone=None,
                address_line1="12 rue des Lilas",
                address_line2=None,
                postal_code=None,  # trio incomplet
                city=None,
                country="FR",
                notify_email=True,
                notify_sms=False,
            )
        )


# --- Niveau 2 : claim kind sur les VRAIS adapters PyJWT -------------------

_TEST_SECRET = "unit-test-secret-0123456789-0123456789"


def _providers() -> tuple[PyJWTTokenProvider, PyJWTOwnerTokenProvider, Settings]:
    settings = Settings(jwt_secret=SecretStr(_TEST_SECRET))
    # Horloge calee sur MAINTENANT (et pas le 2026-01-01 par defaut) : PyJWT
    # valide `exp` contre l'heure reelle au decodage -- un jeton emis dans le
    # passe serait rejete pour expiration, et les tests de rejet croise
    # passeraient pour la MAUVAISE raison (expire, pas kind).
    clock = FixedClock(datetime.now(UTC))
    return PyJWTTokenProvider(settings, clock), PyJWTOwnerTokenProvider(settings, clock), settings


def _staff_user() -> User:
    return User.create(
        clinic_id=uuid.uuid4(),
        email=Email("veto@clinique.fr"),
        hashed_password=HashedPassword("h:x"),
        first_name="Vera",
        last_name="Toli",
        role=Role.MANAGER,
        now=datetime(2026, 1, 1, 9, 0, tzinfo=UTC),
    )


def test_un_jeton_staff_est_rejete_par_le_decodage_owner() -> None:
    staff_provider, owner_provider, _ = _providers()
    pair = staff_provider.issue_pair(_staff_user())

    with pytest.raises(InvalidTokenError):
        owner_provider.decode_access(pair.access_token)
    with pytest.raises(InvalidTokenError):
        owner_provider.decode_refresh(pair.refresh_token)


def test_un_jeton_owner_est_rejete_par_le_decodage_staff() -> None:
    from vetolib.identity.domain.owner import Owner

    staff_provider, owner_provider, _ = _providers()
    owner, _event = Owner.register(
        email=Email("ana@exemple.fr"),
        hashed_password=HashedPassword("h:x"),
        first_name="Ana",
        last_name="Martin",
        phone=None,
        now=datetime(2026, 1, 1, 9, 0, tzinfo=UTC),
    )
    pair = owner_provider.issue_pair(owner)

    with pytest.raises(InvalidTokenError):
        staff_provider.decode_access(pair.access_token)
    with pytest.raises(InvalidTokenError):
        staff_provider.decode_refresh(pair.refresh_token)


def _forge_legacy_staff_token(settings: Settings, *, token_type: str) -> str:
    """Forge un jeton staff "legacy" SANS claim kind (emis avant le claim),
    signe avec le meme secret : la retrocompatibilite doit l'accepter cote
    staff (refresh valides 7 j) mais JAMAIS cote owner."""
    now = datetime.now(UTC)  # exp valide au moment du decodage
    claims = {
        "iat": int(now.timestamp()),
        "exp": int(now.timestamp()) + 900,
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "sub": str(uuid.uuid4()),
        "type": token_type,
        "jti": str(uuid.uuid4()),
    }
    if token_type == "access":
        claims |= {"cid": str(uuid.uuid4()), "role": "manager", "perms": []}
    return pyjwt.encode(claims, _TEST_SECRET, algorithm="HS256")


def test_jeton_staff_legacy_sans_kind_accepte_cote_staff_rejete_cote_owner() -> None:
    staff_provider, owner_provider, settings = _providers()

    legacy_access = _forge_legacy_staff_token(settings, token_type="access")
    legacy_refresh = _forge_legacy_staff_token(settings, token_type="refresh")

    # Retrocompat : le decodage staff tolere l'absence de kind...
    assert staff_provider.decode_access(legacy_access).role is Role.MANAGER
    staff_provider.decode_refresh(legacy_refresh)
    # ... mais le decodage owner exige kind == "owner", strictement.
    with pytest.raises(InvalidTokenError):
        owner_provider.decode_access(legacy_access)
    with pytest.raises(InvalidTokenError):
        owner_provider.decode_refresh(legacy_refresh)


def test_kind_inconnu_est_rejete_des_deux_cotes() -> None:
    staff_provider, owner_provider, settings = _providers()
    now = datetime.now(UTC)
    token = pyjwt.encode(
        {
            "iat": int(now.timestamp()),
            "exp": int(now.timestamp()) + 900,
            "iss": settings.jwt_issuer,
            "aud": settings.jwt_audience,
            "sub": str(uuid.uuid4()),
            "type": "access",
            "jti": str(uuid.uuid4()),
            "kind": "admin",  # valeur inconnue
            "cid": str(uuid.uuid4()),
            "role": "manager",
            "perms": [],
        },
        _TEST_SECRET,
        algorithm="HS256",
    )

    with pytest.raises(InvalidTokenError):
        staff_provider.decode_access(token)
    with pytest.raises(InvalidTokenError):
        owner_provider.decode_access(token)
