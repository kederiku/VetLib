import uuid
from dataclasses import dataclass
from typing import ClassVar

from vetolib.shared.domain.events import DomainEvent


@dataclass(frozen=True, kw_only=True)
class ClinicRegistered(DomainEvent):
    event_type: ClassVar[str] = "identity.clinic_registered"

    clinic_id: uuid.UUID
    clinic_name: str
    manager_email: str

    def payload(self) -> dict[str, object]:
        return {
            "clinic_id": str(self.clinic_id),
            "clinic_name": self.clinic_name,
            "manager_email": self.manager_email,
        }
