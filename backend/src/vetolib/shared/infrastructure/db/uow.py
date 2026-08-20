from types import TracebackType
from typing import Self

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from vetolib.shared.application.uow import TenantContext
from vetolib.shared.domain.events import DomainEvent
from vetolib.shared.infrastructure.outbox.model import OutboxEventModel


class SqlAlchemyUnitOfWork:
    """UoW SQLAlchemy : une session/transaction, événements collectés -> outbox.

    - `tenant=None` : UoW « système » — la connexion reste sur le rôle du pool
      (propriétaire, RLS non appliquée). Réservé aux flux pré-tenant par nature
      (login, refresh, enregistrement de clinique).
    - `tenant=TenantContext(...)` : bascule la transaction sur le rôle applicatif
      (`SET LOCAL ROLE`, auto-reset au commit/rollback — compatible PgBouncer)
      et pose `app.clinic_id` -> les policies RLS s'appliquent.
    """

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        *,
        app_db_role: str,
        tenant: TenantContext | None = None,
    ) -> None:
        self._session_factory = session_factory
        self._app_db_role = app_db_role
        self._tenant = tenant
        self._events: list[DomainEvent] = []
        self._session: AsyncSession | None = None

    @property
    def session(self) -> AsyncSession:
        if self._session is None:
            raise RuntimeError("UnitOfWork non ouvert (utiliser `async with`).")
        return self._session

    async def __aenter__(self) -> Self:
        self._session = self._session_factory()
        if self._tenant is not None:
            # Le nom du rôle vient de la configuration, jamais d'une entrée
            # utilisateur (les identifiants SQL ne sont pas paramétrables).
            await self._session.execute(text(f'SET LOCAL ROLE "{self._app_db_role}"'))
            await self._session.execute(
                text("SELECT set_config('app.clinic_id', :clinic_id, true)"),
                {"clinic_id": str(self._tenant.clinic_id)},
            )
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        try:
            if exc_type is not None:
                await self.rollback()
        finally:
            await self.session.close()
            self._session = None

    def add_event(self, event: DomainEvent) -> None:
        self._events.append(event)

    async def commit(self) -> None:
        for event in self._events:
            self.session.add(
                OutboxEventModel(
                    id=event.event_id,
                    event_type=event.event_type,
                    payload=event.payload(),
                    occurred_at=event.occurred_at,
                )
            )
        self._events.clear()
        await self.session.commit()

    async def rollback(self) -> None:
        self._events.clear()
        await self.session.rollback()
