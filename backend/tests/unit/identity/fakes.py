import uuid
from datetime import UTC, datetime, timedelta
from types import TracebackType
from typing import Self

from vetolib.identity.application.dto import AccessClaims, RefreshClaims, TokenPair
from vetolib.identity.domain.clinic import Clinic
from vetolib.identity.domain.errors import InvalidTokenError
from vetolib.identity.domain.user import User
from vetolib.identity.domain.value_objects import Email, Role
from vetolib.shared.domain.events import DomainEvent


class FakeClinicRepository:
    def __init__(self, store: dict[uuid.UUID, Clinic]) -> None:
        self._store = store

    async def get_by_id(self, clinic_id: uuid.UUID) -> Clinic | None:
        return self._store.get(clinic_id)

    async def add(self, clinic: Clinic) -> None:
        self._store[clinic.id] = clinic

    async def exists_with_email(self, email: Email) -> bool:
        return any(c.email == email for c in self._store.values())


class FakeUserRepository:
    def __init__(self, store: dict[uuid.UUID, User]) -> None:
        self._store = store

    async def get_by_id(self, user_id: uuid.UUID) -> User | None:
        user = self._store.get(user_id)
        return user if user is not None and user.deleted_at is None else None

    async def get_by_email(self, email: Email) -> User | None:
        for user in self._store.values():
            if user.email == email and user.deleted_at is None:
                return user
        return None

    async def add(self, user: User) -> None:
        self._store[user.id] = user

    async def update(self, user: User) -> None:
        self._store[user.id] = user


class FakeIdentityUnitOfWork:
    """UoW in-memory : implémente le port IdentityUnitOfWork sans IO."""

    def __init__(self) -> None:
        self.clinic_store: dict[uuid.UUID, Clinic] = {}
        self.user_store: dict[uuid.UUID, User] = {}
        self.clinics = FakeClinicRepository(self.clinic_store)
        self.users = FakeUserRepository(self.user_store)
        self.events: list[DomainEvent] = []
        self.commits = 0
        self.rollbacks = 0

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        return None

    async def commit(self) -> None:
        self.commits += 1

    async def rollback(self) -> None:
        self.rollbacks += 1

    def add_event(self, event: DomainEvent) -> None:
        self.events.append(event)


class FakeHasher:
    def __init__(self) -> None:
        self.verify_calls: list[tuple[str, str]] = []

    async def hash(self, plain: str) -> str:
        return f"h:{plain}"

    async def verify_and_update(self, plain: str, hashed: str) -> tuple[bool, str | None]:
        self.verify_calls.append((plain, hashed))
        return (hashed == f"h:{plain}", None)

    def dummy_hash(self) -> str:
        return "h:dummy"


class FixedClock:
    def __init__(self, at: datetime | None = None) -> None:
        self.at = at or datetime(2026, 1, 1, 9, 0, tzinfo=UTC)

    def now(self) -> datetime:
        return self.at


class FakeTokenProvider:
    def issue_pair(self, user: User) -> TokenPair:
        now = datetime(2026, 1, 1, 9, 0, tzinfo=UTC)
        return TokenPair(
            access_token=f"access:{user.id}",
            refresh_token=f"refresh:{user.id}",
            access_expires_at=now + timedelta(minutes=15),
            refresh_expires_at=now + timedelta(days=7),
        )

    def decode_access(self, token: str) -> AccessClaims:
        if not token.startswith("access:"):
            raise InvalidTokenError("Jeton invalide.")
        user_id = uuid.UUID(token.removeprefix("access:"))
        return AccessClaims(
            user_id=user_id,
            clinic_id=uuid.uuid4(),
            role=Role.MANAGER,
            permissions=frozenset(),
            jti="fake-jti",
        )

    def decode_refresh(self, token: str) -> RefreshClaims:
        if not token.startswith("refresh:"):
            raise InvalidTokenError("Jeton invalide.")
        return RefreshClaims(user_id=uuid.UUID(token.removeprefix("refresh:")), jti="fake-jti")
