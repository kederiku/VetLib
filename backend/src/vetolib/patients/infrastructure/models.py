"""Modèles SQLAlchemy (tables PostgreSQL) du contexte patients : pets.

Couche infrastructure : cette classe ne décrit que le schéma relationnel ;
les règles métier vivent dans l'entité Pet (patients/domain/pet.py). Deux
classes par concept (PetModel vs Pet), conversion explicite dans
repositories.py -- même organisation que dans identity.

NB : ce module doit être importé par migrations/env.py pour que la table
soit visible de l'autogénération Alembic (un seul Base.metadata partagé).
"""

import uuid
from datetime import date

from sqlalchemy import Boolean, CheckConstraint, Date, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from vetolib.shared.infrastructure.db.base import (
    Base,
    SoftDeleteMixin,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
)


class PetModel(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    """Table `pets` : les animaux des propriétaires (comptes B2C).

    PAS de TenantMixin ni de RLS, comme owners : un animal appartient à un
    PROPRIETAIRE (compte global, hors tenant), pas à une clinique -- Rex
    reste le même chien chez tous les vétérinaires que son maître consulte.
    Le lien animal <-> clinique viendra des tables tenantées du contexte
    (les futurs medical_records), chacune protégée par SA propre RLS. La
    barrière d'accès sur pets est donc applicative : filtre owner_id imposé
    par la signature du port PetRepository.
    """

    __tablename__ = "pets"

    # index=True : toutes les lectures filtrent par propriétaire (écran "mes
    # animaux"), l'index évite un parcours complet de la table. Le nom de la
    # FK (fk_pets_owner_id_owners) et de l'index (ix_pets_owner_id) dérivent
    # du naming_convention partagé, à l'identique de la migration 0003.
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("owners.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    # String + CHECK plutôt qu'un enum PostgreSQL (pénible en migration),
    # comme users.role dans identity.
    species: Mapped[str] = mapped_column(String(20), nullable=False)

    # --- Fiche enrichie. Tout est facultatif : declarer un animal en
    # urgence ne doit demander qu'un nom et une espece.
    birth_date: Mapped[date | None] = mapped_column(Date(), nullable=True)
    # NOT NULL avec defaut serveur 'unknown' : "je ne sais pas" est une
    # VALEUR de l'enum, pas une absence. Une colonne nullable offrirait deux
    # facons d'ecrire la meme chose (NULL et 'unknown'), donc un piege de
    # comparaison garanti. Le server_default epargne aussi tout backfill sur
    # les lignes existantes, et protege les INSERT hors ORM.
    sex: Mapped[str] = mapped_column(String(10), nullable=False, server_default="unknown")
    breed: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Tri-etat : True / False / NULL "non renseigne". Un booleen ne peut pas
    # porter un troisieme membre, NULL s'en charge.
    sterilized: Mapped[bool | None] = mapped_column(Boolean(), nullable=True)

    __table_args__ = (
        # Doivent rester synchronisés avec les enums du domaine (pet.py).
        # Noms COURTS : la naming_convention du MetaData ajoute elle-même le
        # préfixe ck_<table>_ -- passer le nom déjà préfixé produirait
        # ck_pets_ck_pets_..., exactement ce que la migration 0005 a dû
        # réparer.
        CheckConstraint("species IN ('dog', 'cat', 'nac', 'other')", name="species_valid"),
        CheckConstraint("sex IN ('male', 'female', 'unknown')", name="sex_valid"),
    )
