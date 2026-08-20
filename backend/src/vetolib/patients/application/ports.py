"""Ports de la couche application du contexte patients.

Un seul port pour cette tranche : le UnitOfWork du contexte (les ports
transverses Clock, PasswordHasher... vivent dans shared ou identity). Comme
dans identity, typing.Protocol = typage structurel : l'adapter SQLAlchemy et
le fake de test satisfont le port sans en hériter.

Pourquoi la UoW SYSTEME (et non tenant_uow) pour tout le contexte pets :
la table pets est GLOBALE, rattachée à un owner (compte B2C hors tenant) et
non à une clinique -- il n'existe aucun clinic_id à donner à la RLS. La
protection d'accès est applicative : owner_id du token + filtre owner_id
imposé par la signature du port PetRepository. Les futures tables tenantées
du contexte (medical_records) passeront, elles, par tenant_uow(clinic_id).
"""

from collections.abc import Callable
from typing import Protocol

from vetolib.patients.domain.repositories import PetRepository
from vetolib.shared.application.uow import UnitOfWork


class PatientsUnitOfWork(UnitOfWork, Protocol):
    """UoW du contexte patients : une transaction + ses repositories.

    Étend le UnitOfWork partagé (commit/rollback + add_event vers l'outbox)
    en exposant les repositories du contexte -- pets seul pour l'instant.
    """

    # Property (lecture seule) : covariante -- un attribut concret plus
    # spécifique (SqlAlchemyPetRepository, FakePetRepository) satisfait le port.
    @property
    def pets(self) -> PetRepository: ...


# Les use cases reçoivent une FABRIQUE et non un UoW déjà ouvert : chaque
# execute() ouvre sa propre transaction via `async with`, courte et bien
# délimitée (même convention que dans identity).
PatientsUoWFactory = Callable[[], PatientsUnitOfWork]
