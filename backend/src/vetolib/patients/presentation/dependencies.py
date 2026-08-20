"""Dépendances FastAPI du contexte patients : le composition root du contexte.

Assemble les use cases avec leurs adapters concrets (UoW SQLAlchemy,
horloge système), comme identity/presentation/dependencies.py. La plomberie
transverse (Settings, sessionmaker) vient de shared ; l'authentification
propriétaire (CurrentOwnerDep) vient d'identity : patients ne REDEFINIT pas
la session B2C, il la consomme -- c'est identity qui possède les comptes et
les cookies.
"""

from typing import Annotated

from fastapi import Depends

# Ré-export explicite (X as X, pour mypy strict) : les routes du contexte
# importent leur protection depuis LEUR module de dépendances, sans savoir
# que la résolution de session vit dans identity.
from vetolib.identity.presentation.dependencies import (
    CurrentOwnerDep as CurrentOwnerDep,
)
from vetolib.patients.application.ports import PatientsUnitOfWork, PatientsUoWFactory
from vetolib.patients.application.use_cases import CreatePet, DeletePet, ListMyPets, UpdatePet
from vetolib.patients.infrastructure.uow import SqlAlchemyPatientsUnitOfWork
from vetolib.shared.infrastructure.clock import SystemClock
from vetolib.shared.presentation.dependencies import SessionmakerDep, SettingsDep

# Horloge du contexte : singleton sans état, substituable en test.
_clock = SystemClock()


def get_clock() -> SystemClock:
    """Horloge injectable : les tests peuvent substituer un temps figé."""
    return _clock


def get_patients_uow_factory(
    sessionmaker: SessionmakerDep, settings: SettingsDep
) -> PatientsUoWFactory:
    """Fabrique de UoW patients, toujours en mode SYSTEME (pas de tenant).

    La table pets est globale (rattachée à un owner, hors tenant) : il n'y a
    pas de clinic_id à donner à la RLS, la barrière d'accès est le filtre
    owner_id imposé par le port PetRepository (voir application/ports.py).
    On injecte une fabrique (pas un UoW ouvert) : chaque execute() ouvre sa
    propre transaction via `async with`, même convention qu'identity.
    """

    def factory() -> PatientsUnitOfWork:
        return SqlAlchemyPatientsUnitOfWork(sessionmaker, app_db_role=settings.app_db_role)

    return factory


PatientsUoWFactoryDep = Annotated[PatientsUoWFactory, Depends(get_patients_uow_factory)]

# Les fabriques ci-dessous assemblent chaque use case avec ses adapters :
# la route déclare Depends(get_xxx) et reçoit un objet prêt à l'emploi.


def get_list_my_pets(uow_factory: PatientsUoWFactoryDep) -> ListMyPets:
    return ListMyPets(uow_factory)


def get_create_pet(
    uow_factory: PatientsUoWFactoryDep, clock: Annotated[SystemClock, Depends(get_clock)]
) -> CreatePet:
    return CreatePet(uow_factory, clock)


def get_update_pet(uow_factory: PatientsUoWFactoryDep) -> UpdatePet:
    return UpdatePet(uow_factory)


def get_delete_pet(
    uow_factory: PatientsUoWFactoryDep, clock: Annotated[SystemClock, Depends(get_clock)]
) -> DeletePet:
    return DeletePet(uow_factory, clock)
