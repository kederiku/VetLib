import re
from dataclasses import dataclass
from enum import StrEnum

from vetolib.shared.domain.errors import DomainValidationError

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@dataclass(frozen=True)
class Email:
    """Adresse email normalisée (trim + lowercase)."""

    value: str

    def __post_init__(self) -> None:
        normalized = self.value.strip().lower()
        if not _EMAIL_RE.match(normalized):
            raise DomainValidationError(f"Adresse email invalide : {self.value!r}")
        object.__setattr__(self, "value", normalized)

    def __str__(self) -> str:
        return self.value


@dataclass(frozen=True)
class HashedPassword:
    """Empreinte de mot de passe — wrapper opaque, jamais le mot de passe en
    clair, repr masqué pour ne jamais fuiter dans les logs."""

    value: str

    def __repr__(self) -> str:
        return "HashedPassword(***)"


class Role(StrEnum):
    ASV = "asv"
    VETERINARIAN = "veterinarian"
    MANAGER = "manager"


_ASV_PERMISSIONS = frozenset(
    {
        "appointment:read",
        "appointment:write",
        "owner:read",
        "owner:write",
        "pet:read",
        "pet:write",
    }
)
# L'ASV n'a PAS accès aux données médicales sensibles.
_VETERINARIAN_PERMISSIONS = _ASV_PERMISSIONS | frozenset(
    {
        "medical_record:read",
        "medical_record:write",
        "prescription:write",
    }
)
_MANAGER_PERMISSIONS = _VETERINARIAN_PERMISSIONS | frozenset(
    {
        "clinic:manage",
        "staff:manage",
        "billing:read",
        "analytics:read",
    }
)

# Matrice rôle -> permissions : alimente le « fat token » JWT.
ROLE_PERMISSIONS: dict[Role, frozenset[str]] = {
    Role.ASV: _ASV_PERMISSIONS,
    Role.VETERINARIAN: _VETERINARIAN_PERMISSIONS,
    Role.MANAGER: _MANAGER_PERMISSIONS,
}
