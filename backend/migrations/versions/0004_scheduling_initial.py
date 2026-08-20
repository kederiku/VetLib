"""scheduling : resources, horaires, exceptions, types et rendez-vous.

Revision ID: 0004
Revises: 0003
Create Date: 2026-08-20

Premier bloc de tables TENANTEES apres users : chacune porte clinic_id et
recoit la policy RLS tenant_isolation (gabarit 0001). Trois elements sont
poses A LA MAIN (op.execute) car Alembic ne les autogenere pas :
1. l'extension btree_gist (necessaire pour melanger l'egalite UUID et le
   chevauchement de tstzrange dans une contrainte EXCLUDE gist) ;
2. la contrainte EXCLUDE anti double reservation : c'est PostgreSQL qui
   arbitre la course entre deux reservations simultanees du meme creneau --
   le WHERE la limite aux statuts actifs, donc ANNULER un rendez-vous
   libere son creneau automatiquement ;
3. les GRANT explicites par table (les default privileges du script Docker
   ne couvrent pas testcontainers) et les policies RLS.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "vetolib_app"
TENANT_TABLES = (
    "resources",
    "weekly_schedules",
    "schedule_exceptions",
    "appointment_types",
    "appointments",
)


def _tenant_columns() -> list[sa.Column[object]]:
    """Colonnes communes du gabarit tenant (PK UUID, clinic_id, timestamps)."""
    return [
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "clinic_id",
            sa.Uuid(),
            sa.ForeignKey("clinics.id"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    ]


def upgrade() -> None:
    # Contrib PostgreSQL standard, presente dans l'image officielle ; Alembic
    # tourne en superuser (ALEMBIC_DATABASE_URL), CREATE EXTENSION est permis.
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")

    op.create_table(
        "resources",
        *_tenant_columns(),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.CheckConstraint("kind IN ('veterinarian')", name="ck_resources_kind_valid"),
    )
    op.create_index("ix_resources_clinic_id", "resources", ["clinic_id"])

    op.create_table(
        "weekly_schedules",
        *_tenant_columns(),
        sa.Column("resource_id", sa.Uuid(), sa.ForeignKey("resources.id"), nullable=False),
        sa.Column("weekday", sa.SmallInteger(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.CheckConstraint("weekday BETWEEN 0 AND 6", name="ck_weekly_schedules_weekday_valid"),
        sa.CheckConstraint("end_time > start_time", name="ck_weekly_schedules_time_order"),
    )
    op.create_index("ix_weekly_schedules_clinic_id", "weekly_schedules", ["clinic_id"])
    op.create_index("ix_weekly_schedules_resource_id", "weekly_schedules", ["resource_id"])

    op.create_table(
        "schedule_exceptions",
        *_tenant_columns(),
        sa.Column("resource_id", sa.Uuid(), sa.ForeignKey("resources.id"), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.CheckConstraint("ends_at > starts_at", name="ck_schedule_exceptions_time_order"),
    )
    op.create_index("ix_schedule_exceptions_clinic_id", "schedule_exceptions", ["clinic_id"])
    op.create_index("ix_schedule_exceptions_resource_id", "schedule_exceptions", ["resource_id"])

    op.create_table(
        "appointment_types",
        *_tenant_columns(),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.CheckConstraint(
            "duration_minutes > 0 AND duration_minutes % 5 = 0",
            name="ck_appointment_types_duration_valid",
        ),
    )
    op.create_index("ix_appointment_types_clinic_id", "appointment_types", ["clinic_id"])

    op.create_table(
        "appointments",
        *_tenant_columns(),
        sa.Column("resource_id", sa.Uuid(), sa.ForeignKey("resources.id"), nullable=False),
        sa.Column(
            "appointment_type_id",
            sa.Uuid(),
            sa.ForeignKey("appointment_types.id"),
            nullable=False,
        ),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("owners.id"), nullable=True),
        sa.Column("pet_id", sa.Uuid(), sa.ForeignKey("pets.id"), nullable=True),
        sa.Column("guest_name", sa.String(200), nullable=True),
        sa.Column("guest_pet_name", sa.String(100), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("cancelled_reason", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending', 'confirmed', 'completed', 'cancelled')",
            name="ck_appointments_status_valid",
        ),
        sa.CheckConstraint("ends_at > starts_at", name="ck_appointments_time_order"),
        sa.CheckConstraint(
            "(owner_id IS NOT NULL) OR (guest_name IS NOT NULL)",
            name="ck_appointments_owner_or_guest",
        ),
    )
    op.create_index("ix_appointments_clinic_id", "appointments", ["clinic_id"])
    op.create_index(
        "ix_appointments_resource_starts_at", "appointments", ["resource_id", "starts_at"]
    )
    op.create_index("ix_appointments_owner_id", "appointments", ["owner_id"])

    # Anti double reservation : bornes demi-ouvertes [starts_at, ends_at) --
    # deux rendez-vous adjacents (10:00-10:30 puis 10:30-11:00) sont
    # compatibles ; le WHERE limite l'arbitrage aux statuts actifs.
    op.execute(
        """
        ALTER TABLE appointments ADD CONSTRAINT ex_appointments_no_overlap
        EXCLUDE USING gist (
            resource_id WITH =,
            tstzrange(starts_at, ends_at) WITH &&
        )
        WHERE (status IN ('pending', 'confirmed'))
        """
    )

    # GRANT explicites (pas de DELETE : soft delete) + RLS gabarit 0001.
    tables_sql = ", ".join(TENANT_TABLES)
    op.execute(f"GRANT SELECT, INSERT, UPDATE ON {tables_sql} TO {APP_ROLE}")
    for table in TENANT_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"""
            CREATE POLICY tenant_isolation ON {table}
            FOR ALL
            USING (clinic_id = NULLIF(current_setting('app.clinic_id', true), '')::uuid)
            WITH CHECK (clinic_id = NULLIF(current_setting('app.clinic_id', true), '')::uuid)
            """
        )


def downgrade() -> None:
    for table in reversed(TENANT_TABLES):
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
    op.drop_table("appointments")
    op.drop_table("appointment_types")
    op.drop_table("schedule_exceptions")
    op.drop_table("weekly_schedules")
    op.drop_table("resources")
    # L'extension btree_gist est conservee (partagee, sans cout).
