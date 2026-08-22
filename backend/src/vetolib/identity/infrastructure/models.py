"""Modèles SQLAlchemy du contexte identity : clinics, users, owners, platform_admins.

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

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, String, Text, text
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
    # Statut d'exploitation pilote par le back-office plateforme (suspension
    # pour impaye, fin de contrat...). server_default plutot que default
    # Python : les lignes creees hors ORM (migrations, scripts) recoivent la
    # bonne valeur, et la migration 0007 n'a pas besoin d'etape de backfill.
    # Voir Clinic.is_active pour la raison de ne PAS reutiliser deleted_at.
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))

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
    # Pendant B2C de UserModel.is_active : desactivation par le back-office,
    # reversible, sans toucher aux animaux ni aux rendez-vous.
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))

    __table_args__ = (
        # Unicité restreinte aux comptes vivants (soft delete), comme users.
        Index(
            "uq_owners_email_active",
            "email",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )


class PlatformAdminModel(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    """Table `platform_admins` : les fondateurs de la plateforme (back-office).

    Troisieme espace de comptes, totalement cloisonne des deux autres. Pas de
    TenantMixin et pas de RLS : un super-admin n'appartient a AUCUNE clinique,
    il n'existe donc pas de colonne sur laquelle une policy pourrait filtrer.

    La protection de cette table ne passe donc pas par la RLS mais par les
    PRIVILEGES : la migration 0008 REVOQUE tout droit du role applicatif
    vetolib_app dessus. Une requete emise par erreur sous une transaction
    tenant (SET LOCAL ROLE vetolib_app) echoue franchement en "permission
    denied", au lieu de renvoyer silencieusement des empreintes de mots de
    passe tout-puissants.
    """

    __tablename__ = "platform_admins"

    email: Mapped[str] = mapped_column(String(320), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    # Detection des comptes dormants : un UPDATE par login, sur une table de
    # quelques lignes. Volontairement absent de users et owners, ou la meme
    # colonne ajouterait une ecriture a chaque connexion de tout le parc.
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        # Meme unicite partielle que les deux autres espaces de comptes.
        Index(
            "uq_platform_admins_email_active",
            "email",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )


class AdminAuditLogModel(Base, UUIDPrimaryKeyMixin):
    """Table `admin_audit_log` : journal append-only des actions du back-office.

    Volontairement SANS SoftDeleteMixin et SANS TimestampMixin :

    - pas de deleted_at, parce qu'une ligne d'audit ne se supprime pas, meme
      logiquement. Le port n'expose d'ailleurs ni update ni delete ;
    - pas de created_at genere par la base : l'horodatage metier est
      `occurred_at`, fourni par le port Clock comme partout ailleurs. En
      avoir deux inviterait a se demander lequel fait foi.

    Comme platform_admins, cette table est hors du modele tenant et le role
    applicatif n'y a aucun droit (REVOKE de la migration 0009).
    """

    __tablename__ = "admin_audit_log"

    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    actor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("platform_admins.id", name="fk_admin_audit_log_actor_id_platform_admins"),
        nullable=False,
    )
    # Denormalise : l'email reste lisible meme si le compte est desactive
    # plus tard, et une jointure de moins sur chaque ligne d'ecran.
    actor_email: Mapped[str] = mapped_column(String(320), nullable=False)
    action: Mapped[str] = mapped_column(String(60), nullable=False)
    target_type: Mapped[str] = mapped_column(String(20), nullable=False)
    target_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    # Avant/apres. JAMAIS de mot de passe ni d'empreinte : ce journal est
    # destine a etre lu.
    details: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )

    __table_args__ = (
        # Les deux seules questions qu'on posera a ce journal : "que s'est-il
        # passe sur CET objet ?" et "qu'a fait CETTE personne ?". Un index
        # par question, chacun se terminant par occurred_at pour que le tri
        # antichronologique soit servi par l'index lui-meme.
        Index("ix_admin_audit_log_target", "target_type", "target_id", "occurred_at"),
        Index("ix_admin_audit_log_actor", "actor_id", "occurred_at"),
    )
