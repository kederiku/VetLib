"""Tests unitaires des value objects du domaine identity.

L'étage le plus bas de la pyramide : du domaine pur (dataclasses sans aucun
import framework), donc même pas besoin de fakes -- on instancie et on
vérifie. Un value object est immuable, défini par sa valeur (deux Email de
même valeur sont égaux) et auto-validant : impossible de construire un Email
invalide, le reste du code peut donc lui faire confiance sans revalider.
"""

import pytest

from vetolib.identity.domain.value_objects import (
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    ROLE_PERMISSIONS,
    Email,
    HashedPassword,
    PlainPassword,
    Role,
)
from vetolib.shared.domain.errors import DomainValidationError


def test_email_est_normalise() -> None:
    """Trim + lowercase à la construction : une seule forme canonique.

    C'est cette normalisation qui rend le login et le contrôle d'unicité
    insensibles à la casse partout dans l'application, sans que chaque
    use case ait à y penser.
    """
    assert Email("  Foo@Bar.COM ").value == "foo@bar.com"
    # Égalité par valeur (dataclass frozen) : la casse d'origine ne compte pas.
    assert Email("foo@bar.com") == Email("FOO@bar.com")


@pytest.mark.parametrize("raw", ["nope", "a@b", "@bar.com", "foo@", "foo bar@x.fr", ""])
def test_email_invalide_est_rejete(raw: str) -> None:
    """Un Email invalide ne peut pas EXISTER : le constructeur lève.

    parametrize rejoue le test pour chaque forme invalide (pas de @, pas de
    domaine, espace, chaîne vide...). L'erreur est une DomainValidationError
    du domaine, pas une exception technique.
    """
    with pytest.raises(DomainValidationError):
        Email(raw)


def test_hashed_password_ne_fuit_pas_dans_repr() -> None:
    """Le repr est masqué : un hash ne doit jamais fuiter dans les logs.

    repr() est appelé implicitement par les tracebacks, le logging et les
    débogueurs : sans ce masquage, une simple erreur suffirait à écrire du
    matériel sensible dans les journaux.
    """
    hashed = HashedPassword("argon2-secret-material")
    assert "argon2-secret-material" not in repr(hashed)


def test_matrice_des_roles() -> None:
    """Verrouille ROLE_PERMISSIONS, la source des permissions du "fat token".

    Cette matrice part telle quelle dans les claims JWT : la modifier change
    les droits effectifs de tous les utilisateurs. Le test documente et fige
    la hiérarchie asv < veterinarian < manager.
    """
    # L'ASV n'a pas accès aux données médicales sensibles.
    assert "medical_record:read" not in ROLE_PERMISSIONS[Role.ASV]
    assert "medical_record:write" in ROLE_PERMISSIONS[Role.VETERINARIAN]
    # Le gérant cumule les droits du vétérinaire + administration.
    # ("<=" entre frozensets = test d'inclusion : "est un sous-ensemble de").
    assert ROLE_PERMISSIONS[Role.VETERINARIAN] <= ROLE_PERMISSIONS[Role.MANAGER]
    assert "clinic:manage" in ROLE_PERMISSIONS[Role.MANAGER]
    assert "clinic:manage" not in ROLE_PERMISSIONS[Role.VETERINARIAN]


# --- Politique de mot de passe ---------------------------------------------
# Ces tests documentent un choix qui surprend : il n'y a AUCUNE regle de
# composition. C'est volontaire et conforme a NIST SP 800-63B ; les tests
# ci-dessous verrouillent cette absence pour qu'on ne la "corrige" pas par
# reflexe dans six mois.


def test_mot_de_passe_trop_court_est_rejete() -> None:
    """Un caractere de moins que le minimum suffit a refuser."""
    with pytest.raises(DomainValidationError):
        PlainPassword("a" * (PASSWORD_MIN_LENGTH - 1))


def test_mot_de_passe_a_la_longueur_minimale_est_accepte() -> None:
    """La borne est INCLUSIVE : exactement le minimum passe."""
    minimal = "a" * PASSWORD_MIN_LENGTH
    assert PlainPassword(minimal).value == minimal


def test_mot_de_passe_trop_long_est_rejete() -> None:
    """Le plafond est un garde-fou technique : Argon2 hache l'entree telle
    quelle, une chaine demesuree serait un deni de service a bon marche."""
    with pytest.raises(DomainValidationError):
        PlainPassword("a" * (PASSWORD_MAX_LENGTH + 1))


def test_aucune_regle_de_composition_n_est_imposee() -> None:
    """Ni majuscule, ni chiffre, ni caractere special exiges.

    Ces regles produisent des variantes previsibles ("Motdepasse1!") sans
    gagner d'entropie reelle : la norme les deconseille explicitement. La
    contrepartie est la verification anti-compromission, qui vit hors du
    domaine (port CompromisedPasswordChecker).
    """
    assert PlainPassword("abcdefghijklmnop").value == "abcdefghijklmnop"


def test_phrase_de_passe_avec_espaces_est_acceptee() -> None:
    """Les espaces sont des caracteres comme les autres, y compris en bordure.

    Aucune normalisation : rogner les espaces silencieusement empecherait de
    se reconnecter avec ce qui a reellement ete tape.
    """
    phrase = " mon chat rex adore les croquettes "
    assert PlainPassword(phrase).value == phrase


def test_le_repr_du_mot_de_passe_en_clair_est_masque() -> None:
    """Meme protection que HashedPassword, et pour une raison plus forte
    encore : ici la valeur est en CLAIR. Un traceback ne doit jamais
    l'ecrire dans les journaux."""
    assert "phrase-tres-secrete" not in repr(PlainPassword("phrase-tres-secrete-42"))
