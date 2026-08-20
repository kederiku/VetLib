"""Use case : annuaire public des cliniques (GET /public/clinics).

Seul use case d'identity accessible SANS authentification : il alimente la
recherche de clinique du portail B2C (un proprietaire choisit ou prendre
rendez-vous). D'ou la projection PublicClinic volontairement minimale
(nom + ville) : rien de sensible ne sort par cette porte.

UoW systeme : la table clinics (les tenants eux-memes) est hors RLS, et
l'annuaire est par nature TRANSVERSE aux tenants -- il liste toutes les
cliniques vivantes, ce qu'aucune transaction tenant ne pourrait faire.
"""

from vetolib.identity.application.dto import PublicClinic
from vetolib.identity.application.ports import IdentityUoWFactory


class ListPublicClinics:
    """Liste paginee des cliniques actives, triees par nom."""

    def __init__(self, uow_factory: IdentityUoWFactory) -> None:
        self._uow_factory = uow_factory

    async def execute(self, *, limit: int, offset: int) -> list[PublicClinic]:
        # Les bornes de limit/offset (1..100, >= 0) sont imposees par la
        # couche presentation (Query de FastAPI) : ici on fait confiance au
        # contrat, le repository ne recoit jamais de valeurs aberrantes.
        async with self._uow_factory() as uow:
            clinics = await uow.clinics.list_active(limit=limit, offset=offset)
            return [
                PublicClinic(
                    id=clinic.id,
                    name=clinic.name,
                    # Ville seule (pas l'adresse complete) : None tant que la
                    # clinique n'a pas renseigne son adresse.
                    city=clinic.address.city if clinic.address is not None else None,
                )
                for clinic in clinics
            ]
