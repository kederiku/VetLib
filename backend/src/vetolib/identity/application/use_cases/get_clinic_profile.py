"""Use case : fiche de la clinique courante (GET /clinics/me).

Le clinic_id vient TOUJOURS du token de la session staff (claim cid du
"fat token"), jamais d'un parametre client : un manager ne consulte que SA
clinique.

Pourquoi la UoW SYSTEME et non tenant_uow(clinic_id) : la table clinics est
celle des tenants EUX-MEMES, elle ne porte pas de clinic_id ni de policy RLS
(l'isolation s'applique aux tables qui APPARTIENNENT a un tenant). L'acces
se fait par PK avec l'id issu du token : le perimetre est deja garanti par
l'authentification, la RLS n'aurait rien a filtrer ici.
"""

import uuid

from vetolib.identity.application.dto import ClinicProfile
from vetolib.identity.application.mappers import to_clinic_profile
from vetolib.identity.application.ports import IdentityUoWFactory
from vetolib.identity.domain.errors import ClinicNotFoundError


class GetClinicProfile:
    """Charge la clinique du token et la projette en ClinicProfile."""

    def __init__(self, uow_factory: IdentityUoWFactory) -> None:
        self._uow_factory = uow_factory

    async def execute(self, clinic_id: uuid.UUID) -> ClinicProfile:
        async with self._uow_factory() as uow:
            clinic = await uow.clinics.get_by_id(clinic_id)
            if clinic is None:
                # Le token reference une clinique disparue (soft delete entre
                # deux requetes) : 404 via le mapping EntityNotFoundError.
                raise ClinicNotFoundError("Clinique introuvable.")
            return to_clinic_profile(clinic)
