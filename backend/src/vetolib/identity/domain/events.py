"""Événements de domaine du contexte identity.

Un événement de domaine est un fait métier PASSÉ, donc immuable
(frozen=True) : il décrit ce qui vient de se produire, pas une commande à
exécuter. Il n'est jamais publié directement par le domaine : le use case
l'ajoute au UnitOfWork, qui l'écrit dans la table outbox_events DANS la même
transaction que les entités (pattern Outbox). Le relais TaskIQ le lit ensuite
et déclenche les effets de bord en asynchrone (at-least-once) : ils ne
peuvent ni se perdre si le process crashe après le commit, ni s'exécuter
alors que la transaction a été annulée.
"""

import uuid
from dataclasses import dataclass
from typing import ClassVar

from vetolib.shared.domain.events import DomainEvent


@dataclass(frozen=True, kw_only=True)
class ClinicRegistered(DomainEvent):
    """Une clinique (et son utilisateur gérant) vient de s'inscrire.

    Émis par la factory Clinic.register ; consommateurs typiques, en
    asynchrone : email de bienvenue, provisioning, statistiques.

    `event_type` est un ClassVar (attribut de classe, pas un champ de la
    dataclass) : c'est le nom STABLE écrit dans la colonne event_type de
    l'outbox et sur lequel les handlers routent. Ne pas le renommer sans
    migrer les événements encore en attente dans la table.
    """

    event_type: ClassVar[str] = "identity.clinic_registered"

    clinic_id: uuid.UUID
    clinic_name: str
    manager_email: str

    def payload(self) -> dict[str, object]:
        """Corps JSON stocké dans l'outbox : types primitifs uniquement.

        Les UUID sont convertis en str ici, une seule fois, plutôt que de
        laisser chaque sérialiseur deviner comment encoder les types Python.
        """
        return {
            "clinic_id": str(self.clinic_id),
            "clinic_name": self.clinic_name,
            "manager_email": self.manager_email,
        }


@dataclass(frozen=True, kw_only=True)
class OwnerRegistered(DomainEvent):
    """Un propriétaire d'animaux (compte B2C) vient de s'inscrire.

    Émis par la factory Owner.register ; consommateur actuel : l'email de
    bienvenue (tâche de démonstration). Même contrat que ClinicRegistered :
    event_type stable, payload en types primitifs pour l'outbox.
    """

    event_type: ClassVar[str] = "identity.owner_registered"

    owner_id: uuid.UUID
    email: str
    first_name: str

    def payload(self) -> dict[str, object]:
        return {
            "owner_id": str(self.owner_id),
            "email": self.email,
            "first_name": self.first_name,
        }
