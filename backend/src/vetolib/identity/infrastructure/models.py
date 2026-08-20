"""Modèles SQLAlchemy (tables PostgreSQL) du contexte identity : clinics et users.

Couche infrastructure de l'architecture hexagonale. Ces classes ne décrivent
que le schéma relationnel ; les règles métier vivent dans les entités du
domaine (identity/domain/clinic.py et user.py). D'où DEUX classes par
concept (ClinicModel vs Clinic, UserModel vs User) :

- l'entité domaine est une dataclass pure, testable sans base de données,
  sans aucun import framework (règle de la couche domain) ;
- le modèle SQLAlchemy est un détail technique remplaçable, qui ne doit
  jamais fuir hors de la couche infrastructure. La conversion entre les
  deux est faite explicitement dans repositories.py.

Les mixins partagés (shared/infrastructure/db/base.py) appliquent les
conventions du projet : PK UUID, created_at, soft delete (deleted_at) et,
pour les tables liées à une clinique, clinic_id -> cible des policies RLS.
"""

from typing import Any

from sqlalchemy import Boolean, CheckConstraint, Index, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from vetolib.shared.infrastructure.db.base import (
    Base,
    SoftDeleteMixin,
    TenantMixin,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
)


class ClinicModel(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    """Table `clinics` : une ligne par clinique cliente (= un tenant).

    Pas de TenantMixin ici : la clinique EST le tenant, elle n'appartient
    pas à un autre tenant. C'est sa PK que les autres tables référencent
    via leur colonne clinic_id.
    """

    __tablename__ = "clinics"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    # Adresse structurée aplatie en colonnes, tout-ou-rien : même modèle que
    # OwnerModel (la règle est portée par le value object Address et le
    # schéma Pydantic, pas par une contrainte SQL).
    address_line1: Mapped[str | None] = mapped_column(String(200), nullable=True)
    address_line2: Mapped[str | None] = mapped_column(String(200), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    country: Mapped[str | None] = mapped_column(String(2), nullable=True)
    # Fuseau IANA en Text (longueur libre), validé par le VO Timezone côté
    # domaine. Le server_default sert les lignes créées hors ORM et les
    # cliniques d'avant la migration 0003.
    timezone: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'Europe/Paris'")
    )

    __table_args__ = (
        # Unicité restreinte aux lignes vivantes (soft delete).
        # Index unique PARTIEL (clause WHERE PostgreSQL) : un simple
        # UNIQUE(email) interdirait de recréer une clinique avec l'email
        # d'une clinique supprimée en soft delete (la ligne existe toujours).
        Index(
            "uq_clinics_email_active",
            "email",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )


class UserModel(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, TenantMixin):
    """Table `users` : le personnel des cliniques (ASV, vétérinaire, manager).

    TenantMixin ajoute clinic_id (FK vers clinics, indexée) : c'est la
    colonne sur laquelle s'appuient les policies RLS PostgreSQL pour
    isoler chaque clinique. Le mot de passe n'est JAMAIS stocké en clair :
    seule son empreinte Argon2 (voir password_hasher.py) est persistée.
    """

    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    # String + CHECK plutôt qu'un enum PostgreSQL (pénible en migration).
    role: Mapped[str] = mapped_column(String(30), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    __table_args__ = (
        # Doit rester synchronisé avec l'enum Role du domaine (value_objects.py).
        CheckConstraint("role IN ('asv', 'veterinarian', 'manager')", name="role_valid"),
        # Même logique d'unicité partielle que pour clinics (voir plus haut).
        # NB : unicité GLOBALE de l'email (pas par clinique), car le login se
        # fait par email seul, avant de connaître la clinique de l'utilisateur.
        Index(
            "uq_users_email_active",
            "email",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )


class OwnerModel(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    """Table `owners` : les propriétaires d'animaux (comptes du portail B2C).

    Pas de TenantMixin ni de RLS : un propriétaire est un compte GLOBAL,
    hors tenant — il consultera potentiellement plusieurs cliniques. Le
    rattachement owner <-> clinique passera par les tables tenantées des
    autres contextes (patients, scheduling), jamais par une clé de tenant
    ici. Espace de comptes indépendant de `users` : le même email peut
    exister dans les deux tables (index uniques séparés).
    """

    __tablename__ = "owners"

    email: Mapped[str] = mapped_column(String(320), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    # Adresse structurée, aplatie en colonnes (pas de table dédiée : une
    # seule adresse par compte au bootstrap). Tout-ou-rien : soit les champs
    # obligatoires (line1, postal_code, city) sont tous renseignés, soit
    # tous NULL — la règle est portée par le value object Address et le
    # schéma Pydantic, pas par une contrainte SQL (bootstrap).
    address_line1: Mapped[str | None] = mapped_column(String(200), nullable=True)
    address_line2: Mapped[str | None] = mapped_column(String(200), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    country: Mapped[str | None] = mapped_column(String(2), nullable=True)
    # JSONB (choix du document de conception pour les préférences) : on
    # pourra ajouter des canaux (push...) sans migration de schéma.
    notification_preferences: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text('\'{"email": true, "sms": false}\'::jsonb')
    )

    __table_args__ = (
        # Unicité restreinte aux comptes vivants (soft delete), comme users.
        Index(
            "uq_owners_email_active",
            "email",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )
