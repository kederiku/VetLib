"""identity : clinics, users, outbox_events + rôle applicatif et RLS.

Revision ID: 0001
Revises:
Create Date: 2026-08-20

Les policies RLS et les GRANT ne sont pas autogénérés par Alembic :
ils sont écrits à la main (op.execute) — gabarit pour les contextes suivants.

Contenu, dans l'ordre :
1. tables clinics, users, outbox_events : PK UUID, soft delete (deleted_at),
   unicité d'email limitée aux lignes actives (index partiels) ;
2. rôle applicatif vetolib_app (NOLOGIN NOBYPASSRLS, créé si absent) et
   GRANT minimaux, volontairement sans DELETE (soft delete uniquement) ;
3. RLS sur users : policy tenant_isolation filtrant sur app.clinic_id, la
   variable de session posée par tenant_uow() à chaque transaction tenant.
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
    """Crée le socle identity : tables, rôle applicatif, GRANT et policy RLS."""
    # clinics est la table des tenants eux-mêmes : pas de clinic_id ni de RLS
    # ici ; l'isolation s'applique aux tables qui APPARTIENNENT à un tenant.
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
    # Index unique PARTIEL (WHERE deleted_at IS NULL) : conséquence du soft
    # delete. L'email d'une ligne "supprimée" doit rester réutilisable, ce
    # qu'une contrainte UNIQUE classique sur toute la table interdirait.
    op.create_index(
        "uq_clinics_email_active",
        "clinics",
        ["email"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    # users est une table tenantée : clinic_id rattache chaque ligne à sa
    # clinique et sert de pivot à la policy RLS posée en bas de fichier.
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
    # La policy RLS filtre chaque requête par clinic_id : cet index évite un
    # parcours complet de la table à chaque accès tenant.
    op.create_index("ix_users_clinic_id", "users", ["clinic_id"])
    op.create_index(
        "uq_users_email_active",
        "users",
        ["email"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    # Pattern Outbox : l'événement est inséré dans la même transaction que le
    # changement métier (atomicité), puis relayé vers TaskIQ par un job cron.
    # Table volontairement hors RLS : le relais tourne sans contexte clinique.
    op.create_table(
        "outbox_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("event_type", sa.String(200), nullable=False),
        sa.Column("payload", JSONB(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Index partiel sur le backlog (processed_at IS NULL) : le relais ne
    # balaye jamais l'historique déjà traité, qui ne fait que grossir.
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
    """Défait la migration en ordre inverse (users avant clinics, à cause des FK)."""
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON users")
    op.execute("ALTER TABLE users DISABLE ROW LEVEL SECURITY")
    op.drop_table("outbox_events")
    op.drop_table("users")
    op.drop_table("clinics")
    # Le rôle est volontairement conservé (partagé, potentiellement LOGIN en Docker).
