"""Routeur FastAPI /admin/owners : les comptes proprietaires vus du back-office.

Cinq routes : la liste paginee, la fiche, sa mise a jour, la desactivation et
la reactivation.

Comme pour les cliniques, la garde d'authentification est posee sur le
ROUTEUR : une route ajoutee ici est protegee par construction.

Ce que ce routeur n'expose PAS, deliberement : aucune route ne change l'email
ni le mot de passe d'un proprietaire, et aucune ne supprime quoi que ce soit.
Donner a un exploitant le moyen de reinitialiser le mot de passe d'un client
serait lui donner le moyen d'entrer dans son compte.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from vetolib.identity.application.dto import AdminUpdateOwnerCommand
from vetolib.identity.application.use_cases.admin import (
    GetAdminOwner,
    ListAdminOwners,
    SetAdminOwnerStatus,
    UpdateAdminOwner,
)
from vetolib.identity.domain.repositories import OwnerSearchCriteria, OwnerSortField
from vetolib.identity.domain.value_objects import AccountStatus
from vetolib.identity.presentation.admin_dependencies import (
    AdminActorDep,
    get_current_admin,
    get_get_admin_owner,
    get_list_admin_owners,
    get_set_admin_owner_status,
    get_update_admin_owner,
)
from vetolib.identity.presentation.admin_schemas import (
    AdminOwnerPage,
    AdminOwnerResponse,
    AdminOwnerSummary,
    AdminUpdateOwnerRequest,
)
from vetolib.shared.domain.page import SortDirection
from vetolib.shared.presentation.pagination import LimitQuery, OffsetQuery, SearchQuery

router = APIRouter(
    prefix="/admin/owners",
    tags=["admin-owners"],
    dependencies=[Depends(get_current_admin)],
)


@router.get("", operation_id="listAdminOwners")
async def list_admin_owners(
    use_case: Annotated[ListAdminOwners, Depends(get_list_admin_owners)],
    limit: LimitQuery = 20,
    offset: OffsetQuery = 0,
    search: SearchQuery = None,
    status: Annotated[AccountStatus | None, Query()] = None,
    sort_by: Annotated[OwnerSortField, Query()] = OwnerSortField.LAST_NAME,
    sort_dir: Annotated[SortDirection, Query()] = SortDirection.ASC,
) -> AdminOwnerPage:
    """Page de la liste des proprietaires.

    La recherche couvre aussi la concatenation "prenom nom" : taper
    "jean dupont" d'une traite doit fonctionner, c'est ce que tout le monde
    fait.
    """
    page = await use_case.execute(
        OwnerSearchCriteria(
            search=search,
            status=status,
            sort_by=sort_by,
            sort_dir=sort_dir,
            limit=limit,
            offset=offset,
        )
    )
    return AdminOwnerPage(
        items=[AdminOwnerSummary.from_dto(ligne) for ligne in page.items],
        total=page.total,
        limit=page.limit,
        offset=page.offset,
    )


@router.get("/{owner_id}", operation_id="getAdminOwner")
async def get_admin_owner(
    owner_id: uuid.UUID,
    use_case: Annotated[GetAdminOwner, Depends(get_get_admin_owner)],
) -> AdminOwnerResponse:
    """Fiche complete d'un proprietaire (sans aucune donnee medicale)."""
    return AdminOwnerResponse.from_dto(await use_case.execute(owner_id))


@router.put("/{owner_id}", operation_id="updateAdminOwner")
async def update_admin_owner(
    owner_id: uuid.UUID,
    body: AdminUpdateOwnerRequest,
    use_case: Annotated[UpdateAdminOwner, Depends(get_update_admin_owner)],
    actor: AdminActorDep,
) -> AdminOwnerResponse:
    """Met a jour la fiche. Ni email, ni mot de passe."""
    adresse = body.address
    fiche = await use_case.execute(
        AdminUpdateOwnerCommand(
            owner_id=owner_id,
            first_name=body.first_name,
            last_name=body.last_name,
            phone=body.phone,
            address_line1=adresse.line1 if adresse else None,
            address_line2=adresse.line2 if adresse else None,
            postal_code=adresse.postal_code if adresse else None,
            city=adresse.city if adresse else None,
            country=adresse.country if adresse else None,
            notify_email=body.notification_preferences.email,
            notify_sms=body.notification_preferences.sms,
        ),
        actor,
    )
    return AdminOwnerResponse.from_dto(fiche)


@router.post("/{owner_id}/deactivate", operation_id="deactivateAdminOwner")
async def deactivate_admin_owner(
    owner_id: uuid.UUID,
    use_case: Annotated[SetAdminOwnerStatus, Depends(get_set_admin_owner_status)],
    actor: AdminActorDep,
) -> AdminOwnerResponse:
    """Coupe l'acces au portail proprietaires (idempotent).

    N'efface NI les animaux NI les rendez-vous : les cliniques continuent de
    les voir. Un historique medical ne disparait pas parce qu'un compte est
    ferme.
    """
    return AdminOwnerResponse.from_dto(await use_case.execute(owner_id, active=False, actor=actor))


@router.post("/{owner_id}/reactivate", operation_id="reactivateAdminOwner")
async def reactivate_admin_owner(
    owner_id: uuid.UUID,
    use_case: Annotated[SetAdminOwnerStatus, Depends(get_set_admin_owner_status)],
    actor: AdminActorDep,
) -> AdminOwnerResponse:
    """Retablit l'acces d'un compte desactive (idempotent)."""
    return AdminOwnerResponse.from_dto(await use_case.execute(owner_id, active=True, actor=actor))
