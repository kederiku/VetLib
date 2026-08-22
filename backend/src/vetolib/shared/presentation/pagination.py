"""Enveloppe HTTP des listes paginees, et les bornes de leurs parametres.

Couche presentation partagee : c'est ici que le `Page[T]` du domaine devient
un schema Pydantic, donc une entree du contrat OpenAPI, donc un type
TypeScript genere par Orval.

Le point important est le NOMMAGE. FastAPI derive le nom d'un schema
generique parametre en concatenant : `PageResponse[AdminClinicSummary]`
produit `PageResponse_AdminClinicSummary_` dans l'OpenAPI, et donc un type
`PageResponseAdminClinicSummary` cote front, plus un nom illisible dans la
page de reference de l'API. On ne l'utilise donc JAMAIS tel quel : chaque
ressource en derive une sous-classe NOMMEE (`AdminClinicPage`), et FastAPI
nomme alors le schema d'apres elle. Trois lignes par ressource, aucune
duplication des quatre champs.
"""

from typing import Annotated

from fastapi import Query
from pydantic import BaseModel, Field


class PageResponse[TItem](BaseModel):
    """Forme commune de toute reponse paginee de l'API.

    Generique, mais jamais utilisee directement comme type de retour : voir
    la docstring de module pour la raison.
    """

    items: list[TItem]
    total: int = Field(
        description="Nombre total de lignes correspondant au filtre, pagination exclue."
    )
    limit: int = Field(description="Taille de page demandee, renvoyee telle quelle.")
    offset: int = Field(description="Index de la premiere ligne, renvoye tel quel.")


# --- Alias de parametres de requete, partages par tous les listings ---------
# Les bornes sont declarees ICI, une seule fois : hors bornes, FastAPI repond
# 422 avant meme d'appeler le use case, qui ne recoit donc jamais de
# pagination aberrante. Meme contrat que l'annuaire public.

LimitQuery = Annotated[
    int,
    Query(
        ge=1,
        # Plafond a 100, et ce n'est pas cosmetique : les listes du back-office
        # portent des donnees personnelles de tous les tenants. Sans plafond,
        # un seul appel exfiltrerait la base entiere.
        le=100,
        description="Taille de page, entre 1 et 100.",
    ),
]

OffsetQuery = Annotated[int, Query(ge=0, description="Index de la premiere ligne.")]

SearchQuery = Annotated[
    str | None,
    Query(
        # max_length borne aussi le motif LIKE construit derriere : une saisie
        # de dix mille caracteres produirait un predicat absurde et couteux.
        max_length=100,
        description="Recherche libre, insensible a la casse et aux accents.",
    ),
]
