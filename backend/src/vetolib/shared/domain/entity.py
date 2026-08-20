"""Entité de base du domaine partagé (contexte `shared`, couche domain).

Toutes les entités des bounded contexts (User, Clinic, demain Patient,
Appointment...) héritent de cette dataclass. Elle est volontairement
"pure" : aucun import de framework (ni SQLAlchemy ni Pydantic), comme
l'exige la couche domain de l'architecture hexagonale. La correspondance
avec les tables SQL est faite ailleurs, dans les couches infrastructure.

Notions clés pour un novice :
- Une entité est définie par son IDENTITÉ (`id`), pas par ses attributs :
  deux instances portant le même id représentent la même entité métier,
  même si leurs autres champs diffèrent (versions plus ou moins fraîches
  du même enregistrement). C'est ce que codifient __eq__ et __hash__.
- `id` est un UUID (convention projet : UUID pour toutes les PK), généré
  côté application et non par la base : on connaît donc l'id avant même
  l'INSERT, pratique pour les événements et les liens entre entités.
- Soft delete : on ne fait JAMAIS de DELETE SQL. Supprimer une entité
  consiste à renseigner `deleted_at` ; la ligne reste en base (audit,
  traçabilité des données médicales) mais est filtrée des lectures.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime


# kw_only=True : tous les champs se passent par mot-clé ; les sous-classes
# peuvent ainsi ajouter des champs avec ou sans valeur par défaut, sans
# contrainte d'ordre. eq=False : on désactive le __eq__ généré par
# dataclass (qui comparerait TOUS les champs) au profit d'une égalité
# par identité, définie ci-dessous.
@dataclass(kw_only=True, eq=False)
class Entity:
    """Base des entités : identité par `id`, cycle de vie soft-delete.

    Champs communs à toute entité du projet :
    - id : identité stable (UUID, clé primaire) ;
    - created_at : date de création, fournie par le port Clock (UTC),
      jamais par un datetime.now() caché (testabilité) ;
    - deleted_at : None tant que l'entité est vivante ; une date marque
      la suppression logique (soft delete), jamais physique.
    """

    id: uuid.UUID
    created_at: datetime
    deleted_at: datetime | None = None

    def __eq__(self, other: object) -> bool:
        """Deux entités sont égales si même type concret et même id.

        On renvoie NotImplemented (et non False) pour un objet d'un
        autre type : Python essaiera alors le __eq__ de l'autre
        opérande, comme le veut le protocole de comparaison.
        """
        if not isinstance(other, type(self)):
            return NotImplemented
        return self.id == other.id

    def __hash__(self) -> int:
        # Définir __eq__ supprime le __hash__ hérité : on le rétablit,
        # basé sur l'id (immuable), pour pouvoir mettre des entités dans
        # un set ou en clé de dict. Cohérent avec __eq__ : deux entités
        # égales ont le même hash.
        return hash(self.id)
