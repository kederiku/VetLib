"""Routeur FastAPI /admin/clinics : les cliniques vues du back-office.

Sept routes : la liste paginee, la creation (clinique et, optionnellement,
son premier gerant), la fiche, sa mise a jour, la suspension, la
reactivation, et le personnel d'une clinique donnee.

LA GARDE D'AUTHENTIFICATION EST POSEE SUR LE ROUTEUR, pas route par route.
C'est le choix central de cet espace : une route ajoutee demain est protegee
par construction, et l'oubli exige une action deliberee (creer un second
routeur), qui se voit en revue. Le contexte scheduling a fait l'inverse --
une garde par route -- parce qu'il distingue lecture et gestion ; ici l'acces
est tout-ou-rien, il n'y a rien a distinguer.

Les routes qui MUTENT declarent en plus `actor: AdminActorDep` : elles ont
besoin de savoir QUI agit pour la ligne d'audit. FastAPI met la dependance en
cache par requete, elle n'est donc resolue qu'une fois.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi import status as http_status

from vetolib.identity.application.dto import (
    AdminCreateClinicCommand,
    AdminCreateClinicManager,
    AdminCreateStaffCommand,
    AdminUpdateClinicCommand,
)
from vetolib.identity.application.use_cases.admin import (
    CreateAdminClinic,
    CreateAdminStaff,
    GetAdminClinic,
    ListAdminStaff,
    SetAdminClinicStatus,
    UpdateAdminClinic,
)
from vetolib.identity.application.use_cases.admin import (
    ListAdminClinics as ListAdminClinicsUseCase,
)
from vetolib.identity.domain.repositories import (
    ClinicSearchCriteria,
    ClinicSortField,
    StaffSearchCriteria,
    StaffSortField,
)
from vetolib.identity.domain.value_objects import AccountStatus, Role
from vetolib.identity.presentation.admin_dependencies import (
    AdminActorDep,
    get_create_admin_clinic,
    get_create_admin_staff,
    get_current_admin,
    get_get_admin_clinic,
    get_list_admin_clinics,
    get_list_admin_staff,
    get_set_admin_clinic_status,
    get_update_admin_clinic,
)
from vetolib.identity.presentation.admin_schemas import (
    AdminClinicCreatedResponse,
    AdminClinicPage,
    AdminClinicResponse,
    AdminClinicSummary,
    AdminCreateClinicRequest,
    AdminCreateStaffRequest,
    AdminStaffCreatedResponse,
    AdminStaffPage,
    AdminStaffSummary,
    AdminUpdateClinicRequest,
)
from vetolib.shared.domain.page import SortDirection
from vetolib.shared.presentation.pagination import LimitQuery, OffsetQuery, SearchQuery

router = APIRouter(
    prefix="/admin/clinics",
    tags=["admin-clinics"],
    dependencies=[Depends(get_current_admin)],
)


@router.get("", operation_id="listAdminClinics")
async def list_admin_clinics(
    use_case: Annotated[ListAdminClinicsUseCase, Depends(get_list_admin_clinics)],
    limit: LimitQuery = 20,
    offset: OffsetQuery = 0,
    search: SearchQuery = None,
    # ATTENTION : ce parametre s'appelle "status" (bon nom d'API) et
    # masquerait le module fastapi.status -- d'ou l'import `as http_status`
    # en tete de fichier.
    status: Annotated[AccountStatus | None, Query()] = None,
    sort_by: Annotated[ClinicSortField, Query()] = ClinicSortField.NAME,
    sort_dir: Annotated[SortDirection, Query()] = SortDirection.ASC,
) -> AdminClinicPage:
    """Page de la liste des cliniques (recherche, tri et filtre cote serveur).

    Les enums sort_by et status apparaissent dans l'OpenAPI, donc dans les
    types generes : le front ne peut pas inventer une colonne de tri, et une
    valeur hors enum est refusee en 422 avant d'atteindre le use case.
    """
    page = await use_case.execute(
        ClinicSearchCriteria(
            search=search,
            status=status,
            sort_by=sort_by,
            sort_dir=sort_dir,
            limit=limit,
            offset=offset,
        )
    )
    return AdminClinicPage(
        items=[AdminClinicSummary.from_dto(ligne) for ligne in page.items],
        total=page.total,
        limit=page.limit,
        offset=page.offset,
    )


@router.post("", operation_id="createAdminClinic", status_code=http_status.HTTP_201_CREATED)
async def create_admin_clinic(
    body: AdminCreateClinicRequest,
    use_case: Annotated[CreateAdminClinic, Depends(get_create_admin_clinic)],
    actor: AdminActorDep,
) -> AdminClinicCreatedResponse:
    """Cree une clinique, et son premier gerant si le bloc est fourni.

    Le mot de passe du gerant est GENERE par le backend et renvoye ici une
    seule fois : voir AdminStaffCreatedResponse.
    """
    adresse = body.address
    clinique, gerant = await use_case.execute(
        AdminCreateClinicCommand(
            name=body.name,
            email=body.email,
            phone=body.phone,
            address_line1=adresse.line1 if adresse else None,
            address_line2=adresse.line2 if adresse else None,
            postal_code=adresse.postal_code if adresse else None,
            city=adresse.city if adresse else None,
            country=adresse.country if adresse else None,
            timezone=body.timezone,
            manager=(
                AdminCreateClinicManager(
                    email=body.manager.email,
                    first_name=body.manager.first_name,
                    last_name=body.manager.last_name,
                    # Le premier compte d'une clinique est TOUJOURS un
                    # gerant : c'est lui qui pourra ensuite en nommer
                    # d'autres. Le champ n'est donc pas offert au choix.
                    role=Role.MANAGER,
                )
                if body.manager is not None
                else None
            ),
        ),
        actor,
    )
    return AdminClinicCreatedResponse(
        clinic=AdminClinicResponse.from_dto(clinique),
        manager=None if gerant is None else AdminStaffCreatedResponse.from_dto(gerant),
    )


@router.get("/{clinic_id}", operation_id="getAdminClinic")
async def get_admin_clinic(
    clinic_id: uuid.UUID,
    use_case: Annotated[GetAdminClinic, Depends(get_get_admin_clinic)],
) -> AdminClinicResponse:
    """Fiche complete d'une clinique, effectif actif compris."""
    return AdminClinicResponse.from_dto(await use_case.execute(clinic_id))


