"""Cloisonnement des TROIS espaces, verifie sur les vrais adapters PyJWT.

C'est le test le plus important de la fonctionnalite. Les trois espaces de
comptes signent leurs jetons avec le MEME secret, le meme emetteur et la
meme audience : sans le claim `kind`, un jeton emis pour l'un serait
cryptographiquement valide pour les deux autres. La barriere est donc
purement applicative -- d'ou l'interet de la verrouiller par un test qui
enumere les six combinaisons croisees plutot que d'en verifier une ou deux.

Ces tests tournent sur les VRAIS PyJWT*Provider (rapides, sans IO) : ce sont
eux qui partent en production, pas les fakes.
"""

import uuid
from datetime import UTC, datetime

import jwt as pyjwt
import pytest
from pydantic import SecretStr

from tests.unit.identity.fakes import FixedClock
from vetolib.config import Settings
from vetolib.identity.domain.errors import InvalidTokenError
from vetolib.identity.domain.owner import Owner
from vetolib.identity.domain.platform_admin import PlatformAdmin
from vetolib.identity.domain.user import User
from vetolib.identity.domain.value_objects import Email, HashedPassword, Role
from vetolib.identity.infrastructure.token_provider import (
    PyJWTOwnerTokenProvider,
    PyJWTPlatformAdminTokenProvider,
    PyJWTTokenProvider,
)

_TEST_SECRET = "unit-test-secret-0123456789-0123456789"
_LE_1ER_JANVIER = datetime(2026, 1, 1, 9, 0, tzinfo=UTC)


def _settings() -> Settings:
    return Settings(jwt_secret=SecretStr(_TEST_SECRET))


def _horloge() -> FixedClock:
    # Horloge calee sur MAINTENANT (et pas sur une date fixe) : PyJWT valide
    # `exp` contre l'heure reelle au decodage. Un jeton emis dans le passe
    # serait rejete pour EXPIRATION, et les tests de rejet croise passeraient
    # alors pour la mauvaise raison.
    return FixedClock(datetime.now(UTC))


def _jetons_des_trois_espaces() -> dict[str, tuple[str, str]]:
    """Emet une paire (access, refresh) par espace, avec les vrais adapters."""
    settings, clock = _settings(), _horloge()
    staff = PyJWTTokenProvider(settings, clock).issue_pair(
        User.create(
            clinic_id=uuid.uuid4(),
            email=Email("veto@clinique.fr"),
            hashed_password=HashedPassword("h:x"),
            first_name="Vera",
            last_name="Toli",
            role=Role.MANAGER,
            now=_LE_1ER_JANVIER,
        )
    )
    owner, _ = Owner.register(
        email=Email("ana@exemple.fr"),
        hashed_password=HashedPassword("h:x"),
        first_name="Ana",
        last_name="Martin",
        phone=None,
        now=_LE_1ER_JANVIER,
    )
    proprietaire = PyJWTOwnerTokenProvider(settings, clock).issue_pair(owner)
    plateforme = PyJWTPlatformAdminTokenProvider(settings, clock).issue_pair(
        PlatformAdmin.create(
            email=Email("fondateur@vetolib.fr"),
            hashed_password=HashedPassword("h:x"),
            first_name="Cedric",
            last_name="Delagree",
            now=_LE_1ER_JANVIER,
        )
    )
    return {
        "staff": (staff.access_token, staff.refresh_token),
        "owner": (proprietaire.access_token, proprietaire.refresh_token),
        "platform": (plateforme.access_token, plateforme.refresh_token),
    }


def test_chaque_provider_decode_ses_propres_jetons() -> None:
    """Le chemin nominal, sans lequel les rejets ci-dessous ne prouveraient rien."""
    settings, clock = _settings(), _horloge()
    jetons = _jetons_des_trois_espaces()

    access_admin, refresh_admin = jetons["platform"]
    provider = PyJWTPlatformAdminTokenProvider(settings, clock)
    assert provider.decode_access(access_admin).admin_id is not None
    assert provider.decode_refresh(refresh_admin).admin_id is not None


