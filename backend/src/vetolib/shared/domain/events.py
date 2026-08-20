import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import ClassVar


@dataclass(frozen=True, kw_only=True)
class DomainEvent(ABC):
    """Fait métier accompli, persisté dans la table outbox avec la transaction
    qui l'a produit, puis relayé de façon asynchrone (at-least-once)."""

    event_type: ClassVar[str]

    event_id: uuid.UUID = field(default_factory=uuid.uuid4)
    occurred_at: datetime

    @abstractmethod
    def payload(self) -> dict[str, object]:
        """Représentation JSON-sérialisable de l'événement."""
