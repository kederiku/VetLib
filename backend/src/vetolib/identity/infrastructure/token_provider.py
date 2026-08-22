"""Adapters JWT (PyJWT) : ports TokenProvider (staff) et OwnerTokenProvider (B2C).

Un JWT est composé de trois parties encodées en base64url : un en-tête
(algorithme), des "claims" (les données) et une SIGNATURE HMAC calculée
avec le secret serveur. Les claims sont lisibles par tous (ce n'est PAS
chiffré : n'y mettre aucun secret) mais infalsifiables : modifier un
claim invalide la signature, et seul le serveur connaît le secret.

Rappels sur le flux d'auth VetoLib :
- deux jetons émis ensemble : l'access (15 min, autorise les requêtes API)
  et le refresh (7 j, sert uniquement à obtenir une nouvelle paire) ;
- transportés en cookies HttpOnly par la couche presentation (illisibles
  en JavaScript -> vol par XSS impossible), jamais dans un body JSON ;
- l'access STAFF est "fat" : il embarque rôle et permissions, donc chaque
  requête API est autorisée SANS requête en base. Contrepartie : une
  révocation ne prend effet qu'à l'expiration, d'où le TTL court (15 min).

Cloisonnement des espaces — le claim `kind` :
TROIS populations de comptes coexistent (staff de clinique, propriétaires
d'animaux, super-admins de la plateforme) avec les MEMES secret/issuer/
audience. Sans marquage, un jeton signé pour l'une serait
cryptographiquement valide pour les autres. Chaque jeton émis porte donc
`kind: "staff"`, `"owner"` ou `"platform"`, vérifié au décodage : un jeton
staff n'est jamais accepté par un endpoint owner ou admin, et
réciproquement. Défense en profondeur : les cookies ont aussi des noms
distincts, et un access owner ou admin n'a de toute façon ni cid ni role
(le retypage staff échouerait) — mais le `kind` reste la barrière
officielle, vérifiée en premier, et SANS tolérance.

Trois classes plutôt qu'une seule paramétrée par `kind` : le typage doit
rendre impossible d'injecter le provider d'un espace dans le use case d'un
autre. Une classe unique capable d'émettre pour n'importe quel espace
transformerait une erreur de câblage en escalade de privilèges ; ici, elle
reste une erreur mypy. La fabrication des jetons, elle, est factorisée dans
la fonction PRIVEE de module `_issue_pair` : elle supprime la duplication
sans créer de type injectable.
"""

import uuid
from datetime import datetime, timedelta
from typing import Any

import jwt

from vetolib.config import Settings
from vetolib.identity.application.dto import (
    AccessClaims,
    OwnerAccessClaims,
    OwnerRefreshClaims,
    PlatformAdminAccessClaims,
    PlatformAdminRefreshClaims,
    RefreshClaims,
    TokenPair,
)
from vetolib.identity.domain.errors import InvalidTokenError
from vetolib.identity.domain.owner import Owner
from vetolib.identity.domain.platform_admin import PlatformAdmin
from vetolib.identity.domain.user import User
from vetolib.identity.domain.value_objects import Role
from vetolib.shared.application.clock import Clock

# HS256 = signature symétrique (le même secret signe et vérifie) : suffisant
# tant qu'un seul service émet ET vérifie les jetons.
_ALGORITHM = "HS256"  # Monolithe. Multi-services : passer RS256/EdDSA (pyjwt[crypto]).

_KIND_STAFF = "staff"
_KIND_OWNER = "owner"
_KIND_PLATFORM = "platform"


