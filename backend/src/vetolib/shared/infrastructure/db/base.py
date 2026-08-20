"""Socle SQLAlchemy commun : Base declarative et mixins de colonnes.

Couche `shared/infrastructure/db` de l'architecture hexagonale : tous les
modèles ORM des bounded contexts (identity, patients, scheduling, billing)
héritent de `Base` et composent les mixins ci-dessous. Le domaine, lui,
n'importe jamais ce module : les entités métier restent des dataclasses
pures, et c'est l'infrastructure qui fait la traduction entité <-> table.

Les mixins encodent trois conventions structurantes du projet :
- `UUIDPrimaryKeyMixin` : PK UUID partout, jamais d'entier auto-incrémenté ;
- `TimestampMixin` / `SoftDeleteMixin` : horodatage de création et
  suppression logique (`deleted_at`), jamais de DELETE physique ;
- `TenantMixin` : colonne `clinic_id`, pivot de l'isolation multi-tenant
  sur laquelle s'appuient les policies RLS de PostgreSQL.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, MetaData, func
from sqlalchemy.orm import DeclarativeBase, Mapped, declared_attr, mapped_column

# Nommage déterministe de toutes les contraintes et index. Sans cette
# convention, PostgreSQL génère des noms arbitraires et une migration
# Alembic ne peut pas retrouver une contrainte pour la modifier ou la
# supprimer (le nom différerait d'un environnement à l'autre).
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Classe mère de tous les modèles ORM du projet.

    Un seul `metadata` partagé par tous les contextes : Alembic voit ainsi
    l'ensemble du schéma pour l'autogénération des migrations.
    """

    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class UUIDPrimaryKeyMixin:
    """PK UUID, convention appliquée à toutes les tables du projet.

    Volontairement sans `default` : l'identifiant est généré par la couche
    domaine (uuid4 à la création de l'entité), pas par la base. On connaît
    donc l'id avant même l'INSERT, ce qui simplifie les événements de
    domaine, les réponses API et les liens entre agrégats.
    """

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)


class TimestampMixin:
    """Horodatage de création de la ligne.

    Dans le flux normal, `created_at` est fourni par la couche domaine via
    le port Clock (les repositories le copient depuis l'entité) : la base
    ne le calcule pas. Le `server_default=func.now()` n'est qu'un filet de
    sécurité pour un INSERT fait hors ORM (script SQL, réparation manuelle).
    `timezone=True` -> colonne `timestamptz`, stockée en UTC.
    """

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class SoftDeleteMixin:
    """Historique légal : jamais de DELETE, on pose `deleted_at`.

    `NULL` = ligne vivante. Corollaire important : toute lecture doit
    filtrer `deleted_at IS NULL` (c'est aux repositories d'y veiller),
    sinon les enregistrements "supprimés" réapparaissent.
    """

    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class TenantMixin:
    """`clinic_id` : clé d'isolation multi-tenant, cible des policies RLS.

    Les policies PostgreSQL comparent cette colonne à la variable de
    transaction `app.clinic_id` posée par le UoW tenant : le filtrage a
    lieu dans la base, même si une requête Python oublie son WHERE.
    """

    # `declared_attr` : une ForeignKey est un objet qui doit être
    # instancié pour chaque table concrète ; un simple attribut de classe
    # serait partagé (et donc cassé) entre tous les modèles qui héritent
    # du mixin.
    @declared_attr
    def clinic_id(cls) -> Mapped[uuid.UUID]:  # noqa: N805
        # Le N805 est ignoré : SQLAlchemy appelle cette méthode avec la classe en
        # premier argument (à la manière d'un classmethod), ce que ruff ne
        # peut pas deviner depuis le décorateur.
        return mapped_column(ForeignKey("clinics.id"), nullable=False, index=True)
