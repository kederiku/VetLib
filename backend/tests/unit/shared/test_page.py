"""Tests du contrat de pagination partage.

Deux choses tres differentes sont verrouillees ici.

1. La forme de `Page` : `total` est le nombre de lignes du FILTRE, pas de la
   tranche. C'est la confusion la plus facile a introduire en refactorant, et
   sa consequence est visible a l'ecran : le "x sur N" afficherait le nombre
   de lignes visibles.

2. L'echappement des jokers SQL. Sans lui, taper "%" dans un champ de
   recherche ferait correspondre TOUTES les lignes -- ce n'est pas une faille
   d'injection (la valeur reste un parametre lie) mais un resultat faux, et
   une requete qui degenere en parcours complet de la table.
"""

from vetolib.identity.infrastructure.admin_repositories import _echapper_like
from vetolib.shared.domain.page import Page, SortDirection


def test_une_page_porte_le_total_du_filtre_pas_de_la_tranche() -> None:
    page = Page(items=["a", "b"], total=137, limit=2, offset=50)

    assert len(page.items) == 2
    assert page.total == 137
    # limit et offset sont l'echo de la demande : le front n'a pas a
    # conserver son propre etat pour reconstruire la pagination.
    assert (page.limit, page.offset) == (2, 50)


def test_une_page_vide_reste_une_page_valide() -> None:
    # Cas reel : l'utilisateur etait page 5, il filtre, il ne reste que deux
    # pages. La tranche est vide mais le total ne l'est PAS -- c'est ce qui
    # permet a l'ecran de proposer de revenir en arriere au lieu d'afficher
    # "aucun resultat".
    page: Page[str] = Page(items=[], total=42, limit=20, offset=200)

    assert page.items == []
    assert page.total == 42


def test_le_sens_de_tri_ne_connait_que_deux_valeurs() -> None:
    # StrEnum : la valeur EST la chaine attendue par l'API, et rien d'autre
    # ne peut y entrer -- aucune expression SQL ne peut donc remonter depuis
    # une saisie utilisateur. On compare .value : mypy sait que le membre
    # d'enum et la chaine litterale sont des types disjoints, et refuserait
    # l'egalite directe (qui serait pourtant vraie a l'execution).
    assert SortDirection.ASC.value == "asc"
    assert SortDirection.DESC.value == "desc"
    assert len(list(SortDirection)) == 2


def test_l_echappement_neutralise_les_jokers_sql() -> None:
    assert _echapper_like("100%") == "100\\%"
    assert _echapper_like("a_b") == "a\\_b"


def test_l_antislash_est_echappe_en_premier() -> None:
    """L'ordre est le piege : echapper % avant \\ echapperait les antislashs
    qu'on vient tout juste d'ajouter."""
    assert _echapper_like("\\") == "\\\\"
    # "\%" doit devenir "\\\%" : l'antislash d'origine double, puis le %
    # recoit le sien.
    assert _echapper_like("\\%") == "\\\\\\%"


def test_un_terme_ordinaire_traverse_intact() -> None:
    assert _echapper_like("Clinique des Lilas") == "Clinique des Lilas"
