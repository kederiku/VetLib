"""identity : journal d'audit des actions du back-office plateforme.

Revision ID: 0009
Revises: 0008
Create Date: 2026-08-22

Deux volets.

1. La table `admin_audit_log`. Append-only : ni deleted_at, ni update, ni
   delete cote port. Elle repond a une seule question, mais celle qu'on se
   pose apres coup : "qui a suspendu cette clinique, et quand ?". Sans elle,
   un incident de ce genre reste inexplicable -- et le registre RGPD des
   traitements a un trou.

   Pourquoi pas l'outbox deja en place : c'est un TRANSPORT destine a etre
   purge (son relais porte un TODO en ce sens), et DomainEvent ne porte
   aucun acteur. Les deux coexistent : le journal dit qui a fait quoi,
   l'outbox declenche les effets de bord.

   Comme platform_admins, elle est hors du modele tenant et le role
   applicatif n'y a AUCUN droit -- meme piege d'ALTER DEFAULT PRIVILEGES a
   desamorcer (voir la migration 0008).

2. L'extension `unaccent`. Les recherches du back-office comparent en
   lower(unaccent(...)) : ILIKE couvre la casse mais PAS les accents, et sur
   un produit francais chercher "veterinaire" doit trouver "Veterinaire".

   Aucun index de recherche n'est cree, et c'est un choix chiffre. Un
   `ILIKE '%terme%'` ne peut etre servi QUE par un index trigramme
   (pg_trgm + GIN) : un btree sur lower(email) ne sert que la recherche par
   PREFIXE, ce qui n'est pas le comportement attendu d'un champ de
   recherche. Or a l'echelle actuelle -- quelques centaines de cliniques,
   quelques milliers de comptes -- un parcours sequentiel se compte en
   fractions de milliseconde, moins que le temps que mettrait le
   planificateur a considerer l'index. Un GIN, lui, coute tout de suite :
   ecriture amplifiee a chaque INSERT/UPDATE, et un objet de plus a
   maintenir.

   A AJOUTER quand une de ces tables depassera ~50 000 lignes, ou des qu'un
   EXPLAIN ANALYZE de recherche depassera 50 ms :

       CREATE EXTENSION IF NOT EXISTS pg_trgm;
       CREATE INDEX ix_clinics_name_trgm ON clinics USING gin (name gin_trgm_ops);

   Attention alors : unaccent() est declaree STABLE et non IMMUTABLE, donc
   l'expression lower(unaccent(col)) n'est pas indexable telle quelle. Il
   faudra soit indexer la colonne brute et abandonner unaccent dans la
   requete, soit envelopper l'appel dans une fonction SQL IMMUTABLE maison.
   Le choix se fera avec les chiffres sous les yeux, pas avant.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "vetolib_app"


def upgrade() -> None:
    """Cree la table d'audit, ses index, et installe unaccent."""
    op.create_table(
        "admin_audit_log",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "actor_id",
            sa.Uuid(),
            sa.ForeignKey("platform_admins.id", name="fk_admin_audit_log_actor_id_platform_admins"),
            nullable=False,
        ),
        sa.Column("actor_email", sa.String(320), nullable=False),
        sa.Column("action", sa.String(60), nullable=False),
        sa.Column("target_type", sa.String(20), nullable=False),
        sa.Column("target_id", sa.Uuid(), nullable=False),
        sa.Column(
            "details", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")
        ),
    )
    # Les deux seules questions qu'on posera : "que s'est-il passe sur CET
    # objet ?" et "qu'a fait CETTE personne ?". occurred_at en derniere
    # position sert le tri antichronologique depuis l'index lui-meme.
    op.create_index(
        "ix_admin_audit_log_target", "admin_audit_log", ["target_type", "target_id", "occurred_at"]
    )
    op.create_index("ix_admin_audit_log_actor", "admin_audit_log", ["actor_id", "occurred_at"])

    # Meme REVOKE que platform_admins : aucune transaction tenant n'a de
    # raison de lire le journal des actions des exploitants.
    op.execute(f"REVOKE ALL ON admin_audit_log FROM {APP_ROLE}")

    # Recherche insensible aux accents (voir la docstring de module).
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")


def downgrade() -> None:
    """Supprime la table. L'extension unaccent est LAISSEE en place.

    La retirer casserait toute autre requete qui l'utiliserait, et une
    extension inutilisee ne coute rien -- c'est la meme prudence que pour
    pgcrypto et btree_gist, installees par les migrations precedentes.
    """
    op.drop_table("admin_audit_log")
