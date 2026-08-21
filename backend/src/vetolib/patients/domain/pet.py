"""Entité Pet : un animal appartenant à un propriétaire (compte B2C).

Couche domain du contexte patients : dataclass pure, zéro import de
framework, testable sans base de données. La persistance est décrite par le
port PetRepository et réalisée dans infrastructure/.

Comme son propriétaire (Owner, contexte identity), un animal est une donnée
GLOBALE, hors tenant : Rex reste le même chien chez tous les vétérinaires
que son maître consulte. Pas de clinic_id ici ; le lien animal <-> clinique
viendra des tables tenantées (dossiers médicaux, rendez-vous), jamais d'une
clé de tenant sur l'animal lui-même.

CE QUE LA FICHE NE PORTE PAS, volontairement : le POIDS. Un poids est une
mesure datée, pas un attribut d'identité -- un chiot triple le sien en trois
mois. Une colonne scalaire deviendrait silencieusement périmée, et un poids
périmé affiché sur une fiche est PIRE qu'un poids absent : il donne
l'illusion d'une information à jour. Le besoin réel du vétérinaire est
d'ailleurs la courbe, pas le point ; sa place est une table de mesures
tenantée du futur dossier médical, car une pesée est un acte réalisé PAR une
clinique.
"""

import re
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from enum import StrEnum

from vetolib.shared.domain.entity import Entity
from vetolib.shared.domain.errors import DomainValidationError


class Species(StrEnum):
    """Espèces reconnues par la plateforme, volontairement grossières.

    Ce n'est pas une taxonomie médicale : l'espèce sert au tri des agendas
    (un vétérinaire NAC ne voit pas les mêmes créneaux) et à l'affichage.
    NAC = nouveaux animaux de compagnie (lapins, furets, reptiles...).
    StrEnum : chaque membre EST une str (Species.DOG == "dog"), ce qui
    simplifie le stockage en base et la sérialisation JSON -- même choix que
    Role dans identity. Doit rester synchronisé avec la contrainte CHECK
    ck_pets_species_valid de la table pets.
    """

    DOG = "dog"
    CAT = "cat"
    NAC = "nac"
    OTHER = "other"


class Sex(StrEnum):
    """Sexe de l'animal, avec "inconnu" comme VALEUR et non comme absence.

    Trois membres et une colonne NOT NULL, plutôt qu'un enum à deux membres
    et une colonne nullable : sinon "je ne sais pas" s'écrirait de DEUX
    façons (NULL et 'unknown'), et toute comparaison deviendrait un piège.
    L'affichage a ainsi toujours une valeur à montrer.

    Doit rester synchronisé avec la contrainte CHECK ck_pets_sex_valid.
    """

    MALE = "male"
    FEMALE = "female"
    UNKNOWN = "unknown"


# Longueur maximale de la race, miroir de la colonne String(100) et du
# schéma Pydantic. Texte libre : la plateforme n'a pas de référentiel de
# races, et en construire un pour quatre espèces coûterait plus qu'il ne
# rapporterait. Une migration future vers un breed_id resterait possible en
# gardant ce champ comme repli.
BREED_MAX_LENGTH = 100

# Plancher de la date de naissance. Ce n'est PAS une regle biologique, c'est
# un garde-fou de faute de frappe : "2202" est attrape par la borne haute,
# "0202" par celle-ci. Surtout pas de longevite par espece -- une tortue NAC
# depasse legitimement tous les chiens, et la regle casserait des qu'on
# reclasserait l'animal.
MIN_BIRTH_DATE = date(1900, 1, 1)

_BREED_INVALIDE = re.compile(r"^\s*$")


def _normalize_breed(breed: str | None) -> str | None:
    """Nettoie la race : trim, chaîne vide -> None, longueur validée.

    Une saisie de blancs dans un formulaire signifie "non rempli", pas une
    erreur : on la traduit en None plutôt que de la refuser. La longueur est
    mesurée APRES le trim, comme le fait le value object Address d'identity :
    valider la valeur brute laisserait passer 100 caractères entourés
    d'espaces.
    """
    if breed is None or _BREED_INVALIDE.match(breed):
        return None
    nettoye = breed.strip()
    if len(nettoye) > BREED_MAX_LENGTH:
        raise DomainValidationError(f"La race ne peut pas depasser {BREED_MAX_LENGTH} caracteres.")
    return nettoye


