"""Port Unit of Work (UoW) : la frontière transactionnelle des use cases
(contexte `shared`, couche application).

Le UoW est un port au sens hexagonal : les use cases ne voient que ce
Protocol ; l'adapter concret SqlAlchemyUnitOfWork vit dans
shared/infrastructure/db/uow.py et s'obtient via deux fabriques :

- system_uow() : flux "pré-tenant" (login, refresh, enregistrement d'une
  clinique), quand aucune clinique n'est encore identifiée. La connexion
  garde le rôle propriétaire du pool, la RLS ne s'applique pas.
- tenant_uow(clinic_id) : exécute SET LOCAL ROLE vetolib_app (rôle
  applicatif NOBYPASSRLS) puis SET LOCAL app.clinic_id. PostgreSQL
  filtre alors LUI-MÊME chaque requête via les policies RLS : même un
  bug applicatif (un WHERE clinic_id oublié) ne peut pas atteindre les
  données d'une autre clinique. SET LOCAL est borné à la transaction :
  rien ne fuit quand la connexion retourne au pool.

Pourquoi un UoW ? Un use case modifie souvent plusieurs entités ET émet
des événements ; tout doit réussir ou échouer d'un seul bloc. Le UoW
matérialise cette transaction unique : les repositories écrivent dans
la session partagée mais ne commitent JAMAIS eux-mêmes ; seul le use
case appelle commit(), une fois le scénario complet.
"""

import uuid
from dataclasses import dataclass
from types import TracebackType
from typing import Protocol, Self

from vetolib.shared.domain.events import DomainEvent


@dataclass(frozen=True)
class TenantContext:
    """Transaction exécutée pour le compte d'une clinique : active la RLS.

    Passer ce contexte au UoW signifie "toutes les requêtes de cette
    transaction agissent au nom de clinic_id". frozen=True : le tenant
    ne peut pas changer en cours de transaction.
    """

    clinic_id: uuid.UUID


class UnitOfWork(Protocol):
    """Frontière transactionnelle. Les repositories ne commitent jamais ;
    les événements ajoutés partent dans l'outbox avec le même commit.

    S'utilise comme gestionnaire de contexte asynchrone :

        async with make_uow() as uow:
            ...  # lectures/écritures via les repositories
            uow.add_event(...)  # faits métier à publier (outbox)
            await uow.commit()  # données + événements, atomiquement

    Sans commit() explicite, sortir du bloc n'enregistre rien ; une
    exception dans le bloc déclenche le rollback puis la fermeture de
    la session (voir l'implémentation SQLAlchemy).
    """

    async def __aenter__(self) -> Self: ...

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None: ...

    async def commit(self) -> None: ...  # valide données ET événements outbox d'un bloc

    async def rollback(self) -> None: ...  # annule tout : écritures et événements collectés

    def add_event(self, event: DomainEvent) -> None: ...  # collecte un événement pour l'outbox
