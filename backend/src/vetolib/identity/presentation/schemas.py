import uuid

from pydantic import BaseModel, EmailStr, Field, SecretStr

from vetolib.identity.application.dto import CurrentUser
from vetolib.identity.domain.value_objects import Role

# Les tokens ne transitent JAMAIS dans un body JSON : cookies HttpOnly uniquement.


class RegisterClinicRequest(BaseModel):
    clinic_name: str = Field(min_length=2, max_length=200)
    phone: str | None = Field(default=None, max_length=30)
    email: EmailStr
    password: SecretStr = Field(min_length=12)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)


class LoginRequest(BaseModel):
    email: EmailStr
    password: SecretStr


class ClinicRegisteredResponse(BaseModel):
    clinic_id: uuid.UUID
    user_id: uuid.UUID


class UserResponse(BaseModel):
    id: uuid.UUID
    clinic_id: uuid.UUID
    clinic_name: str
    email: str
    first_name: str
    last_name: str
    role: Role
    permissions: list[str]

    @classmethod
    def from_current_user(cls, current: CurrentUser) -> "UserResponse":
        return cls(
            id=current.id,
            clinic_id=current.clinic_id,
            clinic_name=current.clinic_name,
            email=current.email,
            first_name=current.first_name,
            last_name=current.last_name,
            role=current.role,
            permissions=sorted(current.permissions),
        )
