"""Entité Pet : un animal appartenant à un propriétaire (compte B2C).

Couche domain du contexte patients : dataclass pure, zéro import de
framework, testable sans base de données. La persistance est décrite par le
port PetRepository et réalisée dans infrastructure/.

Comme son propriétaire (Owner, contexte identity), un animal est une donnée
GLOBALE, hors tenant : Rex reste le même chien chez tous les vétérinaires
que son maître consulte. Pas de clinic_id ici ; le lien animal <-> clinique
viendra des tables tenantées (dossiers médicaux, rendez-vous), jamais d'une
clé de tenant sur l'animal lui-même.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from vetolib.shared.domain.entity import Entity


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


@dataclass(kw_only=True, eq=False)
class Pet(Entity):
    """Animal d'un propriétaire : fiche minimale du bootstrap (nom, espèce).

    Hérite d'Entity : id UUID, created_at, deleted_at (soft delete : on ne
    supprime jamais physiquement un animal -- son historique médical futur
    devra survivre, exigence légale vétérinaire).
    """

    owner_id: uuid.UUID
    name: str
    species: Species

    @classmethod
    def create(cls, *, owner_id: uuid.UUID, name: str, species: Species, now: datetime) -> "Pet":
        """Factory de création : id généré côté domaine, `now` injecté (Clock).

        Pas d'événement de domaine ici (contrairement à Owner.register) :
        l'ajout d'un animal n'a pas encore d'effet de bord asynchrone à
        déclencher. Le jour venu (rappel vaccinal...), la factory renverra
        aussi l'événement, comme les factories d'identity.
        """
        return cls(id=uuid.uuid4(), created_at=now, owner_id=owner_id, name=name, species=species)

    def update(self, *, name: str | None, species: Species | None) -> None:
        """Mise à jour PARTIELLE (sémantique PATCH) : n'écrase que le non-None.

        Un champ absent du PATCH arrive ici à None et reste inchangé -- le
        client n'envoie que ce qu'il modifie. owner_id n'est pas modifiable :
        un animal ne change pas de propriétaire par une simple édition de
        fiche (un transfert de propriété sera un flux dédié, tracé).
        """
        if name is not None:
            self.name = name
        if species is not None:
            self.species = species

    def soft_delete(self, now: datetime) -> None:
        """Suppression logique : la ligne reste en base, masquée des lectures.

        Convention du projet (jamais de DELETE SQL) : les repositories
        filtrent deleted_at IS NULL, l'animal disparaît donc des listes mais
        son historique reste disponible pour l'audit.
        """
        self.deleted_at = now
