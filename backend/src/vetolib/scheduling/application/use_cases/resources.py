"""Use cases des ressources reservables (praticiens) -- reglages staff.

Meme mecanique que les types de rendez-vous : UoW tenant, RLS, 404 pour
tout ce qui n'appartient pas a la clinique du token.
"""

import uuid

from vetolib.scheduling.application.dto import (
    CreateResourceCommand,
    ResourceDto,
    UpdateResourceCommand,
)
from vetolib.scheduling.application.ports import (
    SchedulingUnitOfWork,
    SchedulingUoWFactory,
)
from vetolib.scheduling.domain.errors import ResourceNotFoundError
from vetolib.scheduling.domain.resource import Resource
from vetolib.shared.application.clock import Clock
from vetolib.shared.domain.errors import EntityNotFoundError


def _to_dto(entity: Resource) -> ResourceDto:
    return ResourceDto(
        id=entity.id,
        kind=entity.kind,
        name=entity.name,
        user_id=entity.user_id,
        active=entity.active,
    )


async def _check_user_link(uow: SchedulingUnitOfWork, user_id: uuid.UUID | None) -> None:
    """Valide un lien resource -> compte staff, sous la transaction TENANT.

    La RLS de la table users filtre par clinique : un user d'un autre
    tenant est INVISIBLE ici (le lien cross-clinique est donc impossible),
    et un id inconnu devient un 404 propre au lieu d'une violation de FK
    au commit (les triggers de FK, eux, ne sont pas soumis a la RLS).
    """
    if user_id is not None and not await uow.staff_info.exists(user_id):
        raise EntityNotFoundError("Utilisateur introuvable dans cette clinique.")


class ListResources:
    def __init__(self, uow_factory: SchedulingUoWFactory) -> None:
        self._uow_factory = uow_factory

    async def execute(self) -> list[ResourceDto]:
        async with self._uow_factory() as uow:
            return [_to_dto(r) for r in await uow.resources.list_all()]


class CreateResource:
    def __init__(self, uow_factory: SchedulingUoWFactory, clock: Clock) -> None:
        self._uow_factory = uow_factory
        self._clock = clock

    async def execute(self, cmd: CreateResourceCommand) -> ResourceDto:
        resource = Resource.create(
            clinic_id=cmd.clinic_id,
            name=cmd.name,
            user_id=cmd.user_id,
            now=self._clock.now(),
        )
        async with self._uow_factory() as uow:
            await _check_user_link(uow, cmd.user_id)
            await uow.resources.add(resource)
            await uow.commit()
            return _to_dto(resource)


class UpdateResource:
    def __init__(self, uow_factory: SchedulingUoWFactory) -> None:
        self._uow_factory = uow_factory

    async def execute(self, cmd: UpdateResourceCommand) -> ResourceDto:
        async with self._uow_factory() as uow:
            resource = await uow.resources.get_by_id(cmd.resource_id)
            if resource is None:
                raise ResourceNotFoundError("Praticien introuvable.")
            await _check_user_link(uow, cmd.user_id)
            resource.update(name=cmd.name, active=cmd.active, user_id=cmd.user_id)
            await uow.resources.update(resource)
            await uow.commit()
            return _to_dto(resource)


class DeleteResource:
    def __init__(self, uow_factory: SchedulingUoWFactory, clock: Clock) -> None:
        self._uow_factory = uow_factory
        self._clock = clock

    async def execute(self, resource_id: uuid.UUID) -> None:
        async with self._uow_factory() as uow:
            resource = await uow.resources.get_by_id(resource_id)
            if resource is None:
                raise ResourceNotFoundError("Praticien introuvable.")
            resource.soft_delete(self._clock.now())
            await uow.resources.update(resource)
            await uow.commit()
