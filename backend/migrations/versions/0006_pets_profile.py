"""patients : enrichit la fiche animal (naissance, sexe, race, sterilisation).

Revision ID: 0006
Revises: 0005
Create Date: 2026-08-21

La fiche animal du bootstrap ne portait que deux informations (nom, espece),
ce qui rendait l'ecran "mes animaux" du portail proprietaires a peu pres
vide. Quatre colonnes s'y ajoutent, toutes facultatives : declarer un animal
en urgence ne doit toujours demander qu'un nom et une espece.

Le POIDS est volontairement absent : c'est une mesure datee, pas un attribut
d'identite. Une colonne scalaire deviendrait silencieusement perimee (un
chiot triple son poids en trois mois), et un poids perime affiche sur une
fiche est pire qu'un poids absent. Sa place est une table de mesures
tenantee du futur dossier medical, car une pesee est un acte realise PAR une
clinique. Voir la docstring de patients/domain/pet.py.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Listees une fois pour que le downgrade reste symetrique de l'upgrade sans
# duplication (meme procede que _CLINIC_ADDRESS_COLUMNS en 0003).
_NEW_COLUMNS = ("birth_date", "sex", "breed", "sterilized")


def upgrade() -> None:
    """Ajoute les quatre colonnes de la fiche enrichie."""
    op.add_column("pets", sa.Column("birth_date", sa.Date(), nullable=True))
    op.add_column("pets", sa.Column("breed", sa.String(100), nullable=True))
    op.add_column("pets", sa.Column("sterilized", sa.Boolean(), nullable=True))
    # NOT NULL + server_default : "inconnu" est une VALEUR de l'enum, pas une
    # absence -- une colonne nullable offrirait deux facons d'ecrire la meme
    # chose. Le defaut serveur donne leur valeur aux lignes existantes sans
    # etape de backfill (meme pattern que clinics.timezone en 0003) et
    # protege les INSERT hors ORM ; ne pas le retirer "pour faire propre".
    op.add_column(
        "pets",
        sa.Column("sex", sa.String(10), nullable=False, server_default="unknown"),
    )
    # NOM COURT ("sex_valid") et non "ck_pets_sex_valid" : la naming
    # convention du MetaData ajoute elle-meme le prefixe ck_<table>_. Passer
    # le nom deja prefixe produirait ck_pets_ck_pets_sex_valid, exactement la
    # derive que la migration 0005 a du reparer.
    op.create_check_constraint("sex_valid", "pets", "sex IN ('male', 'female', 'unknown')")
    # Pas de GRANT : les privileges de 0003 sont poses AU NIVEAU TABLE,
    # PostgreSQL les etend donc automatiquement aux nouvelles colonnes.
    # Pas d'index : aucune de ces colonnes n'est un critere de filtre, la
    # seule clause WHERE de pets reste owner_id.


def downgrade() -> None:
    """Retire les quatre colonnes (et, avec `sex`, sa contrainte CHECK).

    La perte des donnees saisies est inherente a ce downgrade : ces colonnes
    n'existent nulle part ailleurs. La contrainte n'est pas droppee
    explicitement -- PostgreSQL supprime automatiquement un CHECK dont la
    colonne referencee disparait, ce qui evite de rejouer la question du
    nommage a l'envers.
    """
    for column in _NEW_COLUMNS:
        op.drop_column("pets", column)
