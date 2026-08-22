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


# --- DTOs des listes et fiches du back-office --------------------------------


@dataclass(frozen=True, kw_only=True)
class AdminClinicRow:
    """Une ligne de la liste des cliniques, telle que l'ecran l'affiche."""

    id: uuid.UUID
    name: str
    email: str
    phone: str | None
    city: str | None
    is_active: bool
    staff_count: int
    created_at: datetime


@dataclass(frozen=True, kw_only=True)
class AdminClinicDetail:
    """Fiche complete d'une clinique pour le back-office.

    Superset d'AdminClinicRow : l'adresse entiere et le fuseau, dont la liste
    n'a pas besoin. Deux projections plutot qu'une seule "au cas ou" : une
    liste de cent lignes n'a aucune raison de transporter cent adresses
    completes.
    """

    id: uuid.UUID
    name: str
    email: str
    phone: str | None
    address: Address | None
    timezone: str
    is_active: bool
    staff_count: int
    created_at: datetime


@dataclass(frozen=True, kw_only=True)
class AdminOwnerRow:
    """Une ligne de la liste des proprietaires."""

    id: uuid.UUID
    email: str
    first_name: str
    last_name: str
    phone: str | None
    city: str | None
    is_active: bool
    pet_count: int
    created_at: datetime


@dataclass(frozen=True, kw_only=True)
class AdminOwnerDetail:
    """Fiche complete d'un proprietaire (adresse et preferences comprises)."""

    id: uuid.UUID
    email: str
    first_name: str
    last_name: str
    phone: str | None
    address: Address | None
    notification_preferences: NotificationPreferences
    is_active: bool
    pet_count: int
    created_at: datetime


@dataclass(frozen=True, kw_only=True)
class AdminStaffRow:
    """Une ligne de la liste transverse du personnel."""

    id: uuid.UUID
    clinic_id: uuid.UUID
    clinic_name: str
    clinic_is_active: bool
    email: str
    first_name: str
    last_name: str
    role: Role
    is_active: bool
    created_at: datetime


@dataclass(frozen=True, kw_only=True)
class AdminActor:
    """Qui agit, pour la ligne d'audit.

    Passe explicitement a chaque use case d'ECRITURE plutot que devine : une
    mutation du back-office sans acteur identifie serait une mutation qu'on
    ne pourrait pas expliquer apres coup.
    """

    id: uuid.UUID
    email: str


@dataclass(frozen=True, kw_only=True)
class AdminCreateClinicCommand:
    """Creation d'une clinique par le back-office, avec un premier gerant OPTIONNEL.

    Deux flux en un seul endpoint : "je cree la clinique ET son gerant" (le
    cas courant) et "je cree la clinique, j'ajouterai les gerants demain".
    Quand le bloc gerant est present, tout part dans UNE transaction.

    L'email de la clinique et celui du gerant sont DISTINCTS, contrairement a
    l'inscription publique qui n'en connait qu'un : une clinique a une
    adresse de contact (contact@lilas.fr) qui n'est pas l'identifiant de
    connexion d'une personne (marie.durand@lilas.fr).
    """

    name: str
    email: str
    phone: str | None
    address_line1: str | None
    address_line2: str | None
    postal_code: str | None
    city: str | None
    country: str | None
    timezone: str
    manager: "AdminCreateClinicManager | None"


@dataclass(frozen=True, kw_only=True)
class AdminCreateClinicManager:
    """Le premier gerant, dans la commande de creation d'une clinique.

    DTO distinct d'AdminCreateStaffCommand, et pas par gout de la
    duplication : a cet instant la clinique n'existe pas encore, il n'y a
    donc pas de clinic_id a fournir. Reutiliser l'autre commande obligerait a
    y mettre une valeur factice -- c'est-a-dire a mentir dans un type pour
    economiser quatre lignes.
    """

    email: str
    first_name: str
    last_name: str
    role: Role


@dataclass(frozen=True, kw_only=True)
class AdminCreateStaffCommand:
    """Creation d'un membre du personnel dans une clinique existante.

    Pas de mot de passe : il est GENERE par le use case et renvoye une seule
    fois. Voir AdminStaffCreated.
    """

    clinic_id: uuid.UUID
    email: str
    first_name: str
    last_name: str
    role: Role


@dataclass(frozen=True, kw_only=True)
class AdminStaffCreated:
    """Resultat d'une creation de compte du personnel.

    ATTENTION -- `temporary_password` est le SEUL moment ou ce secret est
    lisible. Il n'est stocke nulle part en clair, ne figure dans aucun
    journal, n'apparait pas dans l'audit, et aucune route ne permet de le
    relire.

    Oui, cela fait transiter un secret dans une reponse, ce que la convention
    du projet interdit -- pour les JETONS. Ce n'en est pas un : c'est un
    identifiant que l'administrateur doit lire et transmettre, et il n'existe
    aujourd'hui aucun autre canal (l'envoi d'email n'est pas branche). C'est
    une decision assumee, pas un oubli ; elle disparaitra le jour ou un flux
    d'invitation par email existera.
    """

    user_id: uuid.UUID
    email: str
    role: Role
    temporary_password: str


@dataclass(frozen=True, kw_only=True)
class AdminUpdateClinicCommand:
    """Mise a jour de la fiche d'une clinique par le back-office.

    Sans email, comme Clinic.update_profile : l'adresse est l'identifiant
    d'inscription. Qu'un administrateur puisse la changer d'un clic serait
    une prise de controle en un geste, pas une correction de fiche.
    """

    clinic_id: uuid.UUID
    name: str
    phone: str | None
    address_line1: str | None
    address_line2: str | None
    postal_code: str | None
    city: str | None
    country: str | None
    timezone: str


@dataclass(frozen=True, kw_only=True)
class AdminUpdateOwnerCommand:
    """Mise a jour de la fiche d'un proprietaire. Sans email ni mot de passe."""

    owner_id: uuid.UUID
    first_name: str
    last_name: str
    phone: str | None
    address_line1: str | None
    address_line2: str | None
    postal_code: str | None
    city: str | None
    country: str | None
    notify_email: bool
    notify_sms: bool
