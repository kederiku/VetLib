"""Routeur FastAPI /admin/staff : le personnel, TOUTES cliniques confondues.

Quatre routes : la liste transverse, le changement de role, la desactivation
et l'activation. La creation, elle, vit sous /admin/clinics/{id}/staff :
un membre du personnel appartient toujours a une clinique, l'URL le dit.

C'est LE routeur qui traverse les tenants de la facon la plus visible : la
liste melange le personnel de toutes les cliniques dans un seul tableau.
D'ou, ici encore, la garde posee sur le routeur, et le test d'integration qui
enumere toutes les routes /api/v1/admin/* pour exiger un 401 sans cookie.

Le garde-fou du dernier gerant vit dans les use cases, pas ici : il doit
valoir pour tout appelant, present ou futur.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from vetolib.identity.application.use_cases.admin import (
    ChangeAdminStaffRole,
    ListAdminStaff,
    SetAdminStaffStatus,
)
from vetolib.identity.domain.repositories import StaffSearchCriteria, StaffSortField
from vetolib.identity.domain.value_objects import AccountStatus, Role
from vetolib.identity.presentation.admin_dependencies import (
    AdminActorDep,
    get_change_admin_staff_role,
    get_current_admin,
    get_list_admin_staff,
    get_set_admin_staff_status,
)
from vetolib.identity.presentation.admin_schemas import (
    AdminChangeRoleRequest,
    AdminStaffPage,
    AdminStaffSummary,
)
from vetolib.shared.domain.page import SortDirection
from vetolib.shared.presentation.pagination import LimitQuery, OffsetQuery, SearchQuery

router = APIRouter(
    prefix="/admin/staff",
    tags=["admin-staff"],
    dependencies=[Depends(get_current_admin)],
)


@router.get("", operation_id="listAdminStaff")
async def list_admin_staff(
    use_case: Annotated[ListAdminStaff, Depends(get_list_admin_staff)],
    limit: LimitQuery = 20,
    offset: OffsetQuery = 0,
    search: SearchQuery = None,
    status: Annotated[AccountStatus | None, Query()] = None,
    role: Annotated[Role | None, Query()] = None,
    clinic_id: Annotated[uuid.UUID | None, Query()] = None,
    sort_by: Annotated[StaffSortField, Query()] = StaffSortField.LAST_NAME,
    sort_dir: Annotated[SortDirection, Query()] = SortDirection.ASC,
) -> AdminStaffPage:
    """Page de la liste du personnel, toutes cliniques confondues.

    La recherche couvre aussi le NOM DE LA CLINIQUE : taper "Lilas" doit
    sortir tout son personnel. `clinic_id` reste disponible pour un filtre
    exact.
    """
    page = await use_case.execute(
        StaffSearchCriteria(
            search=search,
            status=status,
            role=role,
            clinic_id=clinic_id,
            sort_by=sort_by,
            sort_dir=sort_dir,
            limit=limit,
            offset=offset,
        )
    )
    return AdminStaffPage(
        items=[AdminStaffSummary.from_dto(ligne) for ligne in page.items],
        total=page.total,
        limit=page.limit,
        offset=page.offset,
    )


@router.put("/{user_id}/role", operation_id="changeAdminStaffRole")
async def change_admin_staff_role(
    user_id: uuid.UUID,
    body: AdminChangeRoleRequest,
    use_case: Annotated[ChangeAdminStaffRole, Depends(get_change_admin_staff_role)],
    actor: AdminActorDep,
) -> AdminStaffSummary:
    """Change le role d'un membre du personnel.

    409 `identity.last_manager` si l'operation retirerait le dernier gerant
    actif de la clinique.

    A dire dans l'interface : les permissions sont embarquees dans le jeton
    d'acces, le nouveau role ne prend donc effet chez l'interesse qu'a son
    prochain jeton -- dans quinze minutes au plus.
    """
    return AdminStaffSummary.from_dto(await use_case.execute(user_id, role=body.role, actor=actor))


@router.post("/{user_id}/deactivate", operation_id="deactivateAdminStaff")
async def deactivate_admin_staff(
    user_id: uuid.UUID,
    use_case: Annotated[SetAdminStaffStatus, Depends(get_set_admin_staff_status)],
    actor: AdminActorDep,
) -> AdminStaffSummary:
    """Coupe l'acces d'un membre du personnel (idempotent).

    409 `identity.last_manager` s'il s'agit du dernier gerant actif. Les
    rendez-vous passes et les actes restent attribues a son nom : c'est de
    l'historique medical, il ne se reecrit pas.
    """
    return AdminStaffSummary.from_dto(await use_case.execute(user_id, active=False, actor=actor))


@router.post("/{user_id}/activate", operation_id="activateAdminStaff")
async def activate_admin_staff(
    user_id: uuid.UUID,
    use_case: Annotated[SetAdminStaffStatus, Depends(get_set_admin_staff_status)],
    actor: AdminActorDep,
) -> AdminStaffSummary:
    """Retablit l'acces d'un membre du personnel (idempotent)."""
    return AdminStaffSummary.from_dto(await use_case.execute(user_id, active=True, actor=actor))
