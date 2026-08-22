"""identity : statut d'exploitation des cliniques et des comptes proprietaires.

Revision ID: 0007
Revises: 0006
Create Date: 2026-08-22

Ajoute une colonne is_active a `clinics` et a `owners`, pilotee par le
back-office plateforme (suspendre une clinique, desactiver un proprietaire).

Pourquoi une nouvelle colonne plutot que de reutiliser le soft delete
`deleted_at`, qui existe deja sur les deux tables ?

    Les index uniques uq_clinics_email_active et uq_owners_email_active sont
    PARTIELS : ils portent la clause WHERE deleted_at IS NULL. Poser
    deleted_at pour "suspendre" LIBERE donc immediatement l'adresse email.
    Si un tiers la reprend entre-temps, la restauration viole l'index unique
    et devient impossible depuis l'application -- il faudrait du SQL manuel
    en production. En prime, toutes les lectures des repositories filtrent
    deja deleted_at IS NULL : on ne pourrait meme plus relire la ligne pour
    l'afficher dans le back-office.

    Les deux notions sont donc distinctes et le restent :
      - is_active   : gel REVERSIBLE de l'acces, l'email reste reserve ;
      - deleted_at  : effacement definitif (demande RGPD), irreversible.

Pas d'index sur is_active : un booleen est tres peu selectif (l'immense
majorite des lignes vaut true), un index btree y serait ignore par le
planificateur. Le filtre accompagne toujours un autre predicat.

Pas de GRANT non plus : les privileges accordes en 0001/0002 portent sur la
TABLE, PostgreSQL les etend automatiquement aux colonnes ajoutees ensuite.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Les deux tables recoivent exactement la meme colonne : la lister une fois
# garde l'upgrade et le downgrade symetriques sans duplication.
_TABLES = ("clinics", "owners")


def upgrade() -> None:
    """Ajoute is_active (NOT NULL, defaut true) a clinics et owners."""
    for table in _TABLES:
        # server_default plutot qu'un backfill en deux temps : PostgreSQL
        # depuis la version 11 ajoute une colonne NOT NULL avec defaut sans
        # reecrire la table, l'operation est instantanee meme sur un gros
        # volume. Les lignes existantes deviennent actives, ce qui est bien
        # l'etat de tout le parc avant l'arrivee du back-office.
        op.add_column(
            table,
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        )


def downgrade() -> None:
    """Retire la colonne des deux tables (l'information de statut est perdue)."""
    for table in _TABLES:
        op.drop_column(table, "is_active")