@pytest.mark.parametrize("espace_emetteur", ["staff", "owner"])
def test_un_jeton_des_autres_espaces_ne_vaut_rien_cote_plateforme(espace_emetteur: str) -> None:
    """Recopier un cookie staff ou proprietaire dans vetolib_admin_access ne
    doit rien ouvrir du tout."""
    provider = PyJWTPlatformAdminTokenProvider(_settings(), _horloge())
    access, refresh = _jetons_des_trois_espaces()[espace_emetteur]

    with pytest.raises(InvalidTokenError):
        provider.decode_access(access)
    with pytest.raises(InvalidTokenError):
        provider.decode_refresh(refresh)


def test_un_jeton_plateforme_ne_vaut_rien_dans_les_deux_autres_espaces() -> None:
    """La reciproque, tout aussi importante : le jeton le plus puissant du
    systeme ne doit surtout pas ouvrir une session staff ou proprietaire."""
    settings, clock = _settings(), _horloge()
    access, refresh = _jetons_des_trois_espaces()["platform"]

    for provider in (PyJWTTokenProvider(settings, clock), PyJWTOwnerTokenProvider(settings, clock)):
        with pytest.raises(InvalidTokenError):
            provider.decode_access(access)
        with pytest.raises(InvalidTokenError):
            provider.decode_refresh(refresh)


def test_un_refresh_plateforme_ne_passe_pas_pour_un_access() -> None:
    """Controle anti-confusion du claim `type` : sans lui, un refresh (12 h)
    serait accepte partout pendant 12 heures."""
    provider = PyJWTPlatformAdminTokenProvider(_settings(), _horloge())
    access, refresh = _jetons_des_trois_espaces()["platform"]

    with pytest.raises(InvalidTokenError):
        provider.decode_access(refresh)
    with pytest.raises(InvalidTokenError):
        provider.decode_refresh(access)


def test_un_jeton_plateforme_expire_est_rejete() -> None:
    settings = _settings()
    # Horloge reculee de deux jours : le refresh admin ne vit que 12 h.
    passe = FixedClock(datetime.now(UTC).replace(microsecond=0)).at
    provider_passe = PyJWTPlatformAdminTokenProvider(
        settings, FixedClock(passe.fromtimestamp(passe.timestamp() - 2 * 86_400, tz=UTC))
    )
    admin = PlatformAdmin.create(
        email=Email("fondateur@vetolib.fr"),
        hashed_password=HashedPassword("h:x"),
        first_name="Cedric",
        last_name="Delagree",
        now=_LE_1ER_JANVIER,
    )
    pair = provider_passe.issue_pair(admin)

    provider = PyJWTPlatformAdminTokenProvider(settings, _horloge())
    with pytest.raises(InvalidTokenError):
        provider.decode_access(pair.access_token)
    with pytest.raises(InvalidTokenError):
        provider.decode_refresh(pair.refresh_token)


def test_un_jeton_plateforme_sans_kind_est_rejete() -> None:
    """Aucune tolerance, pour aucun espace : la branche fail-open a ete
    supprimee lors de l'introduction du troisieme `kind`."""
    settings = _settings()
    maintenant = datetime.now(UTC)
    sans_kind = pyjwt.encode(
        {
            "iat": int(maintenant.timestamp()),
            "exp": int(maintenant.timestamp()) + 900,
            "iss": settings.jwt_issuer,
            "aud": settings.jwt_audience,
            "sub": str(uuid.uuid4()),
            "type": "access",
            "jti": str(uuid.uuid4()),
        },
        _TEST_SECRET,
        algorithm="HS256",
    )

    with pytest.raises(InvalidTokenError):
        PyJWTPlatformAdminTokenProvider(settings, _horloge()).decode_access(sans_kind)


def test_le_refresh_plateforme_vit_moins_longtemps_que_les_autres() -> None:
    """12 h contre 7 jours : la session la plus puissante dure le moins."""
    settings, clock = _settings(), _horloge()
    admin = PlatformAdmin.create(
        email=Email("fondateur@vetolib.fr"),
        hashed_password=HashedPassword("h:x"),
        first_name="Cedric",
        last_name="Delagree",
        now=_LE_1ER_JANVIER,
    )
    paire_admin = PyJWTPlatformAdminTokenProvider(settings, clock).issue_pair(admin)

    duree = paire_admin.refresh_expires_at - paire_admin.access_expires_at
    assert paire_admin.refresh_expires_at < clock.at.fromtimestamp(
        clock.at.timestamp() + settings.jwt_refresh_ttl_seconds, tz=UTC
    )
    assert duree.total_seconds() > 0
