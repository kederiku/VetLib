"""DTOs (Data Transfer Objects) de la couche application du contexte identity.

Ces objets transportent les données entre la couche presentation (routes
FastAPI) et les use cases, dans les deux sens :
- les "Command" portent les entrées d'un use case (RegisterClinicCommand,
  LoginCommand) ;
- les autres portent ses sorties ou des projections intermédiaires
  (RegisterClinicResult, TokenPair, AccessClaims, CurrentUser).

Tous sont des dataclasses `frozen=True` : un DTO est un simple instantané
de données, pas un objet métier. L'immutabilité garantit qu'aucune couche
ne peut le modifier en cours de route (pas d'effet de bord silencieux
entre la route, le use case et les adapters) et le rend sûr à partager.
`kw_only=True` force l'appel par mots-clés : impossible d'inverser deux
champs `str` voisins (ex. first_name / last_name) sans erreur immédiate.

Note : les claims JWT (AccessClaims, RefreshClaims) vivent ici et non dans
domain/, car le format des jetons est un détail d'authentification, pas un
concept métier vétérinaire. Ils restent toutefois des DTOs abstraits : le
port TokenProvider les produit, l'adapter PyJWT reste en infrastructure.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime

from vetolib.identity.domain.value_objects import (
    Address,
    NotificationPreferences,
    Role,
)


@dataclass(frozen=True, kw_only=True)
class RegisterClinicCommand:
    """Entrée de RegisterClinic : la clinique ET son premier gérant en un appel.

    Le mot de passe arrive en clair ici (transport interne uniquement) ;
    il est hashé par le use case avant toute écriture en base.
    """

    clinic_name: str
    phone: str | None
    email: str
    password: str
    first_name: str
    last_name: str


@dataclass(frozen=True, kw_only=True)
class RegisterClinicResult:
    """Sortie de RegisterClinic : les UUID générés (PK UUID, convention projet).

    Pas de token ici : l'inscription ne connecte pas, l'utilisateur passe
    ensuite par le login classique.
    """

    clinic_id: uuid.UUID
    user_id: uuid.UUID


@dataclass(frozen=True, kw_only=True)
class LoginCommand:
    """Entrée d'AuthenticateUser : identifiants bruts saisis au login."""

    email: str
    password: str


@dataclass(frozen=True, kw_only=True)
class TokenPair:
    """Paire de JWT émise par le TokenProvider (access 15 min, refresh 7 j).

    Les dates d'expiration sont portées à titre informatif (logs, debug,
    tests) : la couche presentation n'en a pas besoin, le Max-Age des
    cookies HttpOnly (vetolib_access, vetolib_refresh) étant calé sur les
    mêmes durées via Settings (jwt_access_ttl_seconds et
    jwt_refresh_ttl_seconds). Convention du projet : les tokens ne
    transitent JAMAIS dans un body JSON, uniquement en cookies HttpOnly
    (illisibles par le JavaScript -> immunisés contre le vol XSS).
    """

    access_token: str
    refresh_token: str
    access_expires_at: datetime
    refresh_expires_at: datetime


@dataclass(frozen=True, kw_only=True)
class AccessClaims:
    """Contenu décodé de l'access token ("fat token").

    clinic_id, role et permissions sont embarqués dans le JWT : autoriser
    une requête ne coûte aucune lecture en base. Contrepartie assumée : un
    changement de droits n'est visible qu'au prochain token (15 min max).
    `jti` identifie le jeton de façon unique (utile pour une future denylist).
    """

    user_id: uuid.UUID
    clinic_id: uuid.UUID
    role: Role
    permissions: frozenset[str]
    jti: str


@dataclass(frozen=True, kw_only=True)
class RefreshClaims:
    """Contenu décodé du refresh token : volontairement minimal (user_id seul).

    Ni rôle ni permissions : au refresh, l'état réel est relu en base et
    une paire neuve est émise avec les droits actuels de l'utilisateur.
    """

    user_id: uuid.UUID
    jti: str


@dataclass(frozen=True, kw_only=True)
class CurrentUser:
    """Projection de l'utilisateur courant pour /me et le contexte requête."""

    id: uuid.UUID
    clinic_id: uuid.UUID
    clinic_name: str
    email: str
    first_name: str
    last_name: str
    role: Role
    permissions: frozenset[str]


# --- DTOs du profil des cliniques -----------------------------------------


@dataclass(frozen=True, kw_only=True)
class ClinicProfile:
    """Projection de la fiche clinique pour /clinics/me (lecture et écriture).

    L'email figure en lecture seule : identifiant d'inscription de la
    clinique, il est affichable mais non modifiable par updateMyClinic.
    """

    id: uuid.UUID
    name: str
    email: str
    phone: str | None
    address: Address | None
    timezone: str


