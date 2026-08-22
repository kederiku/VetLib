"""Verrou d'authentification de l'espace plateforme.

AUCUNE route ``/api/v1/admin/*`` ne doit repondre autre chose qu'un 401 quand
la requete n'apporte pas de cookie d'administrateur valide -- pas meme un 422
de validation, pas meme un 404.

Pourquoi ce test existe, et pourquoi il ENUMERE au lieu de lister :
l'espace plateforme est le seul du projet dont l'isolation ne repose PAS sur
la Row-Level Security. Ses lectures traversent les tenants, sa barriere est
donc du code -- donc oubliable. Une liste ecrite a la main se perimerait des
la prochaine route ajoutee ; ici, les routes sont decouvertes DANS
l'application elle-meme, ce qui rend l'oubli impossible.

Pourquoi 401 STRICTEMENT et pas "401 ou 422" : la dependance
d'authentification etant posee sur le ROUTEUR, FastAPI la resout avant de
valider le corps de la requete. Un 422 signifierait que la protection a ete
posee sur la route au lieu du routeur -- ce qui marche pour CETTE route,
mais ne protege plus la SUIVANTE.

Pourquoi ce test vit dans tests/integration : l'arbre de dependances de
get_current_admin descend jusqu'a get_sessionmaker, qui lit app.state --
rempli seulement par le lifespan. La fixture "client" fournit exactement cela.
"""

import re

import httpx
import pytest

from tests.integration.conftest import CreateAdmin
from vetolib.main import create_app

_PREFIXE_ADMIN = "/api/v1/admin"

# Les SEULES routes admin joignables sans cookie : celles qui servent a en
# obtenir un. Toute nouvelle entree ici est un evenement de revue -- c'est le
# point d'entree naturel d'une regression de securite, pas une liste de confort.
ROUTES_DE_SESSION = frozenset(
    {
        ("POST", "/api/v1/admin/auth/login"),
        ("POST", "/api/v1/admin/auth/refresh"),
        ("POST", "/api/v1/admin/auth/logout"),
    }
)

_UUID_FACTICE = "00000000-0000-0000-0000-000000000000"

ADMIN_EMAIL = "fondateur@vetolib.fr"
ADMIN_PASSWORD = "phrase-de-passe-fondateur"
STAFF_PASSWORD = "correct-horse-battery"


def _routes_admin() -> list[tuple[str, str]]:
    """Enumere (methode, chemin) de TOUTES les routes admin de l'application.

    La source est le SCHEMA OPENAPI, et non app.routes : depuis FastAPI 0.141,
    include_router ne remet plus les routes a plat dans app.routes (elles sont
    encapsulees dans un objet interne _IncludedRouter). Le schema, lui, est une
    API publique et stable -- c'est d'ailleurs exactement le contrat que voient
    les frontends via Orval.

    Consequence a connaitre : une route declaree include_in_schema=False
    echapperait a cette enumeration. C'est pour cela que la regle est ecrite
    dans docs/backend/ajouter-un-endpoint.md -- on ne masque JAMAIS une route
    admin du schema. De toute facon, masquer une route n'est pas un controle
    d'acces, et le schema complet est deja publie.

    Appelee au moment de la COLLECTE pytest (parametrize), donc avant toute
    fixture : create_app() et openapi() n'ouvrent aucune connexion.
    """
    schema = create_app().openapi()
    couples: list[tuple[str, str]] = []
    for chemin, operations in schema.get("paths", {}).items():
        if not chemin.startswith(_PREFIXE_ADMIN):
            continue
        couples.extend(
            (methode.upper(), chemin)
            for methode in operations
            # HEAD et OPTIONS n'apparaissent pas dans le schema, mais on
            # filtre par prudence : elles ne portent aucune logique metier.
            if methode.lower() not in {"head", "options", "parameters"}
        )
    return sorted(couples)


def _url(chemin: str) -> str:
    """Remplace les parametres de chemin par un UUID syntaxiquement valide.

    La route doit refuser AVANT d'aller voir si la ressource existe :
    repondre 404 a un anonyme revelerait deja quels identifiants existent.
    """
    return re.sub(r"\{[^}]+\}", _UUID_FACTICE, chemin)


