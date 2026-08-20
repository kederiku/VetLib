import uuid
from dataclasses import dataclass
from datetime import datetime

from vetolib.identity.domain.value_objects import (
    ROLE_PERMISSIONS,
    Email,
    HashedPassword,
    Role,
)
from vetolib.shared.domain.entity import Entity


@dataclass(kw_only=True, eq=False)
class User(Entity):
    clinic_id: uuid.UUID
    email: Email
    hashed_password: HashedPassword
    first_name: str
    last_name: str
    role: Role
    is_active: bool = True

    @classmethod
    def create(
        cls,
        *,
        clinic_id: uuid.UUID,
        email: Email,
        hashed_password: HashedPassword,
        first_name: str,
        last_name: str,
        role: Role,
        now: datetime,
    ) -> "User":
        return cls(
            id=uuid.uuid4(),
            created_at=now,
            clinic_id=clinic_id,
            email=email,
            hashed_password=hashed_password,
            first_name=first_name,
            last_name=last_name,
            role=role,
        )

    @property
    def permissions(self) -> frozenset[str]:
        return ROLE_PERMISSIONS[self.role]

    def can(self, permission: str) -> bool:
        return permission in self.permissions

    def change_password(self, hashed: HashedPassword) -> None:
        self.hashed_password = hashed

    def deactivate(self) -> None:
        self.is_active = False
