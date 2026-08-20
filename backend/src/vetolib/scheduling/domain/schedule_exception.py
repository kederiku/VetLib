"""Entite ScheduleException : une periode bloquee d'une ressource.

Conges, formation, urgence... : pendant cette periode ABSOLUE (instants
UTC, contrairement aux horaires hebdomadaires locaux), aucun creneau n'est
propose pour la ressource, quels que soient ses horaires de base.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime

from vetolib.shared.domain.entity import Entity
from vetolib.shared.domain.errors import DomainValidationError


@dataclass(kw_only=True, eq=False)
class ScheduleException(Entity):
    clinic_id: uuid.UUID
    resource_id: uuid.UUID
    starts_at: datetime
    ends_at: datetime
    reason: str | None = None

    def __post_init__(self) -> None:
        if self.ends_at <= self.starts_at:
            raise DomainValidationError("La fin de l'absence doit etre apres son debut.")

    @classmethod
    def create(
        cls,
        *,
        clinic_id: uuid.UUID,
        resource_id: uuid.UUID,
        starts_at: datetime,
        ends_at: datetime,
        reason: str | None,
        now: datetime,
    ) -> "ScheduleException":
        return cls(
            id=uuid.uuid4(),
            created_at=now,
            clinic_id=clinic_id,
            resource_id=resource_id,
            starts_at=starts_at,
            ends_at=ends_at,
            reason=reason,
        )

    def soft_delete(self, now: datetime) -> None:
        self.deleted_at = now
