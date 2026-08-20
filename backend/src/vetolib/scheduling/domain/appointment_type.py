"""Entite AppointmentType : un motif de rendez-vous et sa duree.

"Consultation" 30 min, "Vaccination" 15 min, "Chirurgie" 60 min... La duree
determine la longueur des creneaux proposes. Cycle de vie par DESACTIVATION
(active=False) plutot que suppression : un type desactive n'est plus
propose a la reservation mais les rendez-vous passes le referencent
toujours (historique legal, convention soft delete du projet).
"""

import uuid
from dataclasses import dataclass
from datetime import datetime

from vetolib.shared.domain.entity import Entity
from vetolib.shared.domain.errors import DomainValidationError


@dataclass(kw_only=True, eq=False)
class AppointmentType(Entity):
    clinic_id: uuid.UUID
    name: str
    duration_minutes: int
    active: bool = True

    def __post_init__(self) -> None:
        # Duplique le CHECK SQL (defense en profondeur) : un multiple de 5
        # garantit des creneaux alignes sur la grille de calcul (pas 15).
        if self.duration_minutes <= 0 or self.duration_minutes % 5 != 0:
            raise DomainValidationError(
                "La duree doit etre un multiple de 5 minutes strictement positif."
            )

    @classmethod
    def create(
        cls, *, clinic_id: uuid.UUID, name: str, duration_minutes: int, now: datetime
    ) -> "AppointmentType":
        return cls(
            id=uuid.uuid4(),
            created_at=now,
            clinic_id=clinic_id,
            name=name,
            duration_minutes=duration_minutes,
        )

    def update(self, *, name: str, duration_minutes: int, active: bool) -> None:
        # Re-valide via une construction jetable : la regle vit dans __post_init__.
        if duration_minutes <= 0 or duration_minutes % 5 != 0:
            raise DomainValidationError(
                "La duree doit etre un multiple de 5 minutes strictement positif."
            )
        self.name = name
        self.duration_minutes = duration_minutes
        self.active = active

    def soft_delete(self, now: datetime) -> None:
        self.deleted_at = now