@router.put("/{clinic_id}", operation_id="updateAdminClinic")
async def update_admin_clinic(
    clinic_id: uuid.UUID,
    body: AdminUpdateClinicRequest,
    use_case: Annotated[UpdateAdminClinic, Depends(get_update_admin_clinic)],
    actor: AdminActorDep,
) -> AdminClinicResponse:
    """Met a jour la fiche. L'email n'est pas modifiable, par conception."""
    adresse = body.address
    fiche = await use_case.execute(
        AdminUpdateClinicCommand(
            clinic_id=clinic_id,
            name=body.name,
            phone=body.phone,
            address_line1=adresse.line1 if adresse else None,
            address_line2=adresse.line2 if adresse else None,
            postal_code=adresse.postal_code if adresse else None,
            city=adresse.city if adresse else None,
            country=adresse.country if adresse else None,
            timezone=body.timezone,
        ),
        actor,
    )
    return AdminClinicResponse.from_dto(fiche)


@router.post("/{clinic_id}/suspend", operation_id="suspendAdminClinic")
async def suspend_admin_clinic(
    clinic_id: uuid.UUID,
    use_case: Annotated[SetAdminClinicStatus, Depends(get_set_admin_clinic_status)],
    actor: AdminActorDep,
) -> AdminClinicResponse:
    """Suspend l'acces de la clinique et de TOUT son personnel.

    Un verbe d'action plutot qu'un PATCH {"status": "..."} : c'est deja la
    convention du projet (/appointments/{id}/confirm, /cancel), cela donne un
    operation_id distinct -- donc un hook Orval que le front cable sur un
    bouton -- une action d'audit non ambigue, et l'impossibilite qu'un PUT de
    fiche reactive une clinique par inadvertance.

    IDEMPOTENT : suspendre une clinique deja suspendue renvoie 200 avec
    l'etat courant, pas 409. Un double-clic ne doit pas produire une erreur.
    """
    return AdminClinicResponse.from_dto(
        await use_case.execute(clinic_id, active=False, actor=actor)
    )


@router.post("/{clinic_id}/reactivate", operation_id="reactivateAdminClinic")
async def reactivate_admin_clinic(
    clinic_id: uuid.UUID,
    use_case: Annotated[SetAdminClinicStatus, Depends(get_set_admin_clinic_status)],
    actor: AdminActorDep,
) -> AdminClinicResponse:
    """Retablit l'acces d'une clinique suspendue (idempotent)."""
    return AdminClinicResponse.from_dto(await use_case.execute(clinic_id, active=True, actor=actor))


@router.get("/{clinic_id}/staff", operation_id="listAdminClinicStaff")
async def list_admin_clinic_staff(
    clinic_id: uuid.UUID,
    use_case: Annotated[ListAdminStaff, Depends(get_list_admin_staff)],
    limit: LimitQuery = 20,
    offset: OffsetQuery = 0,
    search: SearchQuery = None,
    status: Annotated[AccountStatus | None, Query()] = None,
    sort_by: Annotated[StaffSortField, Query()] = StaffSortField.LAST_NAME,
    sort_dir: Annotated[SortDirection, Query()] = SortDirection.ASC,
) -> AdminStaffPage:
    """Le personnel d'UNE clinique : meme use case que la liste transverse,
    avec le filtre clinic_id pose par le chemin."""
    page = await use_case.execute(
        StaffSearchCriteria(
            search=search,
            status=status,
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


@router.post(
    "/{clinic_id}/staff",
    operation_id="createAdminClinicStaff",
    status_code=http_status.HTTP_201_CREATED,
)
async def create_admin_clinic_staff(
    clinic_id: uuid.UUID,
    body: AdminCreateStaffRequest,
    use_case: Annotated[CreateAdminStaff, Depends(get_create_admin_staff)],
    actor: AdminActorDep,
) -> AdminStaffCreatedResponse:
    """Ajoute un membre du personnel a une clinique existante.

    Sous-collection plutot que clinic_id dans le corps : le 404 sur clinique
    inconnue devient naturel, et l'URL dit ce qu'elle fait.
    """
    cree = await use_case.execute(
        AdminCreateStaffCommand(
            clinic_id=clinic_id,
            email=body.email,
            first_name=body.first_name,
            last_name=body.last_name,
            role=body.role,
        ),
        actor,
    )
    return AdminStaffCreatedResponse.from_dto(cree)
