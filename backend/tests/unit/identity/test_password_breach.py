"""Tests des adapters de verification anti-compromission des mots de passe.

Ce que ces tests protegent, dans l'ordre d'importance :

1. le REPLI. Une panne de Have I Been Pwned ne doit jamais empecher quelqu'un
   de s'inscrire. C'est la promesse du port CompromisedPasswordChecker, et
   c'est ce qui casserait le plus silencieusement ;
2. le BOURRAGE de reponse. L'en-tete Add-Padding fait renvoyer par l'API de
   fausses empreintes, reconnaissables a leur compteur nul. Les compter comme
   de vraies fuites declarerait TOUS les mots de passe compromis -- une
   inscription deviendrait impossible ;
3. la k-anonymity. Seuls cinq caracteres hexadecimaux partent sur le reseau.

Aucun appel reseau ici : httpx est branche sur un MockTransport, qui repond
en memoire. On teste notre code, pas le service tiers.
"""

import httpx
import pytest

from vetolib.identity.infrastructure.password_breach import (
    FallbackPasswordChecker,
    HibpPasswordChecker,
    LocalBlocklistPasswordChecker,
    load_common_passwords,
)

# SHA-1 de "correct-horse-battery-staple", en majuscules comme le renvoie
# l'API. Prefixe = les 5 premiers caracteres, suffixe = les 35 suivants.
EMPREINTE = "DD606CD49BBBD06B4C2606FC2449F8FB87975786"
PREFIXE, SUFFIXE = EMPREINTE[:5], EMPREINTE[5:]
MOT_DE_PASSE = "correct-horse-battery-staple"


def _client(gestionnaire: object) -> httpx.AsyncClient:
    """Client httpx qui ne sort jamais : MockTransport repond en memoire."""
    return httpx.AsyncClient(transport=httpx.MockTransport(gestionnaire))  # type: ignore[arg-type]


def _checker(gestionnaire: object) -> HibpPasswordChecker:
    return HibpPasswordChecker(
        _client(gestionnaire), api_url="https://exemple.test/range", timeout_seconds=1.0
    )


async def test_hibp_detecte_un_mot_de_passe_present_dans_une_fuite() -> None:
    """Le suffixe figure dans la reponse avec un compteur non nul."""

    def repondre(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=f"0123456789ABCDEF:3\r\n{SUFFIXE}:42\r\n")

    assert await _checker(repondre).is_compromised(MOT_DE_PASSE) is True


async def test_hibp_accepte_un_mot_de_passe_absent_du_corpus() -> None:
    def repondre(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="0123456789ABCDEF0123456789ABCDEF012:7\r\n")

    assert await _checker(repondre).is_compromised(MOT_DE_PASSE) is False


async def test_hibp_ignore_les_entrees_de_bourrage() -> None:
    """Compteur a zero = fausse empreinte ajoutee par Add-Padding.

    Sans ce filtre, le bourrage suffirait a declarer n'importe quel mot de
    passe compromis : plus personne ne pourrait s'inscrire.
    """

    def repondre(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=f"{SUFFIXE}:0\r\n")

    assert await _checker(repondre).is_compromised(MOT_DE_PASSE) is False


async def test_hibp_n_envoie_que_cinq_caracteres_d_empreinte() -> None:
    """k-anonymity : le mot de passe ne quitte JAMAIS le serveur.

    On verifie que l'URL appelee ne contient que le prefixe, et surtout ni le
    mot de passe ni son empreinte complete.
    """
    urls: list[str] = []

    def repondre(request: httpx.Request) -> httpx.Response:
        urls.append(str(request.url))
        # Au passage : l'en-tete de bourrage est bien demande.
        assert request.headers["Add-Padding"] == "true"
        return httpx.Response(200, text="")

    await _checker(repondre).is_compromised(MOT_DE_PASSE)

    assert urls == [f"https://exemple.test/range/{PREFIXE}"]
    assert MOT_DE_PASSE not in urls[0]
    assert SUFFIXE not in urls[0]


async def test_liste_locale_ignore_la_casse() -> None:
    """ "Motdepasse1234" est aussi previsible que "motdepasse1234"."""
    locale = LocalBlocklistPasswordChecker(frozenset({"motdepasse1234"}))
    assert await locale.is_compromised("MotDePasse1234") is True
    assert await locale.is_compromised("une-phrase-bien-a-moi") is False


def test_la_liste_embarquee_est_chargeable_et_filtree() -> None:
    """Le fichier livre avec le paquet est lisible et respecte sa promesse :
    aucune entree en dessous du minimum de la politique (elles ne serviraient
    a rien, le value object PlainPassword les a deja refusees)."""
    entrees = load_common_passwords()
    assert len(entrees) > 1000
    assert all(len(entree) >= 14 for entree in entrees)
    # Les commentaires d'en-tete ne doivent pas etre pris pour des entrees.
    assert not any(entree.startswith("#") for entree in entrees)


@pytest.mark.parametrize(
    "panne",
    [
        httpx.ConnectError("dns injoignable"),
        httpx.ReadTimeout("trop lent"),
        RuntimeError("panne inattendue"),
    ],
)
async def test_le_repli_absorbe_toute_panne_de_la_source_principale(panne: Exception) -> None:
    """LE test important : une inscription ne doit jamais echouer parce qu'un
    service tiers est indisponible. Quelle que soit la panne, on bascule sur
    la liste embarquee et on rend un verdict."""

    class SourceEnPanne:
        async def is_compromised(self, password: str) -> bool:
            raise panne

    composite = FallbackPasswordChecker(
        SourceEnPanne(), LocalBlocklistPasswordChecker(frozenset({"motdepasse1234"}))
    )

    # Le repli rend un vrai verdict, pas un "dans le doute, on accepte".
    assert await composite.is_compromised("motdepasse1234") is True
    assert await composite.is_compromised("une-phrase-bien-a-moi") is False


async def test_le_repli_n_est_pas_consulte_quand_la_source_principale_repond() -> None:
    """Tant que HIBP repond, la liste embarquee (bien plus etroite) ne doit
    pas pouvoir contredire son verdict."""

    class SourceDisponible:
        async def is_compromised(self, password: str) -> bool:
            return False

    class ReplitInterdit:
        async def is_compromised(self, password: str) -> bool:
            raise AssertionError("le repli ne devait pas etre consulte")

    composite = FallbackPasswordChecker(SourceDisponible(), ReplitInterdit())
    assert await composite.is_compromised("motdepasse1234") is False
