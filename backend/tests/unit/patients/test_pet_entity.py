"""Tests de l'entite Pet : les regles de validation de la fiche.

Le domaine n'avait aucun test direct tant que la fiche se limitait a un nom
et une espece. L'enrichissement y introduit de vraies regles -- une date de
naissance impossible, une race de blancs -- qu'il vaut mieux verrouiller ici,
au plus pres, que de traquer plus tard dans un 422 d'integration.

`now` est toujours injecte : le domaine n'appelle jamais datetime.now(),
c'est ce qui rend ces tests deterministes.
"""

import uuid
from datetime import UTC, date, datetime

import pytest

from vetolib.patients.domain.pet import BREED_MAX_LENGTH, Pet, Sex, Species
from vetolib.shared.domain.errors import DomainValidationError

OWNER = uuid.UUID("00000000-0000-0000-0000-00000000000a")
MAINTENANT = datetime(2026, 8, 21, 10, 0, tzinfo=UTC)


def _pet(**surcharges: object) -> Pet:
    """Fiche minimale, surchargeable champ par champ."""
    defauts: dict[str, object] = {
        "owner_id": OWNER,
        "name": "Rex",
        "species": Species.DOG,
        "now": MAINTENANT,
    }
    return Pet.create(**{**defauts, **surcharges})  # type: ignore[arg-type]


def test_la_fiche_minimale_ne_demande_qu_un_nom_et_une_espece() -> None:
    """Declarer un animal en urgence ne doit rien exiger de plus."""
    pet = _pet()

    assert pet.birth_date is None
    assert pet.breed is None
    assert pet.sterilized is None
    # "Inconnu" est une VALEUR de l'enum, pas une absence : l'affichage a
    # toujours quelque chose a montrer.
    assert pet.sex is Sex.UNKNOWN


def test_une_date_de_naissance_future_est_refusee() -> None:
    with pytest.raises(DomainValidationError, match="futur"):
        _pet(birth_date=date(2027, 1, 1))


def test_la_date_du_jour_est_acceptee_malgre_le_decalage_utc() -> None:
    """Tolerance d'un jour : `now` est en UTC, pas dans le fuseau du client.

    Un proprietaire en Nouvelle-Caledonie (UTC+11) est deja "demain" pendant
    onze heures ; sans cette marge il se verrait refuser la date du jour.
    """
    assert _pet(birth_date=date(2026, 8, 22)).birth_date == date(2026, 8, 22)


def test_une_date_de_naissance_aberrante_est_refusee() -> None:
    """Garde-fou de faute de frappe, pas regle biologique.

    La borne haute attrape "2202", celle-ci attrape "0202". On ne borne
    surtout PAS par longevite d'espece : une tortue NAC depasse
    legitimement tous les chiens.
    """
    with pytest.raises(DomainValidationError, match="anterieure"):
        _pet(birth_date=date(1899, 12, 31))


def test_la_race_est_trimee() -> None:
    assert _pet(breed="  Berger australien  ").breed == "Berger australien"


def test_une_race_de_blancs_vaut_non_renseignee() -> None:
    """Une saisie d'espaces signifie "non rempli", pas une erreur."""
    assert _pet(breed="   ").breed is None


def test_une_race_trop_longue_apres_trim_est_refusee() -> None:
    """La longueur est mesuree APRES normalisation, comme le VO Address.

    Valider la valeur brute laisserait passer 100 caracteres entoures
    d'espaces.
    """
    with pytest.raises(DomainValidationError, match="race"):
        _pet(breed=" " + "a" * (BREED_MAX_LENGTH + 1) + " ")


def test_update_profile_valide_aussi_la_date() -> None:
    """La regle vit dans l'entite : elle s'applique a la creation ET a
    l'edition, sans que le use case ait a la repeter."""
    pet = _pet()

    with pytest.raises(DomainValidationError, match="futur"):
        pet.update_profile(
            name="Rex",
            species=Species.DOG,
            birth_date=date(2030, 1, 1),
            sex=Sex.UNKNOWN,
            breed=None,
            sterilized=None,
            now=MAINTENANT,
        )

    # Refus AVANT toute ecriture : la fiche est intacte.
    assert pet.birth_date is None


def test_update_profile_remplace_meme_les_champs_absents() -> None:
    """C'est la semantique PUT : ce qui n'est pas fourni est efface."""
    pet = _pet(breed="Berger australien", sterilized=True, sex=Sex.FEMALE)

    pet.update_profile(
        name="Rex",
        species=Species.DOG,
        birth_date=None,
        sex=Sex.UNKNOWN,
        breed=None,
        sterilized=None,
        now=MAINTENANT,
    )

    assert pet.breed is None
    assert pet.sterilized is None
    assert pet.sex is Sex.UNKNOWN
