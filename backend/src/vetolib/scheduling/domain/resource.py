"""Entite Resource : une ressource reservable de la clinique (un praticien).

Abstraction voulue par le document de conception ("BookableResources") :
aujourd'hui un veterinaire, demain une salle de chirurgie ou un appareil
d'imagerie -- memes horaires, memes exceptions, memes rendez-vous. La table
est TENANTEE (clinic_id + RLS) : chaque clinique ne voit que ses ressources.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime

from vetolib.scheduling.domain.value_objects import ResourceKind
from vetolib.shared.domain.entity import Entity


@dataclass(kw_only=True, eq=False)
class Resource(Entity):
    clinic_id: uuid.UUID
    kind: ResourceKind
    name: str
    # Lien optionnel vers le compte staff (users) : un praticien peut etre
    # reservable sans avoir de compte (remplacant), et inversement.
    user_id: uuid.UUID | None = None
    active: bool = True

    @classmethod
    def create(
        cls, *, clinic_id: uuid.UUID, name: str, user_id: uuid.UUID | None, now: datetime
    ) -> "Resource":
        """Phase 1 du MVP : kind force a VETERINARIAN (pas encore de choix)."""
        return cls(
            id=uuid.uuid4(),
            created_at=now,
            clinic_id=clinic_id,
            kind=ResourceKind.VETERINARIAN,
            name=name,
            user_id=user_id,
        )

    def update(self, *, name: str, active: bool, user_id: uuid.UUID | None) -> None:
        self.name = name
        self.active = active
        self.user_id = user_id

    def soft_delete(self, now: datetime) -> None:
        self.deleted_at = now