def _issue_pair(
    *,
    subject_id: uuid.UUID,
    kind: str,
    access_extra: dict[str, Any],
    secret: str,
    issuer: str,
    audience: str,
    now: datetime,
    access_ttl: timedelta,
    refresh_ttl: timedelta,
) -> TokenPair:
    """Fabrique la paire access + refresh, commune aux trois espaces.

    Fonction PRIVEE de module, et non classe de base : elle factorise le code
    sans creer un type injectable capable d'emettre pour n'importe quel
    espace. Le cloisonnement reste porte par les trois classes publiques et
    par leurs ports respectifs -- une erreur de cablage reste une erreur de
    typage, pas une escalade de privileges.

    `access_extra` porte les claims metier du seul access token : cid + role
    + perms pour le staff, rien du tout pour les proprietaires et pour les
    super-admins. Le refresh est toujours maigre : au renouvellement, l'etat
    reel est relu en base, il n'y a donc rien a y embarquer.
    """
    access_expires_at = now + access_ttl
    refresh_expires_at = now + refresh_ttl
    # Claims standards (RFC 7519) communs aux deux jetons :
    # iat = emis a, iss = emetteur, aud = destinataire attendu,
    # sub = sujet (l'identifiant du compte), kind = espace de comptes.
    base_claims: dict[str, Any] = {
        "iat": int(now.timestamp()),
        "iss": issuer,
        "aud": audience,
        "sub": str(subject_id),
        "kind": kind,
    }
    access_token = jwt.encode(
        {
            **base_claims,
            "exp": int(access_expires_at.timestamp()),
            "type": "access",
            # jti : identifiant unique du jeton (permettrait une liste de
            # revocation ou de la detection de rejeu).
            "jti": str(uuid.uuid4()),
            **access_extra,
        },
        secret,
        algorithm=_ALGORITHM,
    )
    refresh_token = jwt.encode(
        {
            **base_claims,
            "exp": int(refresh_expires_at.timestamp()),
            "type": "refresh",
            "jti": str(uuid.uuid4()),
        },
        secret,
        algorithm=_ALGORITHM,
    )
    return TokenPair(
        access_token=access_token,
        refresh_token=refresh_token,
        access_expires_at=access_expires_at,
        refresh_expires_at=refresh_expires_at,
    )


def _decode_and_check(
    token: str,
    *,
    secret: str,
    issuer: str,
    audience: str,
    expected_type: str,
    expected_kind: str,
) -> dict[str, Any]:
    """Décode et vérifie un JWT : crypto, type (access/refresh) et kind.

    `jwt.decode` fait tout le travail cryptographique : signature HMAC,
    exp/iat, audience et issuer. `algorithms=[...]` est OBLIGATOIRE et
    fermé : accepter l'algorithme annoncé par le jeton lui-même est une
    faille classique (attaque alg=none). `require` refuse un jeton où un
    claim attendu manquerait. Toute erreur PyJWT est traduite en
    InvalidTokenError (erreur domaine) : la presentation la mappe en 401
    sans exposer de détail technique.

    Le claim `kind` est exigé STRICTEMENT, pour les trois espaces. Une
    tolérance « kind absent = staff » a existé le temps que les jetons émis
    avant l'introduction du claim expirent ; elle a été retirée à l'arrivée
    du troisième espace. Ne jamais la réintroduire « par symétrie » : c'était
    une branche fail-open au coeur exact du mécanisme qui cloisonne les
    espaces, et le pire endroit du code où en laisser une.
    """
    try:
        claims: dict[str, Any] = jwt.decode(
            token,
            secret,
            algorithms=[_ALGORITHM],
            audience=audience,
            issuer=issuer,
            options={"require": ["exp", "iat", "sub"]},
        )
    except jwt.PyJWTError as exc:
        raise InvalidTokenError("Jeton invalide ou expiré.") from exc
    # Contrôle anti-confusion : un refresh (7 j) présenté comme access
    # serait sinon accepté partout pendant 7 jours.
    if claims.get("type") != expected_type:
        raise InvalidTokenError("Type de jeton inattendu.")
    # Cloisonnement des trois espaces : voir docstring de module.
    if claims.get("kind") != expected_kind:
        raise InvalidTokenError("Jeton invalide pour cet espace.")
    return claims


