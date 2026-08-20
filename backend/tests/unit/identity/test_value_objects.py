import pytest

from vetolib.identity.domain.value_objects import (
    ROLE_PERMISSIONS,
    Email,
    HashedPassword,
    Role,
)
from vetolib.shared.domain.errors import DomainValidationError


def test_email_est_normalise() -> None:
    assert Email("  Foo@Bar.COM ").value == "foo@bar.com"
    assert Email("foo@bar.com") == Email("FOO@bar.com")


@pytest.mark.parametrize("raw", ["nope", "a@b", "@bar.com", "foo@", "foo bar@x.fr", ""])
def test_email_invalide_est_rejete(raw: str) -> None:
    with pytest.raises(DomainValidationError):
        Email(raw)


def test_hashed_password_ne_fuit_pas_dans_repr() -> None:
    hashed = HashedPassword("argon2-secret-material")
    assert "argon2-secret-material" not in repr(hashed)


def test_matrice_des_roles() -> None:
    # L'ASV n'a pas accès aux données médicales sensibles.
    assert "medical_record:read" not in ROLE_PERMISSIONS[Role.ASV]
    assert "medical_record:write" in ROLE_PERMISSIONS[Role.VETERINARIAN]
    # Le gérant cumule les droits du vétérinaire + administration.
    assert ROLE_PERMISSIONS[Role.VETERINARIAN] <= ROLE_PERMISSIONS[Role.MANAGER]
    assert "clinic:manage" in ROLE_PERMISSIONS[Role.MANAGER]
    assert "clinic:manage" not in ROLE_PERMISSIONS[Role.VETERINARIAN]
