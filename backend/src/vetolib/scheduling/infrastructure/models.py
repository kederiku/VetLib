"""Modeles SQLAlchemy du contexte scheduling : les 5 tables TENANTEES.

Toutes portent clinic_id (TenantMixin) et sont protegees par une policy RLS
tenant_isolation (migration 0004) : sous une transaction tenant
(SET LOCAL ROLE vetolib_app + app.clinic_id), chaque clinique ne voit que
ses lignes, quoi que fassent les requetes applicatives.

La contrainte EXCLUDE anti-chevauchement des rendez-vous n'est PAS declaree
ici : comme les policies RLS et les GRANT, elle est posee a la main dans la
migration 0004 (op.execute) -- l'ORM n'a pas besoin de la connaitre, et la
declaration Python d'une ExcludeConstraint gist est fragile.
"""

import uuid
from datetime import datetime, time

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    Time,
)
from sqlalchemy.orm import Mapped, mapped_column

from vetolib.shared.infrastructure.db.base import (
    Base,
    SoftDeleteMixin,
    TenantMixin,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
)


class ResourceModel(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, TenantMixin):
    """Table `resources` : les ressources reservables (praticiens)."""

    __tablename__ = "resources"

    kind: Mapped[str] = mapped_column(String(30), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    __table_args__ = (CheckConstraint("kind IN ('veterinarian')", name="kind_valid"),)


class WeeklyScheduleModel(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, TenantMixin):
    """Table `weekly_schedules` : plages horaires recurrentes (heures LOCALES).

    weekday : 0 = lundi ... 6 = dimanche. Les TIME sont interpretes dans la
    timezone de la clinique au calcul des creneaux, jamais stockes en UTC.
    """

    __tablename__ = "weekly_schedules"

    resource_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("resources.id"), nullable=False, index=True
    )
    weekday: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)

    __table_args__ = (
        CheckConstraint("weekday BETWEEN 0 AND 6", name="weekday_valid"),
        CheckConstraint("end_time > start_time", name="time_order"),
    )


class ScheduleExceptionModel(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, TenantMixin
):
    """Table `schedule_exceptions` : periodes bloquees (instants absolus)."""

    __tablename__ = "schedule_exceptions"

    resource_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("resources.id"), nullable=False, index=True
    )
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (CheckConstraint("ends_at > starts_at", name="time_order"),)


class AppointmentTypeModel(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, TenantMixin):
    """Table `appointment_types` : motifs de rendez-vous et durees."""

    __tablename__ = "appointment_types"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    __table_args__ = (
        CheckConstraint("duration_minutes > 0 AND duration_minutes % 5 = 0", name="duration_valid"),
    )


class AppointmentModel(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, TenantMixin):
    """Table `appointments` : les rendez-vous (machine a etats en colonne status).

    owner_id/pet_id referencent des tables GLOBALES (owners, pets -- hors
    tenant) : jointures possibles sous transaction tenant grace au GRANT
    SELECT. guest_* couvre les clients sans compte (RDV telephone).
    """

    __tablename__ = "appointments"

    resource_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("resources.id"), nullable=False)
    appointment_type_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("appointment_types.id"), nullable=False
    )
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("owners.id"), nullable=True, index=True
    )
    pet_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("pets.id"), nullable=True)
    guest_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    guest_pet_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    cancelled_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'confirmed', 'completed', 'cancelled')",
            name="status_valid",
        ),
        CheckConstraint("ends_at > starts_at", name="time_order"),
        CheckConstraint(
            "(owner_id IS NOT NULL) OR (guest_name IS NOT NULL)", name="owner_or_guest"
        ),
        # Index de l'agenda et du calcul busy (periode par ressource).
        Index("ix_appointments_resource_starts_at", "resource_id", "starts_at"),
    )
