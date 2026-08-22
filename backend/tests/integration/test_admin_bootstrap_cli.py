"""Commande `make create-admin` : creation, refus du doublon, revocation.

Pourquoi tester la CLI, et pourquoi ici : c'est le SEUL moyen de creer un
compte du back-office (aucune route d'inscription, aucune graine en base).
Si elle casse, plus personne ne peut entrer -- et le probleme ne se
decouvrirait qu'au moment du deploiement.

Deux choix de mise en oeuvre :

- on appelle main() COMME UNE FONCTION Python, pas en sous-processus : un
  sous-processus n'est pas mesure par coverage, et le module passerait pour
  non couvert alors qu'il est le plus critique du lot ;
- main() fait un asyncio.run(), interdit depuis une boucle deja en cours :
  les tests async l'appellent donc dans un THREAD (asyncio.to_thread), ce qui
  reproduit fidelement l'execution en ligne de commande.

La saisie du mot de passe est exercee dans ses DEUX branches : entree
redirigee (convention `pass show ... | make create-admin`) et terminal
interactif (getpass).
"""

import asyncio
import io

import httpx
import pytest

from vetolib.cli import create_admin as cli

ADMIN_EMAIL = "fondateur@vetolib.fr"
ADMIN_PASSWORD = "phrase-de-passe-fondateur"


def _entree_redirigee(monkeypatch: pytest.MonkeyPatch, mot_de_passe: str) -> None:
    """Simule `echo <mot de passe> | make create-admin` (stdin non TTY)."""
    monkeypatch.setattr("sys.stdin", io.StringIO(f"{mot_de_passe}\n"))


async def _lancer(*args: str) -> int:
    """Execute la commande dans un thread (asyncio.run y est autorise)."""
    return await asyncio.to_thread(cli.main, list(args))


async def test_creation_puis_connexion_reelle(
    client: httpx.AsyncClient, base_vierge: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Le compte cree par la commande doit reellement pouvoir se connecter."""
    _entree_redirigee(monkeypatch, ADMIN_PASSWORD)

    code = await _lancer("--email", ADMIN_EMAIL, "--first-name", "Cedric", "--last-name", "D")

    assert code == 0
    reponse = await client.post(
        "/api/v1/admin/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert reponse.status_code == 200, reponse.text
    assert reponse.json()["first_name"] == "Cedric"


async def test_second_appel_avec_le_meme_email_est_refuse(
    base_vierge: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Jamais de remplacement silencieux : une faute de frappe ne doit pas
    devenir une prise de controle de compte."""
    _entree_redirigee(monkeypatch, ADMIN_PASSWORD)
    assert await _lancer("--email", ADMIN_EMAIL) == 0

    _entree_redirigee(monkeypatch, "un-autre-mot-de-passe-long")
    assert await _lancer("--email", ADMIN_EMAIL) == 1


async def test_reset_password_change_bien_le_mot_de_passe(
    client: httpx.AsyncClient, base_vierge: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    _entree_redirigee(monkeypatch, ADMIN_PASSWORD)
    assert await _lancer("--email", ADMIN_EMAIL) == 0

    nouveau = "nouvelle-phrase-de-passe"
    _entree_redirigee(monkeypatch, nouveau)
    assert await _lancer("--email", ADMIN_EMAIL, "--reset-password") == 0

    ancien = await client.post(
        "/api/v1/admin/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    assert ancien.status_code == 401
    recent = await client.post(
        "/api/v1/admin/auth/login", json={"email": ADMIN_EMAIL, "password": nouveau}
    )
    assert recent.status_code == 200, recent.text


async def test_saisie_interactive_avec_confirmation(
    base_vierge: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Branche terminal : getpass est appele DEUX fois (saisie + confirmation)."""
    saisies: list[str] = []

    def _faux_getpass(invite: str = "") -> str:
        saisies.append(invite)
        return ADMIN_PASSWORD

    monkeypatch.setattr("getpass.getpass", _faux_getpass)
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)

    assert await _lancer("--email", "interactif@vetolib.fr") == 0
    assert len(saisies) == 2


async def test_deux_saisies_differentes_sont_refusees(
    base_vierge: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    reponses = iter([ADMIN_PASSWORD, "pas-la-meme-chose-du-tout"])
    monkeypatch.setattr("getpass.getpass", lambda invite="": next(reponses))
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)

    assert await _lancer("--email", "faute@vetolib.fr") == 1


async def test_mot_de_passe_trop_court_est_refuse(
    base_vierge: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    """La commande applique EXACTEMENT la politique des deux autres espaces."""
    _entree_redirigee(monkeypatch, "court")

    assert await _lancer("--email", "trop-court@vetolib.fr") == 1


async def test_email_invalide_est_refuse_avant_toute_saisie(
    base_vierge: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Inutile de faire taper un mot de passe pour refuser sur l'adresse."""

    def _interdit(invite: str = "") -> str:
        raise AssertionError("le mot de passe ne doit pas etre demande")

    monkeypatch.setattr("getpass.getpass", _interdit)
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)

    assert await _lancer("--email", "pas-une-adresse") == 1


async def test_revocation_et_retablissement(
    client: httpx.AsyncClient, base_vierge: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    """--disable coupe l'acces, --enable le retablit."""
    _entree_redirigee(monkeypatch, ADMIN_PASSWORD)
    assert await _lancer("--email", ADMIN_EMAIL) == 0
    # Un second compte, sinon le garde-fou "dernier administrateur" bloque.
    _entree_redirigee(monkeypatch, ADMIN_PASSWORD)
    assert await _lancer("--email", "second@vetolib.fr") == 0

    assert await _lancer("--email", ADMIN_EMAIL, "--disable") == 0
    refuse = await client.post(
        "/api/v1/admin/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    assert refuse.status_code == 403

    assert await _lancer("--email", ADMIN_EMAIL, "--enable") == 0
    accepte = await client.post(
        "/api/v1/admin/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    assert accepte.status_code == 200, accepte.text


async def test_refus_de_revoquer_le_dernier_administrateur(
    base_vierge: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Se verrouiller dehors doit etre impossible : aucune route ne permettrait
    de recreer un compte, seule cette commande le peut."""
    _entree_redirigee(monkeypatch, ADMIN_PASSWORD)
    assert await _lancer("--email", ADMIN_EMAIL) == 0

    assert await _lancer("--email", ADMIN_EMAIL, "--disable") == 1


async def test_disable_et_enable_sont_exclusifs(base_vierge: None) -> None:
    assert await _lancer("--email", ADMIN_EMAIL, "--disable", "--enable") == 1
