"""identity : clinics, users, outbox_events + rôle applicatif et RLS.

Revision ID: 0001
Revises:
Create Date: 2026-08-20

Les policies RLS et les GRANT ne sont pas autogénérés par Alembic :
ils sont écrits à la main (op.execute) — gabarit pour les contextes suivants.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Rôle applicatif : NOBYPASSRLS et non-propriétaire des tables -> RLS effective.
APP_ROLE = "vetolib_app"


def upgrade() -> None:
    op.create_table(
        "clinics",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("phone", sa.String(30), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "uq_clinics_email_active",
        "clinics",
        ["email"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "clinic_id",
            sa.Uuid(),
            sa.ForeignKey("clinics.id", name="fk_users_clinic_id_clinics"),
            nullable=False,
        ),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.Column("role", sa.String(30), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "role IN ('asv', 'veterinarian', 'manager')", name="ck_users_role_valid"
        ),
    )
    op.create_index("ix_users_clinic_id", "users", ["clinic_id"])
    op.create_index(
        "uq_users_email_active",
        "users",
        ["email"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    op.create_table(
        "outbox_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("event_type", sa.String(200), nullable=False),
        sa.Column("payload", JSONB(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_outbox_events_unprocessed",
        "outbox_events",
        ["occurred_at"],
        postgresql_where=sa.text("processed_at IS NULL"),
    )

    # --- Rôle applicatif ---
    # En Docker, le rôle existe déjà (script d'init, LOGIN) ; en environnement
    # de test (testcontainers) on le crée NOLOGIN — SET LOCAL ROLE suffit.
    op.execute(
        f"""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
                CREATE ROLE {APP_ROLE} NOLOGIN NOBYPASSRLS;
            END IF;
        END
        $$;
        """
    )
    op.execute(f"GRANT USAGE ON SCHEMA public TO {APP_ROLE}")
    # Pas de GRANT DELETE : soft delete uniquement — la règle est dans le schéma.
    op.execute(f"GRANT SELECT, INSERT, UPDATE ON clinics, users, outbox_events TO {APP_ROLE}")

    # --- RLS sur la table exemple : users ---
    # `current_setting(..., true)` renvoie NULL si app.clinic_id n'a jamais été
    # posé, mais '' (chaîne vide) sur une connexion poolée où un SET LOCAL a été
    # réinitialisé -> NULLIF(..., '') couvre les deux cas : comparaison NULL,
    # 0 ligne, fail-closed. Pas de FORCE : le rôle propriétaire (migrations,
    # UoW système) bypasse ses propres tables.
    op.execute("ALTER TABLE users ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY tenant_isolation ON users
        FOR ALL
        USING (clinic_id = NULLIF(current_setting('app.clinic_id', true), '')::uuid)
        WITH CHECK (clinic_id = NULLIF(current_setting('app.clinic_id', true), '')::uuid)
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON users")
    op.execute("ALTER TABLE users DISABLE ROW LEVEL SECURITY")
    op.drop_table("outbox_events")
    op.drop_table("users")
    op.drop_table("clinics")
    # Le rôle est volontairement conservé (partagé, potentiellement LOGIN en Docker).
