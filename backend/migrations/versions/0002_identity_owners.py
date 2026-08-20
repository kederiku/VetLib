"""identity : table owners (proprietaires d'animaux, comptes B2C).

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-20

Pourquoi PAS de RLS sur cette table, contrairement a users :
un proprietaire est un compte GLOBAL, hors tenant -- il consultera
potentiellement plusieurs cliniques, il n'existe donc aucun clinic_id sur
lequel une policy app.clinic_id pourrait filtrer. Tous les flux owner
passent par la UoW systeme (role proprietaire du pool). Le GRANT au role
applicatif vetolib_app est conserve pour que de futures transactions
tenant puissent JOINdre un owner depuis une table tenantee (celle-ci
restant protegee par SA propre RLS).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "vetolib_app"


def upgrade() -> None:
    op.create_table(
        "owners",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.Column("phone", sa.String(30), nullable=True),
        # Adresse structuree aplatie en colonnes, "tout ou rien" (regle
        # portee par le value object Address et le schema Pydantic).
        sa.Column("address_line1", sa.String(200), nullable=True),
        sa.Column("address_line2", sa.String(200), nullable=True),
        sa.Column("postal_code", sa.String(10), nullable=True),
        sa.Column("city", sa.String(100), nullable=True),
        sa.Column("country", sa.String(2), nullable=True),
        # JSONB (doc de conception) : canaux extensibles sans migration.
        sa.Column(
            "notification_preferences",
            JSONB(),
            nullable=False,
            server_default=sa.text('\'{"email": true, "sms": false}\'::jsonb'),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Unicite restreinte aux comptes vivants (soft delete), comme users.
    # Espace de comptes INDEPENDANT de users : le meme email peut exister
    # dans les deux tables (un veterinaire peut aussi etre proprietaire).
    op.create_index(
        "uq_owners_email_active",
        "owners",
        ["email"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    # Pas de GRANT DELETE : soft delete uniquement, la regle est dans le schema.
    op.execute(f"GRANT SELECT, INSERT, UPDATE ON owners TO {APP_ROLE}")


def downgrade() -> None:
    op.drop_table("owners")
