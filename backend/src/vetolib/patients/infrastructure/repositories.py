"""Repositories concrets (SQLAlchemy async) du contexte patients.

Implémente le port PetRepository (patients/domain/repositories.py). Mêmes
conventions que dans identity : la session vient du UnitOfWork (jamais de
commit ici), toutes les lectures filtrent deleted_at IS NULL (soft delete),
mapping explicite model <-> entité pour que le modèle SQLAlchemy ne fuie
jamais hors de la couche infrastructure.

Spécificité du port : le filtre owner_id est DANS chaque requête de lecture
(WHERE en SQL), conformément au contrat get_for_owner/list_for_owner --
c'est la seule barrière entre les animaux de deux propriétaires, la table
étant globale (pas de RLS, voir models.py).
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from vetolib.patients.domain.pet import Pet, Sex, Species
from vetolib.patients.infrastructure.models import PetModel


def _pet_to_entity(model: PetModel) -> Pet:
    """Reconstruit l'entité domaine Pet depuis une ligne de la table.

    La chaîne species redevient un membre de l'enum Species : une valeur
    inconnue (impossible grâce au CHECK SQL) lèverait immédiatement.
    """
    return Pet(
        id=model.id,
        created_at=model.created_at,
        deleted_at=model.deleted_at,
        owner_id=model.owner_id,
        name=model.name,
        species=Species(model.species),
        birth_date=model.birth_date,
        sex=Sex(model.sex),
        breed=model.breed,
        sterilized=model.sterilized,
    )


def _pet_to_model(entity: Pet) -> PetModel:
    """Aplatit l'entité Pet en ligne SQL (les enums -> str).

    ATTENTION : update() persiste via session.merge(_pet_to_model(pet)),
    qui ECRIT TOUTES les colonnes du modele construit ici. Un champ oublie
    dans cette fonction serait donc remis a NULL a chaque edition, sans la
    moindre erreur -- une perte de donnees silencieuse. C'est pourquoi un
    test d'integration relit la ligne en base apres un PUT.
    """
    return PetModel(
        id=entity.id,
        created_at=entity.created_at,
        deleted_at=entity.deleted_at,
        owner_id=entity.owner_id,
        name=entity.name,
        species=entity.species.value,
        birth_date=entity.birth_date,
        sex=entity.sex.value,
        breed=entity.breed,
        sterilized=entity.sterilized,
    )


class SqlAlchemyPetRepository:
    """Implémentation PostgreSQL du port PetRepository."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_for_owner(self, owner_id: uuid.UUID) -> list[Pet]:
        # Tri par nom : liste stable et prévisible pour l'écran "mes animaux".
        stmt = (
            select(PetModel)
            .where(PetModel.owner_id == owner_id, PetModel.deleted_at.is_(None))
            .order_by(PetModel.name)
        )
        models = (await self._session.execute(stmt)).scalars().all()
        return [_pet_to_entity(model) for model in models]

    async def get_for_owner(self, pet_id: uuid.UUID, owner_id: uuid.UUID) -> Pet | None:
        # Le filtre d'appartenance est DANS le WHERE : l'animal d'un autre
        # owner n'est jamais chargé en mémoire, il est introuvable au niveau
        # SQL -- indistinguable d'un animal inexistant (-> 404 uniforme).
        stmt = select(PetModel).where(
            PetModel.id == pet_id,
            PetModel.owner_id == owner_id,
            PetModel.deleted_at.is_(None),
        )
        model = (await self._session.execute(stmt)).scalar_one_or_none()
        return None if model is None else _pet_to_entity(model)

    async def add(self, pet: Pet) -> None:
        # L'INSERT réel part au flush/commit, déclenché par le UoW.
        self._session.add(_pet_to_model(pet))

    async def update(self, pet: Pet) -> None:
        # merge : re-fusionne l'entité détachée dans la session (SELECT puis
        # UPDATE au flush) -- même approche que dans identity.
        await self._session.merge(_pet_to_model(pet))
