import uuid
from dataclasses import dataclass
from datetime import datetime


@dataclass(kw_only=True, eq=False)
class Entity:
    """Base des entités : identité par `id`, cycle de vie soft-delete."""

    id: uuid.UUID
    created_at: datetime
    deleted_at: datetime | None = None

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, type(self)):
            return NotImplemented
        return self.id == other.id

    def __hash__(self) -> int:
        return hash(self.id)