def test_l_enumeration_des_routes_admin_n_est_pas_vide() -> None:
    """Le garde-fou du garde-fou.

    Si le prefixe changeait, ou si le routeur n'etait plus branche dans
    main.py, _routes_admin() rendrait une liste vide et les tests parametres
    ci-dessous passeraient au vert sans rien verifier du tout. C'est le mode
    de panne le plus insidieux d'un test genere : on le rend impossible ici.
    """
    routes = _routes_admin()

    assert routes, "Aucune route /api/v1/admin/* trouvee : l'enumeration est cassee."
    # Les routes de session doivent exister : sinon la liste d'exclusion
    # ci-dessus masquerait des routes qui, elles, ne sont plus la.
    assert ROUTES_DE_SESSION.issubset(set(routes))


@pytest.mark.parametrize(("methode", "chemin"), _routes_admin())
async def test_toute_route_admin_exige_le_cookie_administrateur(
    client: httpx.AsyncClient, methode: str, chemin: str
) -> None:
    """Sans cookie vetolib_admin_access, chaque route admin repond 401."""
    if (methode, chemin) in ROUTES_DE_SESSION:
        pytest.skip("Route d'obtention de session : publique par construction.")

    reponse = await client.request(methode, _url(chemin), json={})

    assert reponse.status_code == 401, (
        f"{methode} {chemin} a repondu {reponse.status_code} sans authentification "
        f"(401 attendu). Cette route ne passe probablement pas par un routeur admin "
        f"protege par Depends(get_current_admin)."
    )


@pytest.mark.parametrize(("methode", "chemin"), _routes_admin())
async def test_un_jeton_de_personnel_ne_vaut_rien_sur_l_espace_plateforme(
    client: httpx.AsyncClient, methode: str, chemin: str
) -> None:
    """Le cloisonnement, verifie route par route et non une seule fois.

    On recopie un VRAI cookie d'access staff sous le nom du cookie admin :
    c'est exactement le geste qu'un attaquant tenterait. Le claim
    kind="staff" doit le faire rejeter partout.
    """
    inscription = await client.post(
        "/api/v1/clinics/register",
        json={
            "clinic_name": "Clinique des Lilas",
            "email": "manager@lilas.fr",
            "password": STAFF_PASSWORD,
            "first_name": "Vera",
            "last_name": "Toli",
        },
    )
    assert inscription.status_code == 201, inscription.text
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "manager@lilas.fr", "password": STAFF_PASSWORD},
    )
    assert login.status_code == 200, login.text
    jeton_staff = login.cookies["vetolib_access"]

    # Cookie pose sur le CLIENT et non par requete : httpx deprecie la
    # forme par requete, et chaque test recoit de toute facon un client neuf.
    client.cookies.set("vetolib_admin_access", jeton_staff)
    reponse = await client.request(methode, _url(chemin), json={})

    # Les routes de session valident un corps : un cookie recopie n'y change
    # rien, elles sont legitimement publiques (401 pour login/refresh sans
    # corps valide, 422 si le corps est refuse, 204 pour logout).
    attendus = {401, 422, 204} if (methode, chemin) in ROUTES_DE_SESSION else {401}
    assert reponse.status_code in attendus, (
        f"{methode} {chemin} a accepte un jeton de personnel ({reponse.status_code})."
    )


async def test_un_jeton_plateforme_ne_vaut_rien_sur_les_deux_autres_espaces(
    client: httpx.AsyncClient, create_platform_admin: CreateAdmin
) -> None:
    """La reciproque : le jeton le plus puissant du systeme n'ouvre rien d'autre."""
    await create_platform_admin(ADMIN_EMAIL, ADMIN_PASSWORD)
    login = await client.post(
        "/api/v1/admin/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert login.status_code == 200, login.text
    jeton_admin = login.cookies["vetolib_admin_access"]

    for chemin, cookie in (
        ("/api/v1/auth/me", "vetolib_access"),
        ("/api/v1/owner/auth/me", "vetolib_owner_access"),
    ):
        client.cookies.set(cookie, jeton_admin)
        reponse = await client.get(chemin)
        assert reponse.status_code == 401, f"{chemin} a accepte un jeton plateforme."
