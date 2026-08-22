"""Page de resultats : le contrat commun a toutes les listes paginees.

Couche domain PARTAGEE, et c'est delibere : les ports repository vivent dans
`domain/`, et ils renvoient des `Page[T]`. Placer cette classe dans
`application/` creerait un import domain -> application, exactement
l'inversion que l'architecture hexagonale interdit. C'est une dataclass
pure, sans un seul import de framework : sa place est bien ici.
"""

from dataclasses import dataclass
from enum import StrEnum


class SortDirection(StrEnum):
    """Sens de tri, exprime sans une ligne de SQL.

    Le domaine et l'API ne connaissent que "asc" et "desc" ; la traduction en
    `ORDER BY ... ASC/DESC` vit dans le repository SQLAlchemy. Un StrEnum
    plutot qu'une chaine libre rend structurellement impossible de faire
    remonter une expression SQL depuis une saisie utilisateur.
    """

    ASC = "asc"
    DESC = "desc"


# PEP 695 : la syntaxe `class Page[T]` remplace TypeVar depuis Python 3.12.
@dataclass(frozen=True, kw_only=True)
class Page[T]:
    """Une tranche de resultats, et le total AVANT tranchage.

    Pourquoi limit/offset et non page/page_size/total_pages :

    - l'API expose deja `GET /public/clinics?limit=&offset=`. Deux conventions
      de pagination dans le meme contrat OpenAPI seraient une verrue, dans la
      documentation comme dans les trois clients Orval ;
    - limit/offset se traduit tel quel en SQL, la ou page/page_size impose une
      conversion (`offset = (page - 1) * page_size`) qui est le terrain de jeu
      classique des erreurs de decalage de un ;
    - total_pages est DERIVE de total et limit. On ne transporte jamais une
      donnee derivee : elle finit par contredire celle dont elle derive. Le
      front la recalcule, c'est une division.

    Cote frontend, TanStack Table raisonne en {pageIndex, pageSize} : la
    conversion tient en une ligne, dans un seul hook adaptateur. C'est au
    front de s'adapter, pas au contrat d'API de se dedoubler.
    """

    items: list[T]
    """La tranche demandee, deja triee par le repository."""

    total: int
    """Nombre total de lignes correspondant au filtre, pagination exclue.

    C'est lui qui alimente le "x-y sur N" et le nombre de pages. Il est
    calcule par une requete COUNT distincte, sur la MEME clause WHERE que la
    tranche -- deux clauses divergentes donneraient un total qui ne
    correspond pas aux lignes affichees.
    """

    limit: int
    """Echo de la demande : le front n'a pas a conserver son propre etat."""

    offset: int
    """Echo de la demande, pour la meme raison."""