def _validate_birth_date(birth_date: date | None, *, now: datetime) -> None:
    """Refuse une date de naissance impossible (future ou aberrante).

    Tolerance d'un jour sur la borne haute : `now` est en UTC, alors qu'un
    proprietaire en Nouvelle-Caledonie (UTC+11) est deja "demain" pendant
    onze heures. Sans cette marge, il se verrait refuser la date du jour.
    """
    if birth_date is None:
        return
    if birth_date > (now.date() + timedelta(days=1)):
        raise DomainValidationError("La date de naissance ne peut pas etre dans le futur.")
    if birth_date < MIN_BIRTH_DATE:
        raise DomainValidationError(
            f"La date de naissance ne peut pas etre anterieure au {MIN_BIRTH_DATE:%d/%m/%Y}."
        )


@dataclass(kw_only=True, eq=False)
class Pet(Entity):
    """Animal d'un propriétaire : identité et caractéristiques stables.

    Hérite d'Entity : id UUID, created_at, deleted_at (soft delete : on ne
    supprime jamais physiquement un animal -- son historique médical futur
    devra survivre, exigence légale vétérinaire).

    Tous les champs de la fiche enrichie sont FACULTATIFS et ont un défaut :
    déclarer un animal en urgence ne doit demander qu'un nom et une espèce,
    le reste se complète plus tard.
    """

    owner_id: uuid.UUID
    name: str
    species: Species
    birth_date: date | None = None
    sex: Sex = Sex.UNKNOWN
    breed: str | None = None
    # Tri-état assumé : True stérilisé, False non stérilisé, None "je ne sais
    # pas". Contrairement au sexe, un booléen ne peut pas porter un troisième
    # membre ; créer un enum juste pour la symétrie ajouterait un type à
    # l'OpenAPI pour un seul champ.
    sterilized: bool | None = None

    @classmethod
    def create(
        cls,
        *,
        owner_id: uuid.UUID,
        name: str,
        species: Species,
        now: datetime,
        birth_date: date | None = None,
        sex: Sex = Sex.UNKNOWN,
        breed: str | None = None,
        sterilized: bool | None = None,
    ) -> "Pet":
        """Factory de création : id généré côté domaine, `now` injecté (Clock).

        Pas d'événement de domaine ici (contrairement à Owner.register) :
        l'ajout d'un animal n'a pas encore d'effet de bord asynchrone à
        déclencher. Le jour venu (rappel vaccinal...), la factory renverra
        aussi l'événement, comme les factories d'identity.
        """
        _validate_birth_date(birth_date, now=now)
        return cls(
            id=uuid.uuid4(),
            created_at=now,
            owner_id=owner_id,
            name=name,
            species=species,
            birth_date=birth_date,
            sex=sex,
            breed=_normalize_breed(breed),
            sterilized=sterilized,
        )

    def update_profile(
        self,
        *,
        name: str,
        species: Species,
        birth_date: date | None,
        sex: Sex,
        breed: str | None,
        sterilized: bool | None,
        now: datetime,
    ) -> None:
        """Remplace TOUTE la fiche (sémantique PUT), sans valeur par défaut.

        POURQUOI UN REMPLACEMENT ET NON UN PATCH : la fiche compte desormais
        des champs effacables (race, date de naissance...). Avec l'ancienne
        regle "None = inchange", il devenait IMPOSSIBLE de vider une race
        saisie par erreur -- envoyer null aurait voulu dire "n'y touche pas".
        La sentinelle qui distinguerait "absent" de "null" ne serait d'aucun
        secours : OpenAPI ne sait pas exprimer cette difference, le client
        genere ne pourrait donc pas s'y fier. C'est le meme parti pris que
        Owner.update_profile dans identity, et le formulaire du portail
        envoie de toute facon la fiche entiere.

        AUCUN PARAMETRE N'A DE DEFAUT, volontairement : oublier un champ
        devient une erreur de compilation (mypy) et non un effacement
        silencieux. C'est la propriete de securite de cette methode.

        owner_id n'est pas modifiable : un animal ne change pas de
        proprietaire par une simple edition de fiche (un transfert sera un
        flux dedie, trace).
        """
        _validate_birth_date(birth_date, now=now)
        self.name = name
        self.species = species
        self.birth_date = birth_date
        self.sex = sex
        self.breed = _normalize_breed(breed)
        self.sterilized = sterilized

    def soft_delete(self, now: datetime) -> None:
        """Suppression logique : la ligne reste en base, masquée des lectures.

        Convention du projet (jamais de DELETE SQL) : les repositories
        filtrent deleted_at IS NULL, l'animal disparaît donc des listes mais
        son historique reste disponible pour l'audit.
        """
        self.deleted_at = now
