"""Événement de domaine, brique de base du pattern Outbox
(contexte `shared`, couche domain).

Un événement de domaine décrit un fait métier DÉJÀ accompli, nommé au
passé (ex : "identity.clinic_registered"). Un use case l'émet via
UnitOfWork.add_event() ; il ne déclenche jamais l'effet de bord
lui-même (email, notification...).

Pourquoi le pattern Outbox ? Si le use case publiait l'événement
directement vers un broker, deux pannes seraient possibles : commit DB
réussi mais publication perdue (effet jamais exécuté), ou publication
partie mais transaction annulée (événement "fantôme" annonçant un fait
qui n'a pas eu lieu). L'outbox supprime ce dilemme : l'événement est
inséré dans la table outbox_events dans LA MÊME transaction que les
données métier (voir SqlAlchemyUnitOfWork.commit), puis un relais
TaskIQ le lit et le publie de façon asynchrone. Garantie de livraison
at-least-once : un événement peut être délivré deux fois, jamais zéro.
Les handlers doivent donc être idempotents ; event_id sert de clé de
déduplication.
"""

import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import ClassVar


# frozen=True : un fait passé est immuable, personne ne doit pouvoir le
# modifier après coup. kw_only=True : champs par mot-clé, pour que les
# sous-classes ajoutent librement leurs propres champs.
@dataclass(frozen=True, kw_only=True)
class DomainEvent(ABC):
    """Fait métier accompli, persisté dans la table outbox avec la transaction
    qui l'a produit, puis relayé de façon asynchrone (at-least-once).

    Chaque contexte définit ses événements concrets en héritant de cette
    classe : fixer `event_type`, ajouter les champs utiles, implémenter
    payload().
    """

    # Nom qualifié du type d'événement, stocké en base à côté du payload ;
    # le relais s'en sert pour router vers le bon handler. ClassVar : une
    # constante de classe figée par chaque sous-classe, pas un champ
    # d'instance.
    event_type: ClassVar[str]

    # Identité de CET événement (distincte de l'id de l'entité concernée).
    # Généré à la création, il devient la PK de la ligne outbox et la clé
    # d'idempotence côté consommateurs.
    event_id: uuid.UUID = field(default_factory=uuid.uuid4)
    # Volontairement sans valeur par défaut : l'heure vient du port Clock
    # injecté dans le use case, jamais d'un datetime.now() caché
    # (testabilité, UTC garanti).
    occurred_at: datetime

    @abstractmethod
    def payload(self) -> dict[str, object]:
        """Représentation JSON-sérialisable de l'événement.

        Ce dict part tel quel dans la colonne JSONB `payload` de la
        table outbox_events : n'y mettre que des types sérialisables
        (str, int, bool...), donc convertir UUID et datetime en str.
        """