class PyJWTTokenProvider:
    """Jetons STAFF : access « fat » (cid + rôle + permissions), kind="staff".

    Le claim `type` est contrôlé strictement : un refresh ne passe jamais
    pour un access, et inversement.
    """

    def __init__(self, settings: Settings, clock: Clock) -> None:
        self._secret = settings.jwt_secret.get_secret_value()
        self._issuer = settings.jwt_issuer
        self._audience = settings.jwt_audience
        self._access_ttl = timedelta(seconds=settings.jwt_access_ttl_seconds)
        self._refresh_ttl = timedelta(seconds=settings.jwt_refresh_ttl_seconds)
        self._clock = clock

    def issue_pair(self, user: User) -> TokenPair:
        """Émet la paire access + refresh pour un utilisateur authentifié.

        Le "fat token" est ici : cid (clinic_id) fixe le tenant pour la RLS,
        role et perms évitent tout aller-retour en base lors des contrôles
        d'autorisation. Contrepartie assumée : un changement de droits n'est
        visible qu'au prochain jeton (15 min au plus).
        """
        return _issue_pair(
            subject_id=user.id,
            kind=_KIND_STAFF,
            access_extra={
                "cid": str(user.clinic_id),
                "role": user.role.value,
                # sorted() : sortie déterministe (frozenset non ordonné).
                "perms": sorted(user.permissions),
            },
            secret=self._secret,
            issuer=self._issuer,
            audience=self._audience,
            # Le temps vient du port Clock (jamais datetime.now() en dur) :
            # les tests peuvent figer l'horloge et vérifier les expirations.
            now=self._clock.now(),
            access_ttl=self._access_ttl,
            refresh_ttl=self._refresh_ttl,
        )

    def _decode(self, token: str, expected_type: str) -> dict[str, Any]:
        """Décodage staff : `kind == "staff"` exigé strictement."""
        return _decode_and_check(
            token,
            secret=self._secret,
            issuer=self._issuer,
            audience=self._audience,
            expected_type=expected_type,
            expected_kind=_KIND_STAFF,
        )

    def decode_access(self, token: str) -> AccessClaims:
        """Valide un access token et le convertit en DTO typé AccessClaims."""
        claims = self._decode(token, "access")
        # On retype chaque claim (UUID, Role...) : un jeton signé mais mal
        # formé (ex : émis par une ancienne version) est rejeté proprement.
        try:
            return AccessClaims(
                user_id=uuid.UUID(str(claims["sub"])),
                clinic_id=uuid.UUID(str(claims["cid"])),
                role=Role(str(claims["role"])),
                permissions=frozenset(str(p) for p in claims.get("perms", [])),
                jti=str(claims["jti"]),
            )
        except (KeyError, ValueError) as exc:
            raise InvalidTokenError("Jeton malformé.") from exc

    def decode_refresh(self, token: str) -> RefreshClaims:
        """Valide un refresh token et le convertit en DTO typé RefreshClaims."""
        claims = self._decode(token, "refresh")
        try:
            return RefreshClaims(user_id=uuid.UUID(str(claims["sub"])), jti=str(claims["jti"]))
        except (KeyError, ValueError) as exc:
            raise InvalidTokenError("Jeton malformé.") from exc


class PyJWTOwnerTokenProvider:
    """Jetons PROPRIÉTAIRES (B2C) : maigres (sub + jti), kind="owner" strict.

    Pas de "fat token" : un owner n'a ni clinique, ni rôle, ni permissions.
    """

    def __init__(self, settings: Settings, clock: Clock) -> None:
        self._secret = settings.jwt_secret.get_secret_value()
        self._issuer = settings.jwt_issuer
        self._audience = settings.jwt_audience
        self._access_ttl = timedelta(seconds=settings.jwt_access_ttl_seconds)
        self._refresh_ttl = timedelta(seconds=settings.jwt_refresh_ttl_seconds)
        self._clock = clock

    def issue_pair(self, owner: Owner) -> TokenPair:
        """Émet la paire access + refresh pour un propriétaire authentifié."""
        return _issue_pair(
            subject_id=owner.id,
            kind=_KIND_OWNER,
            # Aucun claim métier : un owner n'a ni clinique, ni rôle.
            access_extra={},
            secret=self._secret,
            issuer=self._issuer,
            audience=self._audience,
            now=self._clock.now(),
            access_ttl=self._access_ttl,
            refresh_ttl=self._refresh_ttl,
        )

    def _decode(self, token: str, expected_type: str) -> dict[str, Any]:
        """Décodage owner : `kind == "owner"` exigé strictement."""
        return _decode_and_check(
            token,
            secret=self._secret,
            issuer=self._issuer,
            audience=self._audience,
            expected_type=expected_type,
            expected_kind=_KIND_OWNER,
        )

    def decode_access(self, token: str) -> OwnerAccessClaims:
        """Valide un access token owner -> OwnerAccessClaims."""
        claims = self._decode(token, "access")
        try:
            return OwnerAccessClaims(owner_id=uuid.UUID(str(claims["sub"])), jti=str(claims["jti"]))
        except (KeyError, ValueError) as exc:
            raise InvalidTokenError("Jeton malformé.") from exc

    def decode_refresh(self, token: str) -> OwnerRefreshClaims:
        """Valide un refresh token owner -> OwnerRefreshClaims."""
        claims = self._decode(token, "refresh")
        try:
            return OwnerRefreshClaims(
                owner_id=uuid.UUID(str(claims["sub"])), jti=str(claims["jti"])
            )
        except (KeyError, ValueError) as exc:
            raise InvalidTokenError("Jeton malformé.") from exc


