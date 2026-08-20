import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from vetolib.identity.domain.clinic import Clinic
from vetolib.identity.domain.user import User
from vetolib.identity.domain.value_objects import Email, HashedPassword, Role
from vetolib.identity.infrastructure.models import ClinicModel, UserModel

# Mapping explicite model <-> entité : les models SQLAlchemy ne fuient
# jamais hors de la couche infrastructure.


def _clinic_to_entity(model: ClinicModel) -> Clinic:
    return Clinic(
        id=model.id,
        created_at=model.created_at,
        deleted_at=model.deleted_at,
        name=model.name,
        email=Email(model.email),
        phone=model.phone,
    )


def _clinic_to_model(entity: Clinic) -> ClinicModel:
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
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, clinic_id: uuid.UUID) -> Clinic | None:
        stmt = select(ClinicModel).where(
            ClinicModel.id == clinic_id, ClinicModel.deleted_at.is_(None)
        )
        model = (await self._session.execute(stmt)).scalar_one_or_none()
        return None if model is None else _clinic_to_entity(model)

    async def add(self, clinic: Clinic) -> None:
        self._session.add(_clinic_to_model(clinic))

    async def exists_with_email(self, email: Email) -> bool:
        stmt = (
            select(func.count())
            .select_from(ClinicModel)
            .where(ClinicModel.email == email.value, ClinicModel.deleted_at.is_(None))
        )
        count = (await self._session.execute(stmt)).scalar_one()
        return count > 0


class SqlAlchemyUserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, user_id: uuid.UUID) -> User | None:
        stmt = select(UserModel).where(UserModel.id == user_id, UserModel.deleted_at.is_(None))
        model = (await self._session.execute(stmt)).scalar_one_or_none()
        return None if model is None else _user_to_entity(model)

    async def get_by_email(self, email: Email) -> User | None:
        stmt = select(UserModel).where(
            UserModel.email == email.value, UserModel.deleted_at.is_(None)
        )
        model = (await self._session.execute(stmt)).scalar_one_or_none()
        return None if model is None else _user_to_entity(model)

    async def add(self, user: User) -> None:
        self._session.add(_user_to_model(user))

    async def update(self, user: User) -> None:
        await self._session.merge(_user_to_model(user))
