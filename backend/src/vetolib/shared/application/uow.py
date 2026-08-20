import uuid
from dataclasses import dataclass
from types import TracebackType
from typing import Protocol, Self

from vetolib.shared.domain.events import DomainEvent


@dataclass(frozen=True)
class TenantContext:
    """Transaction exécutée pour le compte d'une clinique : active la RLS."""

    clinic_id: uuid.UUID


class UnitOfWork(Protocol):
    """Frontière transactionnelle. Les repositories ne commitent jamais ;
    les événements ajoutés partent dans l'outbox avec le même commit."""

    async def __aenter__(self) -> Self: ...

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None: ...

    async def commit(self) -> None: ...

    async def rollback(self) -> None: ...

    def add_event(self, event: DomainEvent) -> None: ...