@dataclass(frozen=True, kw_only=True)
class UpdateClinicProfileCommand:
    """Entrée d'UpdateClinicProfile : la fiche éditable de la clinique.

    clinic_id vient TOUJOURS du token de la session staff (claim cid du
    "fat token"), jamais du body : un manager ne peut modifier que SA
    clinique. Champs primitifs uniquement : le use case construit les value
    objects (Address, Timezone) et déclenche ainsi la validation domaine.
    """

    clinic_id: uuid.UUID
    name: str
    phone: str | None
    address_line1: str | None
    address_line2: str | None
    postal_code: str | None
    city: str | None
    country: str
    timezone: str


@dataclass(frozen=True, kw_only=True)
class PublicClinic:
    """Projection MINIMALE d'une clinique pour l'annuaire public (B2C).

    Volontairement réduite : l'annuaire est accessible sans authentification,
    on n'expose ni email, ni téléphone, ni adresse complète -- juste de quoi
    choisir une clinique (nom et ville, None tant que l'adresse n'est pas
    renseignée).
    """

    id: uuid.UUID
    name: str
    city: str | None


# --- DTOs des propriétaires (comptes B2C) ---------------------------------


@dataclass(frozen=True, kw_only=True)
class RegisterOwnerCommand:
    """Entrée de RegisterOwner : inscription d'un propriétaire d'animaux."""

    email: str
    password: str
    first_name: str
    last_name: str
    phone: str | None


@dataclass(frozen=True, kw_only=True)
class RegisterOwnerResult:
    """Sortie de RegisterOwner. Pas de token : le front enchaîne un login."""

    owner_id: uuid.UUID


@dataclass(frozen=True, kw_only=True)
class OwnerAccessClaims:
    """Contenu décodé d'un access token propriétaire.

    Volontairement maigre (pas de "fat token" comme le staff) : un owner
    n'a ni clinique, ni rôle, ni permissions à embarquer — l'identité
    (owner_id) et le jti suffisent.
    """

    owner_id: uuid.UUID
    jti: str


@dataclass(frozen=True, kw_only=True)
class OwnerRefreshClaims:
    """Contenu décodé d'un refresh token propriétaire (minimal, comme le staff)."""

    owner_id: uuid.UUID
    jti: str


@dataclass(frozen=True, kw_only=True)
class UpdateOwnerProfileCommand:
    """Entrée d'UpdateOwnerProfile : la fiche personnelle éditable.

    owner_id vient TOUJOURS du token de la session (dépendance
    CurrentOwnerDep), jamais du body : un propriétaire ne peut modifier que
    sa propre fiche. Ni email ni mot de passe ici (flux dédiés futurs).
    L'adresse arrive en champs primitifs ; le use case construit le value
    object Address (validation domaine), None si aucune adresse fournie.
    """

    owner_id: uuid.UUID
    first_name: str
    last_name: str
    phone: str | None
    address_line1: str | None
    address_line2: str | None
    postal_code: str | None
    city: str | None
    country: str
    notify_email: bool
    notify_sms: bool


@dataclass(frozen=True, kw_only=True)
class CurrentOwner:
    """Projection du propriétaire courant pour /owner/auth/me et la fiche."""

    id: uuid.UUID
    email: str
    first_name: str
    last_name: str
    phone: str | None
    address: Address | None
    notification_preferences: NotificationPreferences


# --- Espace PLATEFORME (back-office des fondateurs) -------------------------


@dataclass(frozen=True, kw_only=True)
class PlatformAdminAccessClaims:
    """Contenu decode d'un access token de super-admin.

    Le jeton le plus puissant du systeme est aussi le plus MAIGRE : ni role,
    ni permissions, ni tenant. C'est l'inverse exact du "fat token" du staff,
    et c'est un choix delibere : le compte est relu en base a chaque requete, donc une
    revocation prend effet a la requete suivante et non dans 15 minutes.
    A cette echelle (une poignee de comptes), la lecture ne coute rien.
    """

    admin_id: uuid.UUID
    jti: str


@dataclass(frozen=True, kw_only=True)
class PlatformAdminRefreshClaims:
    """Contenu decode d'un refresh token de super-admin."""

    admin_id: uuid.UUID
    jti: str


@dataclass(frozen=True, kw_only=True)
class CurrentAdmin:
    """Projection du super-admin courant (/admin/auth/me et contexte requete).

    Volontairement sans permissions : l'autorisation de cet espace est
    binaire. Un champ `permissions` vide inviterait a le remplir un jour sans
    y penser -- son absence force la decision a etre explicite.
    """

    id: uuid.UUID
    email: str
    first_name: str
    last_name: str
