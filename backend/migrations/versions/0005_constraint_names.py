"""Renomme les contraintes CHECK au format de la naming convention.

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-20

Les migrations 0001 a 0004 passaient a CheckConstraint des noms DEJA
prefixes (ck_<table>_...), que la naming convention du MetaData prefixait a
nouveau -> noms doubles en base (ck_users_ck_users_role_valid). Les modeles
ORM, eux, utilisent les noms courts : cette derive casserait un futur
autogenerate. On renomme une fois pour toutes vers la forme canonique
ck_<table>_<nom_court>, alignee sur les modeles.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (table, nom double actuel, nom canonique vise par les modeles ORM)
RENAMES = [
    ("users", "ck_users_ck_users_role_valid", "ck_users_role_valid"),
    ("pets", "ck_pets_ck_pets_species_valid", "ck_pets_species_valid"),
    ("resources", "ck_resources_ck_resources_kind_valid", "ck_resources_kind_valid"),
    (
        "weekly_schedules",
        "ck_weekly_schedules_ck_weekly_schedules_weekday_valid",
        "ck_weekly_schedules_weekday_valid",
    ),
    (
        "weekly_schedules",
        "ck_weekly_schedules_ck_weekly_schedules_time_order",
        "ck_weekly_schedules_time_order",
    ),
    (
        "schedule_exceptions",
        "ck_schedule_exceptions_ck_schedule_exceptions_time_order",
        "ck_schedule_exceptions_time_order",
    ),
    (
        "appointment_types",
        "ck_appointment_types_ck_appointment_types_duration_valid",
        "ck_appointment_types_duration_valid",
    ),
    (
        "appointments",
        "ck_appointments_ck_appointments_status_valid",
        "ck_appointments_status_valid",
    ),
    ("appointments", "ck_appointments_ck_appointments_time_order", "ck_appointments_time_order"),
    (
        "appointments",
        "ck_appointments_ck_appointments_owner_or_guest",
        "ck_appointments_owner_or_guest",
    ),
]


def upgrade() -> None:
    for table, old, new in RENAMES:
        # IF EXISTS via un DO : idempotent si une base a deja le bon nom
        # (testcontainers rejoue toute la chaine, Docker a l'ancien etat).
        op.execute(
            f"""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT FROM pg_constraint
                    WHERE conname = '{old}' AND conrelid = '{table}'::regclass
                ) THEN
                    ALTER TABLE {table} RENAME CONSTRAINT {old} TO {new};
                END IF;
            END
            $$;
            """
        )


def downgrade() -> None:
    for table, old, new in RENAMES:
        op.execute(
            f"""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT FROM pg_constraint
                    WHERE conname = '{new}' AND conrelid = '{table}'::regclass
                ) THEN
                    ALTER TABLE {table} RENAME CONSTRAINT {new} TO {old};
                END IF;
            END
            $$;
            """
        )
