"""Repositories concrets (SQLAlchemy async) du contexte identity.

Couche infrastructure : ces classes implémentent les ports définis dans
identity/domain/repositories.py (ClinicRepository, UserRepository). Le
domaine et les use cases ne connaissent que ces interfaces ; on peut donc
les tester avec des fakes en mémoire et changer de stockage sans toucher
au métier (principe ports & adapters).

Points clés :
- chaque repository reçoit la session ouverte par l'Unit of Work (uow.py) :
  il ne commit jamais lui-même, la transaction appartient au UoW ;
- toutes les lectures filtrent `deleted_at IS NULL` : convention soft
  delete du projet (on ne supprime jamais physiquement une ligne) ;
- aucun filtre clinic_id dans les requêtes : sous tenant_uow, la RLS
  PostgreSQL l'applique toute seule côté serveur ; sous system_uow (login
  par email, avant de connaître la clinique), la requête voit tout.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from vetolib.identity.domain.clinic import Clinic
from vetolib.identity.domain.user import User
from vetolib.identity.domain.value_objects import Email, HashedPassword, Role
from vetolib.identity.infrastructure.models import ClinicModel, UserModel

# Mapping explicite model <-> entité : les models SQLAlchemy ne fuient
# jamais hors de la couche infrastructure.
# C'est volontairement du code "bête" et répétitif : quatre petites
# fonctions faciles à lire valent mieux qu'un mapper automatique magique.
# Au passage, les chaînes brutes de la DB redeviennent des value objects
# (Email, HashedPassword, Role) : leur validation se rejoue à la relecture.


def _clinic_to_entity(model: ClinicModel) -> Clinic:
    """Reconstruit l'entité domaine Clinic depuis une ligne de la table."""
    return Clinic(
        id=model.id,
        created_at=model.created_at,
        deleted_at=model.deleted_at,
        name=model.name,
        email=Email(model.email),
        phone=model.phone,
    )


def _clinic_to_model(entity: Clinic) -> ClinicModel:
    """Aplatit l'entité Clinic en ligne SQL (les value objects -> str)."""
    return ClinicModel(
        id=entity.id,
        created_at=entity.created_at,
        deleted_at=entity.deleted_at,
        name=entity.name,
        email=entity.email.value,
        phone=entity.phone,
    )


def _user_to_entity(model: UserModel) -> User:
    return User(
        id=model.id,
        created_at=model.created_at,
        deleted_at=model.deleted_at,
        clinic_id=model.clinic_id,
        email=Email(model.email),
        hashed_password=HashedPassword(model.hashed_password),
        first_name=model.first_name,
        last_name=model.last_name,
        role=Role(model.role),
        is_active=model.is_active,
    )


def _user_to_model(entity: User) -> UserModel:
    return UserModel(
        id=entity.id,
        created_at=entity.created_at,
        deleted_at=entity.deleted_at,
        clinic_id=entity.clinic_id,
        email=entity.email.value,
        hashed_password=entity.hashed_password.value,
        first_name=entity.first_name,
        last_name=entity.last_name,
        role=entity.role.value,
        is_active=entity.is_active,
    )


class SqlAlchemyClinicRepository:
    """Implémentation PostgreSQL du port ClinicRepository."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, clinic_id: uuid.UUID) -> Clinic | None:
        stmt = select(ClinicModel).where(
            ClinicModel.id == clinic_id, ClinicModel.deleted_at.is_(None)
        )
        model = (await self._session.execute(stmt)).scalar_one_or_none()
        return None if model is None else _clinic_to_entity(model)

    async def add(self, clinic: Clinic) -> None:
        # `session.add` ne fait qu'enregistrer l'objet dans la session :
        # l'INSERT réel part au flush/commit, déclenché par le UoW. Le
        # repository reste ainsi sans effet tant qu'on n'a pas commité.
        self._session.add(_clinic_to_model(clinic))

    async def exists_with_email(self, email: Email) -> bool:
        """Contrôle applicatif d'unicité (message d'erreur propre au plus tôt).

        Attention : ce SELECT ne protège pas de deux requêtes concurrentes.
        La vraie garantie est l'index unique partiel, dont la violation est
        traduite en erreur domaine au commit (voir uow.py).
        """
        stmt = (
            select(func.count())
            .select_from(ClinicModel)
            .where(ClinicModel.email == email.value, ClinicModel.deleted_at.is_(None))
        )
        count = (await self._session.execute(stmt)).scalar_one()
        return count > 0


class SqlAlchemyUserRepository:
    """Implémentation PostgreSQL du port UserRepository."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, user_id: uuid.UUID) -> User | None:
        stmt = select(UserModel).where(UserModel.id == user_id, UserModel.deleted_at.is_(None))
        model = (await self._session.execute(stmt)).scalar_one_or_none()
        return None if model is None else _user_to_entity(model)

    async def get_by_email(self, email: Email) -> User | None:
        # Utilisé au login, donc sous system_uow (on ne connaît pas encore
        # la clinique) : c'est un des rares chemins qui lit hors RLS.
        stmt = select(UserModel).where(
            UserModel.email == email.value, UserModel.deleted_at.is_(None)
        )
        model = (await self._session.execute(stmt)).scalar_one_or_none()
        return None if model is None else _user_to_entity(model)

    async def add(self, user: User) -> None:
        self._session.add(_user_to_model(user))

    async def update(self, user: User) -> None:
        # L'entité domaine est détachée de la session (on l'a reconstruite
        # via _user_to_entity). `merge` recolle un modèle "jetable" portant
        # la même PK : SQLAlchemy recharge la ligne, recopie les champs et
        # émettra un UPDATE au flush. Plus simple que de tracer les objets.
        await self._session.merge(_user_to_model(user))
