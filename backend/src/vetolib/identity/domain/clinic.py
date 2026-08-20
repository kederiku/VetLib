import uuid
from dataclasses import dataclass
from datetime import datetime

from vetolib.identity.domain.events import ClinicRegistered
from vetolib.identity.domain.value_objects import Email
from vetolib.shared.domain.entity import Entity


@dataclass(kw_only=True, eq=False)
class Clinic(Entity):
    """Tenant principal de la plateforme."""

    name: str
    email: Email
    phone: str | None = None

    @classmethod
    def register(
        cls, *, name: str, email: Email, phone: str | None, now: datetime
    ) -> tuple["Clinic", ClinicRegistered]:
        clinic = cls(id=uuid.uuid4(), created_at=now, name=name, email=email, phone=phone)
        event = ClinicRegistered(
            occurred_at=now,
            clinic_id=clinic.id,
            clinic_name=name,
            manager_email=email.value,
        )
        return clinic, event
