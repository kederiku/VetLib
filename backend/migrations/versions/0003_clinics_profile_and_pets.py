"""identity + patients : profil des cliniques (adresse, timezone) et table pets.

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-20

Deux volets :
1. clinics recoit une adresse structuree (memes colonnes nullables "tout ou
   rien" que owners en 0002) et un fuseau horaire IANA (NOT NULL avec defaut
   'Europe/Paris') : indispensable au futur agenda, car les horaires
   d'ouverture d'une clinique s'interpretent dans SON fuseau, pas en UTC.
2. table pets : les animaux d'un proprietaire (contexte patients).

Pourquoi PAS de clinic_id ni de RLS sur pets, comme owners en 0002 :
un animal appartient a un PROPRIETAIRE (compte global, hors tenant), pas a
une clinique -- Rex reste le meme chien chez tous les veterinaires que son
maitre consulte. Le lien animal <-> clinique viendra des tables tenantees
des autres contextes (les futurs medical_records, les rendez-vous de
scheduling), chacune protegee par SA propre RLS. Les flux pets passent donc
par la UoW systeme, et le filtrage par proprietaire est applicatif
(WHERE owner_id, verrouille par l'API du port PetRepository).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "vetolib_app"

# Colonnes d'adresse ajoutees a clinics : listees une fois pour que le
# downgrade reste symetrique de l'upgrade sans duplication.
_CLINIC_ADDRESS_COLUMNS = ("address_line1", "address_line2", "postal_code", "city", "country")


def upgrade() -> None:
    """Ajoute le profil des cliniques et cree la table pets (+ GRANT)."""
    # --- clinics : adresse structuree + fuseau horaire ---
    # Adresse "tout ou rien" (regle portee par le value object Address et le
    # schema Pydantic, pas par une contrainte SQL) : pattern exact de owners
    # en 0002. Toutes les colonnes sont NULL : les cliniques existantes n'ont
    # simplement pas encore renseigne leur adresse.
    op.add_column("clinics", sa.Column("address_line1", sa.String(200), nullable=True))
    op.add_column("clinics", sa.Column("address_line2", sa.String(200), nullable=True))
    op.add_column("clinics", sa.Column("postal_code", sa.String(10), nullable=True))
    op.add_column("clinics", sa.Column("city", sa.String(100), nullable=True))
    op.add_column("clinics", sa.Column("country", sa.String(2), nullable=True))
    # Fuseau IANA en Text (longueur libre, valide par le VO Timezone via
    # zoneinfo). NOT NULL + server_default : les lignes existantes recoivent
    # le defaut France sans etape de backfill.
    op.add_column(
        "clinics",
        sa.Column("timezone", sa.Text(), nullable=False, server_default="Europe/Paris"),
    )

    # --- pets : les animaux d'un proprietaire (contexte patients) ---
    op.create_table(
        "pets",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "owner_id",
            sa.Uuid(),
            # Nom explicite : suit la convention fk_<table>_<colonne>_<cible>
            # du naming_convention SQLAlchemy (base.py), pour que le modele
            # PetModel et la base designent la meme contrainte.
            sa.ForeignKey("owners.id", name="fk_pets_owner_id_owners"),
            nullable=False,
        ),
        sa.Column("name", sa.String(100), nullable=False),
        # String + CHECK plutot qu'un enum PostgreSQL (penible en migration).
        # Doit rester synchronise avec l'enum Species du domaine (pet.py).
        sa.Column("species", sa.String(20), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "species IN ('dog', 'cat', 'nac', 'other')", name="ck_pets_species_valid"
        ),
    )
    # Toutes les lectures pets filtrent par proprietaire : cet index evite un
    # parcours complet de la table a chaque "mes animaux".
    op.create_index("ix_pets_owner_id", "pets", ["owner_id"])

    # GRANT obligatoire : en testcontainers il n'y a pas de default privileges,
    # chaque nouvelle table doit etre accordee explicitement au role applicatif.
    # Le SELECT servira aux jointures de l'agenda sous transaction tenant (un
    # rendez-vous tenante JOINt son animal) ; pas de GRANT DELETE : soft delete
    # uniquement, la regle est dans le schema.
    op.execute(f"GRANT SELECT, INSERT, UPDATE ON pets TO {APP_ROLE}")


def downgrade() -> None:
    """Defait la migration : table pets puis colonnes ajoutees a clinics."""
    op.drop_table("pets")
    op.drop_column("clinics", "timezone")
    for column in _CLINIC_ADDRESS_COLUMNS:
        op.drop_column("clinics", column)
