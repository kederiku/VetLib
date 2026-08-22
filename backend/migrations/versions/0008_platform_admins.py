"""identity : table platform_admins (back-office des fondateurs).

Revision ID: 0008
Revises: 0007
Create Date: 2026-08-22

Cree le TROISIEME espace de comptes du produit. Deux points de conception
meritent d'etre lus avant de toucher a ce fichier.

1. AUCUNE Row-Level Security, et ce n'est pas un oubli. La RLS du projet
   filtre sur clinic_id ; un super-admin n'appartient a aucune clinique, il
   n'existe donc aucune colonne sur laquelle une policy pourrait porter.

2. La barriere est le PRIVILEGE, pas la policy -- et il faut la poser
   activement. Piege non evident : docker/postgres-init/02-app-role.sh
   execute

       ALTER DEFAULT PRIVILEGES FOR ROLE <superuser> IN SCHEMA public
       GRANT SELECT, INSERT, UPDATE ON TABLES TO vetolib_app;

   Autrement dit, en environnement Docker, TOUTE table creee ensuite par une
   migration devient automatiquement lisible par le role applicatif. C'est
   confortable pour les tables metier ; c'est exactement ce qu'il ne faut PAS
   ici. On revoque donc explicitement. Effet concret : une requete emise par
   erreur sous SET LOCAL ROLE vetolib_app echoue en "permission denied" au
   lieu de renvoyer des empreintes de mots de passe tout-puissants. Le REVOKE
   est un no-op la ou le GRANT par defaut n'a pas eu lieu (testcontainers).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "vetolib_app"


def upgrade() -> None:
    """Cree la table, son index unique partiel, et retire les privileges."""
    op.create_table(
        "platform_admins",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Meme unicite partielle que users, clinics et owners : l'adresse d'un
    # compte efface redevient disponible, celle d'un compte vivant non.
    op.create_index(
        "uq_platform_admins_email_active",
        "platform_admins",
        ["email"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    # --- Privileges : ici on RETIRE, on n'accorde pas (voir la docstring) ---
    op.execute(f"REVOKE ALL ON platform_admins FROM {APP_ROLE}")

    # Aucun compte n'est cree ici, et c'est delibere : le depot est PUBLIC.
    # Un administrateur par defaut, meme avec un mot de passe "de dev", est
    # un compte en production le jour ou quelqu'un deploie sans y penser.
    # La creation passe par la commande locale `make create-admin`.


def downgrade() -> None:
    """Supprime la table (l'index disparait avec elle)."""
    op.drop_table("platform_admins")
