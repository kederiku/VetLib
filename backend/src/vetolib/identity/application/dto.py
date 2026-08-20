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

from vetolib.identity.domain.value_objects import Role


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
