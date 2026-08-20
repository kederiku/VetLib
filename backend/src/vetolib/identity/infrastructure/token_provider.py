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
        now = self._clock.now()
        access_expires_at = now + self._access_ttl
        refresh_expires_at = now + self._refresh_ttl
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
                "jti": str(uuid.uuid4()),
                "cid": str(user.clinic_id),
                "role": user.role.value,
                "perms": sorted(user.permissions),
            },
            self._secret,
            algorithm=_ALGORITHM,
        )
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
        if claims.get("type") != expected_type:
            raise InvalidTokenError("Type de jeton inattendu.")
        return claims

    def decode_access(self, token: str) -> AccessClaims:
        claims = self._decode(token, "access")
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
        claims = self._decode(token, "refresh")
        try:
            return RefreshClaims(user_id=uuid.UUID(str(claims["sub"])), jti=str(claims["jti"]))
        except (KeyError, ValueError) as exc:
            raise InvalidTokenError("Jeton malformé.") from exc
