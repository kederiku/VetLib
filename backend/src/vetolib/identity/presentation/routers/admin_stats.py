"""Routeur FastAPI /admin/stats : les compteurs du tableau de bord.

Une seule route, et une seule requete SQL derriere. Six SELECT separes
donneraient six instantanes differents : sur un ecran ou les nombres se
lisent ensemble, ils doivent etre coherents entre eux.
"""

from typing import Annotated

from fastapi import APIRouter, Depends

from vetolib.identity.application.use_cases.admin import GetPlatformStats
from vetolib.identity.presentation.admin_dependencies import (
    get_current_admin,
    get_platform_stats,
)
from vetolib.identity.presentation.admin_schemas import AdminStatsResponse

router = APIRouter(
    prefix="/admin/stats",
    tags=["admin-stats"],
    dependencies=[Depends(get_current_admin)],
)


@router.get("", operation_id="getAdminStats")
async def get_admin_stats(
    use_case: Annotated[GetPlatformStats, Depends(get_platform_stats)],
) -> AdminStatsResponse:
    """Cliniques, proprietaires et personnel : actifs et inactifs."""
    return AdminStatsResponse.from_dto(await use_case.execute())
