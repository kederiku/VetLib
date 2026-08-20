"""Adapter JWT (PyJWT) : implémente le port TokenProvider de la couche application.

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
- l'access est "fat" : il embarque rôle et permissions, donc chaque
  requête API est autorisée SANS requête en base. Contrepartie : une
  révocation ne prend effet qu'à l'expiration, d'où le TTL court (15 min).
"""

import uuid
from datetime import timedelta
from typing import Any

import jwt

from vetolib.config import Settings
from vetolib.identity.application.dto import AccessClaims, RefreshClaims, TokenPair
from vetolib.identity.domain.errors import InvalidTokenError
from vetolib.identity.domain.user import User
from vetolib.identity.domain.value_objects import Role
from vetolib.shared.application.clock import Clock

# HS256 = signature symétrique (le même secret signe et vérifie) : suffisant
# tant qu'un seul service émet ET vérifie les jetons.
_ALGORITHM = "HS256"  # Monolithe. Multi-services : passer RS256/EdDSA (pyjwt[crypto]).


class PyJWTTokenProvider:
    """Double token « fat » : l'access embarque rôle + permissions (cid = clinic_id).

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
        """Émet la paire access + refresh pour un utilisateur authentifié."""
        # Le temps vient du port Clock (jamais datetime.now() en dur) :
        # les tests peuvent figer l'horloge et vérifier les expirations.
        now = self._clock.now()
        access_expires_at = now + self._access_ttl
        refresh_expires_at = now + self._refresh_ttl
        # Claims standards (RFC 7519) communs aux deux jetons :
        # iat = émis à, iss = émetteur, aud = destinataire attendu,
        # sub = sujet (ici l'id de l'utilisateur).
        base_claims: dict[str, Any] = {
            "iat": int(now.timestamp()),
            "iss": self._issuer,
            "aud": self._audience,
            "sub": str(user.id),
        }
        access_token = jwt.encode(
            {
                **base_claims,
                "exp": int(access_expires_at.timestamp()),
                "type": "access",
                # jti : identifiant unique du jeton (permettrait une liste
                # de révocation ou de la détection de rejeu).
                "jti": str(uuid.uuid4()),
                # Claims métier du "fat token" : cid (clinic_id) fixe le
                # tenant pour la RLS, role + perms évitent tout aller-retour
                # en base lors des contrôles d'autorisation.
                "cid": str(user.clinic_id),
                "role": user.role.value,
                # sorted() : sortie déterministe (frozenset non ordonné).
                "perms": sorted(user.permissions),
            },
            self._secret,
            algorithm=_ALGORITHM,
        )
        # Le refresh est volontairement "maigre" : ni rôle ni permissions.
        # Au refresh, on relit l'utilisateur en base -> un compte désactivé
        # ou un rôle modifié est pris en compte à ce moment-là.
        refresh_token = jwt.encode(
            {
                **base_claims,
                "exp": int(refresh_expires_at.timestamp()),
                "type": "refresh",
                "jti": str(uuid.uuid4()),
            },
            self._secret,
            algorithm=_ALGORITHM,
        )
        return TokenPair(
            access_token=access_token,
            refresh_token=refresh_token,
            access_expires_at=access_expires_at,
            refresh_expires_at=refresh_expires_at,
        )

    def _decode(self, token: str, expected_type: str) -> dict[str, Any]:
        """Vérifie signature, expiration, iss/aud et type, puis rend les claims.

        `jwt.decode` fait tout le travail cryptographique : signature HMAC,
        exp/iat, audience et issuer. `algorithms=[...]` est OBLIGATOIRE et
        fermé : accepter l'algorithme annoncé par le jeton lui-même est une
        faille classique (attaque alg=none). `require` refuse un jeton où
        un claim attendu manquerait. Toute erreur PyJWT est traduite en
        InvalidTokenError (erreur domaine) : la presentation la mappe en
        401 sans exposer de détail technique.
        """
        try:
            claims: dict[str, Any] = jwt.decode(
                token,
                self._secret,
                algorithms=[_ALGORITHM],
                audience=self._audience,
                issuer=self._issuer,
                options={"require": ["exp", "iat", "sub"]},
            )
        except jwt.PyJWTError as exc:
            raise InvalidTokenError("Jeton invalide ou expiré.") from exc
        # Contrôle anti-confusion : un refresh (7 j) présenté comme access
        # serait sinon accepté partout pendant 7 jours.
        if claims.get("type") != expected_type:
            raise InvalidTokenError("Type de jeton inattendu.")
        return claims

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
