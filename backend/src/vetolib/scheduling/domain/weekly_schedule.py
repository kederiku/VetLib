"""Entite WeeklySchedule : une plage horaire recurrente d'une ressource.

La "semaine type" d'un praticien est un ensemble de plages (weekday +
heures locales). Le calcul des creneaux les projette jour par jour dans la
timezone de la clinique -- voir application/availability.py. L'edition se
fait par REMPLACEMENT COMPLET de la semaine (use case
SetResourceWeeklySchedule) : plus simple et plus sur qu'un CRUD ligne a
ligne pour un formulaire "ma semaine type".
"""

import uuid
from dataclasses import dataclass
from datetime import datetime

from vetolib.scheduling.domain.value_objects import WeeklyTimeRange
from vetolib.shared.domain.entity import Entity


@dataclass(kw_only=True, eq=False)
class WeeklySchedule(Entity):
    clinic_id: uuid.UUID
    resource_id: uuid.UUID
    slot: WeeklyTimeRange

    @classmethod
    def create(
        cls,
        *,
        clinic_id: uuid.UUID,
        resource_id: uuid.UUID,
        slot: WeeklyTimeRange,
        now: datetime,
    ) -> "WeeklySchedule":
        return cls(
            id=uuid.uuid4(),
            created_at=now,
            clinic_id=clinic_id,
            resource_id=resource_id,
            slot=slot,
        )
