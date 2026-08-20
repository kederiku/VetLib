"""Evenements de domaine du contexte scheduling (pattern outbox).

Memes regles qu'identity : faits metier PASSES, immuables, payload en types
primitifs uniquement (UUID -> str, datetime -> isoformat), ecrits dans la
table outbox_events avec la transaction qui les a produits puis relayes par
TaskIQ (at-least-once). Consommateurs actuels : notifications de
demonstration ; demain : emails/SMS de rappel et de confirmation.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import ClassVar

from vetolib.shared.domain.events import DomainEvent


@dataclass(frozen=True, kw_only=True)
class AppointmentBooked(DomainEvent):
    """Un proprietaire a demande un rendez-vous en ligne (statut pending)."""

    event_type: ClassVar[str] = "scheduling.appointment_booked"

    appointment_id: uuid.UUID
    clinic_id: uuid.UUID
    owner_id: uuid.UUID
    resource_id: uuid.UUID
    appointment_type_id: uuid.UUID
    starts_at: datetime
    ends_at: datetime

    def payload(self) -> dict[str, object]:
        return {
            "appointment_id": str(self.appointment_id),
            "clinic_id": str(self.clinic_id),
            "owner_id": str(self.owner_id),
            "resource_id": str(self.resource_id),
            "appointment_type_id": str(self.appointment_type_id),
            "starts_at": self.starts_at.isoformat(),
            "ends_at": self.ends_at.isoformat(),
        }


@dataclass(frozen=True, kw_only=True)
class AppointmentConfirmed(DomainEvent):
    """La clinique a confirme un rendez-vous (pending -> confirmed)."""

    event_type: ClassVar[str] = "scheduling.appointment_confirmed"

    appointment_id: uuid.UUID
    clinic_id: uuid.UUID
    owner_id: uuid.UUID | None
    starts_at: datetime

    def payload(self) -> dict[str, object]:
        return {
            "appointment_id": str(self.appointment_id),
            "clinic_id": str(self.clinic_id),
            "owner_id": str(self.owner_id) if self.owner_id else None,
            "starts_at": self.starts_at.isoformat(),
        }


@dataclass(frozen=True, kw_only=True)
class AppointmentCancelled(DomainEvent):
    """Un rendez-vous a ete annule, par la clinique ou par le proprietaire."""

    event_type: ClassVar[str] = "scheduling.appointment_cancelled"

    appointment_id: uuid.UUID
    clinic_id: uuid.UUID
    owner_id: uuid.UUID | None
    cancelled_by: str  # "owner" ou "staff"
    cancelled_reason: str | None

    def payload(self) -> dict[str, object]:
        return {
            "appointment_id": str(self.appointment_id),
            "clinic_id": str(self.clinic_id),
            "owner_id": str(self.owner_id) if self.owner_id else None,
            "cancelled_by": self.cancelled_by,
            "cancelled_reason": self.cancelled_reason,
        }
