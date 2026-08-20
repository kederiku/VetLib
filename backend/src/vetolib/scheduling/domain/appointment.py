"""Entite Appointment : le rendez-vous et sa machine a etats stricte.

Cycle de vie (document de conception) :

    pending ----confirm----> confirmed ----complete----> completed
       |                        |
       +--------cancel----------+------> cancelled

- Un rendez-vous pris EN LIGNE par un proprietaire nait PENDING : la
  clinique le confirme d'un clic dans son agenda.
- Un rendez-vous cree PAR LE STAFF (telephone, comptoir) nait directement
  CONFIRMED : la clinique n'a pas a se confirmer a elle-meme.
- Toute transition hors de ce graphe leve InvalidAppointmentTransitionError.

Identite du client : soit un compte proprietaire (owner_id, avec pet_id
optionnel), soit un client de passage sans compte (guest_name, saisi par le
staff). L'invariant "owner OU guest" est verifie ici ET par un CHECK SQL.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from vetolib.scheduling.domain.errors import (
    CancellationTooLateError,
    InvalidAppointmentTransitionError,
)
from vetolib.scheduling.domain.events import (
    AppointmentBooked,
    AppointmentCancelled,
    AppointmentConfirmed,
)
from vetolib.scheduling.domain.value_objects import AppointmentStatus
from vetolib.shared.domain.entity import Entity
from vetolib.shared.domain.errors import DomainValidationError

# Delai minimal d'annulation en ligne par un proprietaire : en deca, il doit
# appeler la clinique (regle metier assumee, le staff peut toujours annuler).
OWNER_CANCELLATION_MIN_NOTICE = timedelta(hours=24)


@dataclass(kw_only=True, eq=False)
class Appointment(Entity):
    clinic_id: uuid.UUID
    resource_id: uuid.UUID
    appointment_type_id: uuid.UUID
    owner_id: uuid.UUID | None
    pet_id: uuid.UUID | None
    guest_name: str | None
    guest_pet_name: str | None
    starts_at: datetime
    ends_at: datetime
    status: AppointmentStatus
    reason: str | None = None
    cancelled_reason: str | None = None

    def __post_init__(self) -> None:
        if self.ends_at <= self.starts_at:
            raise DomainValidationError("La fin du rendez-vous doit etre apres son debut.")
        # Miroir du CHECK SQL ck_appointments_owner_or_guest.
        if self.owner_id is None and self.guest_name is None:
            raise DomainValidationError(
                "Un rendez-vous doit avoir un proprietaire ou un nom de client."
            )

    @classmethod
    def book_by_owner(
        cls,
        *,
        clinic_id: uuid.UUID,
        resource_id: uuid.UUID,
        appointment_type_id: uuid.UUID,
        owner_id: uuid.UUID,
        pet_id: uuid.UUID,
        starts_at: datetime,
        ends_at: datetime,
        reason: str | None,
        now: datetime,
    ) -> tuple["Appointment", AppointmentBooked]:
        """Reservation en ligne : nait PENDING + evenement pour l'outbox."""
        appointment = cls(
            id=uuid.uuid4(),
            created_at=now,
            clinic_id=clinic_id,
            resource_id=resource_id,
            appointment_type_id=appointment_type_id,
            owner_id=owner_id,
            pet_id=pet_id,
            guest_name=None,
            guest_pet_name=None,
            starts_at=starts_at,
            ends_at=ends_at,
            status=AppointmentStatus.PENDING,
            reason=reason,
        )
        event = AppointmentBooked(
            occurred_at=now,
            appointment_id=appointment.id,
            clinic_id=clinic_id,
            owner_id=owner_id,
            resource_id=resource_id,
            appointment_type_id=appointment_type_id,
            starts_at=starts_at,
            ends_at=ends_at,
        )
        return appointment, event

    @classmethod
    def create_by_staff(
        cls,
        *,
        clinic_id: uuid.UUID,
        resource_id: uuid.UUID,
        appointment_type_id: uuid.UUID,
        owner_id: uuid.UUID | None,
        pet_id: uuid.UUID | None,
        guest_name: str | None,
        guest_pet_name: str | None,
        starts_at: datetime,
        ends_at: datetime,
        reason: str | None,
        now: datetime,
    ) -> "Appointment":
        """Creation par le staff (telephone, comptoir) : nait CONFIRMED."""
        return cls(
            id=uuid.uuid4(),
            created_at=now,
            clinic_id=clinic_id,
            resource_id=resource_id,
            appointment_type_id=appointment_type_id,
            owner_id=owner_id,
            pet_id=pet_id,
            guest_name=guest_name,
            guest_pet_name=guest_pet_name,
            starts_at=starts_at,
            ends_at=ends_at,
            status=AppointmentStatus.CONFIRMED,
            reason=reason,
        )

    def confirm(self, now: datetime) -> AppointmentConfirmed:
        """pending -> confirmed (action de la clinique)."""
        if self.status is not AppointmentStatus.PENDING:
            raise InvalidAppointmentTransitionError(
                f"Impossible de confirmer un rendez-vous {self.status.value}."
            )
        self.status = AppointmentStatus.CONFIRMED
        return AppointmentConfirmed(
            occurred_at=now,
            appointment_id=self.id,
            clinic_id=self.clinic_id,
            owner_id=self.owner_id,
            starts_at=self.starts_at,
        )

    def complete(self) -> None:
        """confirmed -> completed (la consultation a eu lieu)."""
        if self.status is not AppointmentStatus.CONFIRMED:
            raise InvalidAppointmentTransitionError(
                f"Impossible de terminer un rendez-vous {self.status.value}."
            )
        self.status = AppointmentStatus.COMPLETED

    def cancel(
        self, *, cancelled_reason: str | None, now: datetime, cancelled_by: str
    ) -> AppointmentCancelled:
        """pending|confirmed -> cancelled.

        L'annulation SORT le rendez-vous du perimetre de la contrainte
        EXCLUDE (WHERE status IN pending, confirmed) : le creneau redevient
        automatiquement reservable, sans autre operation.
        """
        if self.status not in (AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED):
            raise InvalidAppointmentTransitionError(
                f"Impossible d'annuler un rendez-vous {self.status.value}."
            )
        self.status = AppointmentStatus.CANCELLED
        self.cancelled_reason = cancelled_reason
        return AppointmentCancelled(
            occurred_at=now,
            appointment_id=self.id,
            clinic_id=self.clinic_id,
            owner_id=self.owner_id,
            cancelled_by=cancelled_by,
            cancelled_reason=cancelled_reason,
        )

    def cancel_by_owner(
        self, *, cancelled_reason: str | None, now: datetime
    ) -> AppointmentCancelled:
        """Annulation en ligne : au moins 24 h avant le debut, sinon 409.

        La regle ne s'applique qu'au proprietaire (le staff passe par
        cancel()) : en deca de 24 h, il doit appeler la clinique.
        """
        if self.starts_at - now < OWNER_CANCELLATION_MIN_NOTICE:
            raise CancellationTooLateError(
                "Ce rendez-vous commence dans moins de 24 heures : "
                "il ne peut plus etre annule en ligne."
            )
        return self.cancel(cancelled_reason=cancelled_reason, now=now, cancelled_by="owner")
