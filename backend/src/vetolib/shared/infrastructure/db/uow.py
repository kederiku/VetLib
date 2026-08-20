"""UoW concret SQLAlchemy : transaction, bascule RLS, alimentation de l'outbox.

Adapter du port `UnitOfWork` (shared/application/uow.py) : la couche
application ne voit que le protocole, jamais SQLAlchemy.

C'est ici que se joue l'isolation multi-tenant. Deux modes, que les
conventions du projet nomment `system_uow()` et `tenant_uow(clinic_id)` :

- système (`tenant=None`) : la connexion garde le rôle propriétaire du
  pool, la RLS ne s'applique pas. Réservé aux flux qui, par nature, ne
  connaissent pas encore la clinique (login, refresh, enregistrement
  d'une nouvelle clinique).
- tenant (`tenant=TenantContext(clinic_id)`) : `SET LOCAL ROLE
  vetolib_app` (rôle NOBYPASSRLS) + `SET LOCAL app.clinic_id` -> chaque
  requête de la transaction est filtrée par les policies RLS. La défense
  est dans la base : un WHERE oublié côté Python ne peut pas faire fuiter
  les données d'une autre clinique.
"""

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

    Cycle de vie (toujours via `async with`) : ouverture de la session
    dans `__aenter__`, travail des repositories, puis `commit()` explicite
    par le use case ; sortir du bloc sans commit annule tout (voir
    `__aexit__`).
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
        """Session active, partagée par les repositories du même UoW.

        Garde-fou : hors du bloc `async with`, il n'y a ni session ni
        transaction -> toute utilisation est un bug de programmation.
        """
        if self._session is None:
            raise RuntimeError("UnitOfWork non ouvert (utiliser `async with`).")
        return self._session

    async def __aenter__(self) -> Self:
        self._session = self._session_factory()
        if self._tenant is not None:
            # Ce premier execute() ouvre implicitement la transaction. Les
            # deux SET LOCAL ci-dessous ne vivent donc que jusqu'au
            # commit/rollback, puis la connexion revient "vierge" au pool :
            # aucune fuite de rôle ni de clinic_id vers la requête HTTP
            # suivante qui réutiliserait la même connexion (compatible
            # PgBouncer en mode transaction).
            #
            # SET LOCAL ROLE : on abandonne le rôle propriétaire du pool
            # pour le rôle applicatif (`vetolib_app`, NOBYPASSRLS) ->
            # PostgreSQL applique les policies RLS à toutes les requêtes
            # émises dans cette transaction.
            #
            # Le nom du rôle vient de la configuration, jamais d'une entrée
            # utilisateur (les identifiants SQL ne sont pas paramétrables).
            await self._session.execute(text(f'SET LOCAL ROLE "{self._app_db_role}"'))
            await self._session.execute(
                # set_config(..., true) : équivalent paramétrable de
                # `SET LOCAL app.clinic_id` ; le 3e argument "true" limite
                # la variable à la transaction courante. Les policies RLS
                # la relisent via current_setting('app.clinic_id').
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
        # Sortie du bloc `async with`. Deux cas :
        # - exception : rollback explicite (et purge des événements) ;
        # - sortie normale SANS commit() : close() annule de toute façon
        #   la transaction restée ouverte -> oublier commit() ne persiste
        #   jamais rien, c'est un filet de sécurité voulu.
        try:
            if exc_type is not None:
                await self.rollback()
        finally:
            # close() rend la connexion au pool quoi qu'il arrive (le
            # `finally` protège même le cas où rollback() échouerait).
            await self.session.close()
            self._session = None

    def add_event(self, event: DomainEvent) -> None:
        """Met un événement de domaine en attente, en mémoire seulement.

        Rien ne part sur le réseau ici : l'événement ne sera écrit dans
        l'outbox qu'au `commit()`, et abandonné en cas de rollback.
        """
        self._events.append(event)

    async def commit(self) -> None:
        """Commit atomique : écritures métier + événements -> outbox.

        Coeur du pattern Outbox : les événements sont insérés dans la
        table `outbox_events` dans la MEME transaction que les écritures
        métier. Soit tout est persisté, soit rien : impossible d'annoncer
        un effet de bord sans données commitées (ou l'inverse). Le relais
        TaskIQ lira la table plus tard et publiera les événements
        (livraison at-least-once, sans transaction distribuée).
        """
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
        """Annule la transaction ET purge les événements en attente.

        Un changement métier abandonné ne doit jamais publier d'événement :
        vider le tampon évite qu'un commit ultérieur du même UoW ne rejoue
        des événements devenus faux.
        """
        self._events.clear()
        await self.session.rollback()
