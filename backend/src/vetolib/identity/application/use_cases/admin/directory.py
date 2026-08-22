"""Use cases de LECTURE du back-office : les trois listes et les compteurs.

Regroupes dans un seul module, contrairement a la convention "un fichier par
use case" du reste du projet. La raison : ces quatre classes ne font
strictement rien d'autre que deleguer au repository transverse et projeter le
resultat. Les eclater en quatre fichiers de vingt lignes donnerait quatre
docstrings qui repeteraient la meme chose ; regroupes, on lit d'un coup ce
que le back-office sait lire.

Les use cases d'ECRITURE, eux, restent un par fichier : ils portent des
regles (garde-fou du dernier gerant, generation du mot de passe, ligne
d'audit) qui meritent chacune leur explication.

Tous ouvrent un UoW SYSTEME : ces lectures traversent les tenants par nature.
Voir la note de module d'infrastructure/admin_repositories.py.
"""

from vetolib.identity.application.dto import (
    AdminClinicRow,
    AdminOwnerRow,
    AdminStaffRow,
)
from vetolib.identity.application.mappers import (
    to_admin_clinic_row,
    to_admin_owner_row,
    to_admin_staff_row,
)
from vetolib.identity.application.ports import IdentityUoWFactory
from vetolib.identity.domain.repositories import (
    ClinicSearchCriteria,
    OwnerSearchCriteria,
    PlatformStats,
    StaffSearchCriteria,
)
from vetolib.shared.domain.page import Page


class ListAdminClinics:
    """Page de la liste des cliniques (recherche, tri et filtre cote serveur)."""

    def __init__(self, uow_factory: IdentityUoWFactory) -> None:
        self._uow_factory = uow_factory

    async def execute(self, criteria: ClinicSearchCriteria) -> Page[AdminClinicRow]:
        async with self._uow_factory() as uow:
            page = await uow.directory.search_clinics(criteria)
            # Le total est celui du repository, PAS len(items) : c'est le
            # nombre de lignes correspondant au filtre, pagination exclue.
            return Page(
                items=[to_admin_clinic_row(ligne) for ligne in page.items],
                total=page.total,
                limit=page.limit,
                offset=page.offset,
            )


class ListAdminOwners:
    """Page de la liste des proprietaires."""

    def __init__(self, uow_factory: IdentityUoWFactory) -> None:
        self._uow_factory = uow_factory

    async def execute(self, criteria: OwnerSearchCriteria) -> Page[AdminOwnerRow]:
        async with self._uow_factory() as uow:
            page = await uow.directory.search_owners(criteria)
            return Page(
                items=[to_admin_owner_row(ligne) for ligne in page.items],
                total=page.total,
                limit=page.limit,
                offset=page.offset,
            )


class ListAdminStaff:
    """Page de la liste du personnel, TOUTES cliniques confondues."""

    def __init__(self, uow_factory: IdentityUoWFactory) -> None:
        self._uow_factory = uow_factory

    async def execute(self, criteria: StaffSearchCriteria) -> Page[AdminStaffRow]:
        async with self._uow_factory() as uow:
            page = await uow.directory.search_staff(criteria)
            return Page(
                items=[to_admin_staff_row(ligne) for ligne in page.items],
                total=page.total,
                limit=page.limit,
                offset=page.offset,
            )


class GetPlatformStats:
    """Les six compteurs du tableau de bord, en une seule requete."""

    def __init__(self, uow_factory: IdentityUoWFactory) -> None:
        self._uow_factory = uow_factory

    async def execute(self) -> PlatformStats:
        async with self._uow_factory() as uow:
            return await uow.directory.platform_stats()
