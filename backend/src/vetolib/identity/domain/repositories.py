import uuid
from typing import Protocol

from vetolib.identity.domain.clinic import Clinic
from vetolib.identity.domain.user import User
from vetolib.identity.domain.value_objects import Email


class ClinicRepository(Protocol):
    """Port : les repositories ne commitent jamais (rôle du UnitOfWork)."""

    async def get_by_id(self, clinic_id: uuid.UUID) -> Clinic | None: ...

    async def add(self, clinic: Clinic) -> None: ...

    async def exists_with_email(self, email: Email) -> bool: ...


class UserRepository(Protocol):
    async def get_by_id(self, user_id: uuid.UUID) -> User | None: ...

    async def get_by_email(self, email: Email) -> User | None: ...

    async def add(self, user: User) -> None: ...

    async def update(self, user: User) -> None: ...