class PyJWTPlatformAdminTokenProvider:
    """Jetons SUPER-ADMIN (back-office plateforme) : kind="platform" strict.

    Le jeton le plus puissant du systeme est le plus MAIGRE : sub, jti, kind,
    et rien d'autre. Aucun claim `perms`, aucun `role`.

    Pourquoi ce choix, alors que le staff a un "fat token" :
    - l'autorisation de cet espace est BINAIRE (on est fondateur ou non) ;
      une matrice de permissions sur trois personnes est une ceremonie ;
    - reutiliser ROLE_PERMISSIONS melangerait deux vocabulaires dans une
      meme table, et un bug qui donnerait "platform:*" a un gerant de
      clinique serait catastrophique. Les deux populations n'ont AUCUN
      terme en commun ;
    - un jeton maigre impose de relire le compte a chaque requete, ce qui
      est precisement la propriete recherchee ici : une revocation prend
      effet a la requete suivante, pas dans 15 minutes.

    Porte de sortie, le jour ou un role "support" en lecture seule serait
    necessaire : (1) une colonne `role` sur platform_admins avec un CHECK,
    (2) une matrice PLATFORM_ROLE_PERMISSIONS separee de ROLE_PERMISSIONS,
    (3) un claim `perms` dans l'access admin, (4) une fabrique
    require_admin_permission calquee sur require_permission. Une migration,
    aucun changement de cookie, de `kind` ni de routeur. C'est cette sortie,
    reelle et documentee, qui autorise a ne rien construire aujourd'hui.

    TTL : l'access reprend la duree commune (15 min), le refresh a la SIENNE
    (jwt_admin_refresh_ttl_seconds, 12 h par defaut au lieu de 7 jours). Un
    back-office n'a pas besoin de sessions d'une semaine, et un fondateur
    qui se reconnecte chaque jour n'est pas une contrainte.
    """

    def __init__(self, settings: Settings, clock: Clock) -> None:
        self._secret = settings.jwt_secret.get_secret_value()
        self._issuer = settings.jwt_issuer
        self._audience = settings.jwt_audience
        self._access_ttl = timedelta(seconds=settings.jwt_access_ttl_seconds)
        self._refresh_ttl = timedelta(seconds=settings.jwt_admin_refresh_ttl_seconds)
        self._clock = clock

    def issue_pair(self, admin: PlatformAdmin) -> TokenPair:
        """Emet la paire access + refresh d'un super-admin authentifie."""
        return _issue_pair(
            subject_id=admin.id,
            kind=_KIND_PLATFORM,
            access_extra={},
            secret=self._secret,
            issuer=self._issuer,
            audience=self._audience,
            now=self._clock.now(),
            access_ttl=self._access_ttl,
            refresh_ttl=self._refresh_ttl,
        )

    def _decode(self, token: str, expected_type: str) -> dict[str, Any]:
        """Decodage admin : `kind == "platform"` exige strictement."""
        return _decode_and_check(
            token,
            secret=self._secret,
            issuer=self._issuer,
            audience=self._audience,
            expected_type=expected_type,
            expected_kind=_KIND_PLATFORM,
        )

    def decode_access(self, token: str) -> PlatformAdminAccessClaims:
        """Valide un access token admin -> PlatformAdminAccessClaims."""
        claims = self._decode(token, "access")
        try:
            return PlatformAdminAccessClaims(
                admin_id=uuid.UUID(str(claims["sub"])), jti=str(claims["jti"])
            )
        except (KeyError, ValueError) as exc:
            raise InvalidTokenError("Jeton malformé.") from exc

    def decode_refresh(self, token: str) -> PlatformAdminRefreshClaims:
        """Valide un refresh token admin -> PlatformAdminRefreshClaims."""
        claims = self._decode(token, "refresh")
        try:
            return PlatformAdminRefreshClaims(
                admin_id=uuid.UUID(str(claims["sub"])), jti=str(claims["jti"])
            )
        except (KeyError, ValueError) as exc:
            raise InvalidTokenError("Jeton malformé.") from exc
