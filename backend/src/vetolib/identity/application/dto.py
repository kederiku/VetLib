import uuid
from dataclasses import dataclass
from datetime import datetime

from vetolib.identity.domain.value_objects import Role


@dataclass(frozen=True, kw_only=True)
class RegisterClinicCommand:
    clinic_name: str
    phone: str | None
    email: str
    password: str
    first_name: str
    last_name: str


@dataclass(frozen=True, kw_only=True)
class RegisterClinicResult:
    clinic_id: uuid.UUID
    user_id: uuid.UUID


@dataclass(frozen=True, kw_only=True)
class LoginCommand:
    email: str
    password: str


@dataclass(frozen=True, kw_only=True)
class TokenPair:
    access_token: str
    refresh_token: str
    access_expires_at: datetime
    refresh_expires_at: datetime


@dataclass(frozen=True, kw_only=True)
class AccessClaims:
    user_id: uuid.UUID
    clinic_id: uuid.UUID
    role: Role
    permissions: frozenset[str]
    jti: str


@dataclass(frozen=True, kw_only=True)
class RefreshClaims:
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
