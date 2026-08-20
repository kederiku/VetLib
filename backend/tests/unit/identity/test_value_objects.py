"""Tests unitaires des value objects du domaine identity.

L'étage le plus bas de la pyramide : du domaine pur (dataclasses sans aucun
import framework), donc même pas besoin de fakes -- on instancie et on
vérifie. Un value object est immuable, défini par sa valeur (deux Email de
même valeur sont égaux) et auto-validant : impossible de construire un Email
invalide, le reste du code peut donc lui faire confiance sans revalider.
"""

import pytest

from vetolib.identity.domain.value_objects import (
    ROLE_PERMISSIONS,
    Email,
    HashedPassword,
    Role,
)
from vetolib.shared.domain.errors import DomainValidationError


def test_email_est_normalise() -> None:
    """Trim + lowercase à la construction : une seule forme canonique.

    C'est cette normalisation qui rend le login et le contrôle d'unicité
    insensibles à la casse partout dans l'application, sans que chaque
    use case ait à y penser.
    """
    assert Email("  Foo@Bar.COM ").value == "foo@bar.com"
    # Égalité par valeur (dataclass frozen) : la casse d'origine ne compte pas.
    assert Email("foo@bar.com") == Email("FOO@bar.com")


@pytest.mark.parametrize("raw", ["nope", "a@b", "@bar.com", "foo@", "foo bar@x.fr", ""])
def test_email_invalide_est_rejete(raw: str) -> None:
    """Un Email invalide ne peut pas EXISTER : le constructeur lève.

    parametrize rejoue le test pour chaque forme invalide (pas de @, pas de
    domaine, espace, chaîne vide...). L'erreur est une DomainValidationError
    du domaine, pas une exception technique.
    """
    with pytest.raises(DomainValidationError):
        Email(raw)


def test_hashed_password_ne_fuit_pas_dans_repr() -> None:
    """Le repr est masqué : un hash ne doit jamais fuiter dans les logs.

    repr() est appelé implicitement par les tracebacks, le logging et les
    débogueurs : sans ce masquage, une simple erreur suffirait à écrire du
    matériel sensible dans les journaux.
    """
    hashed = HashedPassword("argon2-secret-material")
    assert "argon2-secret-material" not in repr(hashed)


def test_matrice_des_roles() -> None:
    """Verrouille ROLE_PERMISSIONS, la source des permissions du "fat token".

    Cette matrice part telle quelle dans les claims JWT : la modifier change
    les droits effectifs de tous les utilisateurs. Le test documente et fige
    la hiérarchie asv < veterinarian < manager.
    """
    # L'ASV n'a pas accès aux données médicales sensibles.
    assert "medical_record:read" not in ROLE_PERMISSIONS[Role.ASV]
    assert "medical_record:write" in ROLE_PERMISSIONS[Role.VETERINARIAN]
    # Le gérant cumule les droits du vétérinaire + administration.
    # ("<=" entre frozensets = test d'inclusion : "est un sous-ensemble de").
    assert ROLE_PERMISSIONS[Role.VETERINARIAN] <= ROLE_PERMISSIONS[Role.MANAGER]
    assert "clinic:manage" in ROLE_PERMISSIONS[Role.MANAGER]
    assert "clinic:manage" not in ROLE_PERMISSIONS[Role.VETERINARIAN]
