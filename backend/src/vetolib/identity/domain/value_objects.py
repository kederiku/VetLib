"""Value objects du contexte identity : Email, HashedPassword, Role.

Un value object (DDD) n'a pas d'identité propre : il est défini par sa valeur,
immuable (frozen=True) et auto-validé à la construction. Conséquence : un
Email invalide ne peut tout simplement pas exister dans le système ; la
validation a lieu une seule fois, à la frontière, au lieu d'être répétée dans
chaque use case. Zéro import de framework, comme partout dans domain/.
"""

import re
from dataclasses import dataclass
from enum import StrEnum

from vetolib.shared.domain.errors import DomainValidationError

# Validation volontairement simple (forme x@y.z) : la seule preuve fiable de
# validité d'un email reste l'envoi d'un lien de confirmation.
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@dataclass(frozen=True)
class Email:
    """Adresse email normalisée (trim + lowercase).

    La normalisation garantit l'unicité en base : "Foo@Bar.com " et
    "foo@bar.com" désignent le même compte.
    """

    value: str

    def __post_init__(self) -> None:
        """Normalise puis valide ; lève DomainValidationError (-> HTTP 422) sinon."""
        normalized = self.value.strip().lower()
        if not _EMAIL_RE.match(normalized):
            raise DomainValidationError(f"Adresse email invalide : {self.value!r}")
        # frozen=True interdit l'affectation normale (self.value = ...) ; le
        # object.__setattr__ est le passage standard pour écrire la valeur
        # normalisée pendant la construction d'une dataclass gelée.
        object.__setattr__(self, "value", normalized)

    def __str__(self) -> str:
        return self.value


@dataclass(frozen=True)
class HashedPassword:
    """Empreinte de mot de passe — wrapper opaque, jamais le mot de passe en
    clair, repr masqué pour ne jamais fuiter dans les logs."""

    value: str

    def __repr__(self) -> str:
        # Un str(objet) ou un log d'exception ne doit jamais exposer le hash :
        # même haché, il ne doit pas se retrouver dans des fichiers de logs.
        return "HashedPassword(***)"


class Role(StrEnum):
    """Rôles du personnel d'une clinique, du moins au plus privilégié.

    StrEnum : chaque membre EST une str (Role.MANAGER == "manager"), ce qui
    simplifie le stockage en base et la sérialisation JSON/JWT.
    """

    ASV = "asv"  # auxiliaire spécialisé vétérinaire (accueil, secrétariat)
    VETERINARIAN = "veterinarian"
    MANAGER = "manager"  # gérant : le premier utilisateur créé avec la clinique


# Permissions au format "ressource:action". Les frozenset sont immuables et se
# composent par union ( | ) : chaque rôle ÉTEND le précédent sans dupliquer
# les listes (hiérarchie ASV < vétérinaire < manager).
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
# Le manager cumule le soin ET la gestion (personnel, facturation, stats).
_MANAGER_PERMISSIONS = _VETERINARIAN_PERMISSIONS | frozenset(
    {
        "clinic:manage",
        "staff:manage",
        "billing:read",
        "analytics:read",
    }
)

# Matrice rôle -> permissions : alimente le « fat token » JWT.
# "Fat token" : les permissions sont embarquées dans l'access token à la
# connexion ; les endpoints les vérifient sans requête DB supplémentaire.
# Contrepartie : un changement de rôle n'est effectif qu'au prochain token
# (au plus 15 min, la durée de vie de l'access token).
ROLE_PERMISSIONS: dict[Role, frozenset[str]] = {
    Role.ASV: _ASV_PERMISSIONS,
    Role.VETERINARIAN: _VETERINARIAN_PERMISSIONS,
    Role.MANAGER: _MANAGER_PERMISSIONS,
}

# Code postal francais : exactement 5 chiffres. La validation ne s'applique
# qu'au pays FR ; pour les autres pays on accepte tel quel (bootstrap).
_FR_POSTAL_CODE_RE = re.compile(r"^\d{5}$")


@dataclass(frozen=True)
class Address:
    """Adresse postale structurée d'un propriétaire (value object).

    "Structurée" (par champs) et non un simple texte libre : indispensable
    plus tard pour la facturation (mentions légales) et la recherche de
    cliniques à proximité. Une adresse est soit complète, soit absente
    (Owner.address = None) : pas de demi-adresse en base, la règle
    "tout ou rien" est verrouillée ici par la validation à la construction.
    """

    line1: str
    line2: str | None
    postal_code: str
    city: str
    country: str = "FR"

    def __post_init__(self) -> None:
        """Valide et normalise (trim) ; lève DomainValidationError sinon."""
        line1 = self.line1.strip()
        city = self.city.strip()
        postal_code = self.postal_code.strip()
        country = self.country.strip().upper()
        if not line1:
            raise DomainValidationError("L'adresse (ligne 1) est requise.")
        if not city:
            raise DomainValidationError("La ville est requise.")
        if country == "FR" and not _FR_POSTAL_CODE_RE.match(postal_code):
            raise DomainValidationError(f"Code postal invalide : {self.postal_code!r}")
        line2 = self.line2.strip() if self.line2 is not None else None
        object.__setattr__(self, "line1", line1)
        object.__setattr__(self, "line2", line2 or None)
        object.__setattr__(self, "postal_code", postal_code)
        object.__setattr__(self, "city", city)
        object.__setattr__(self, "country", country)


@dataclass(frozen=True)
class NotificationPreferences:
    """Préférences de notification d'un propriétaire (rappels de RDV, vaccins).

    Défauts volontaires : email actif (canal gratuit et attendu), SMS inactif
    (canal payant, opt-in explicite). Stocké en JSONB côté infrastructure :
    on pourra ajouter des canaux (push...) sans migration de schéma.
    """

    email: bool = True
    sms: bool = False
