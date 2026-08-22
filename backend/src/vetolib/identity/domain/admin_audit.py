"""Journal d'audit des actions du back-office plateforme.

Pourquoi une table dediee, et pas l'outbox deja en place : l'outbox est un
TRANSPORT, pas un stockage. Son relais porte un TODO de purge periodique, et
`DomainEvent` ne transporte aucun ACTEUR -- or "qui a suspendu cette
clinique ?" est precisement la question a laquelle ce journal doit repondre.
Construire une piste d'audit sur une file destinee a etre videe serait une
bombe a retardement.

Les deux mecanismes coexistent donc, avec des roles distincts :
- ce journal est la source de verite du "qui a fait quoi, sur qui, quand" ;
- l'outbox ne recoit que les evenements qui declenchent un vrai effet de
  bord (un email a envoyer), et il peut etre purge sans rien perdre d'autre.

Append-only par construction : le port n'expose que `add()` et des lectures.
Ni update, ni delete -- la regle est portee par l'interface, pas par une
convention qu'on esperera respectee.
"""

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any


class AuditAction(StrEnum):
    """Actions tracees. Chaine STABLE : elle est ecrite en base.

    Convention de nommage `<cible>.<action au passe>`, comme les event_type
    de l'outbox. Renommer une valeur rendrait illisible tout l'historique
    deja enregistre : on en ajoute, on n'en renomme pas.
    """

    CLINIC_CREATED = "clinic.created"
    CLINIC_UPDATED = "clinic.updated"
    CLINIC_SUSPENDED = "clinic.suspended"
    CLINIC_REACTIVATED = "clinic.reactivated"
    STAFF_CREATED = "staff.created"
    STAFF_ROLE_CHANGED = "staff.role_changed"
    STAFF_DEACTIVATED = "staff.deactivated"
    STAFF_ACTIVATED = "staff.activated"
    OWNER_UPDATED = "owner.updated"
    OWNER_DEACTIVATED = "owner.deactivated"
    OWNER_REACTIVATED = "owner.reactivated"


class AuditTargetType(StrEnum):
    """Nature de l'objet sur lequel l'action a porte."""

    CLINIC = "clinic"
    OWNER = "owner"
    USER = "user"


@dataclass(frozen=True, kw_only=True)
class AdminAuditEntry:
    """Une ligne du journal : un fait passe, donc immuable (frozen).

    L'email de l'acteur est DENORMALISE volontairement : il reste lisible
    meme si le compte administrateur est desactive plus tard, et il evite
    une jointure sur chaque ligne d'un ecran d'historique.
    """

    id: uuid.UUID
    occurred_at: datetime
    actor_id: uuid.UUID
    actor_email: str
    action: AuditAction
    target_type: AuditTargetType
    target_id: uuid.UUID
    details: dict[str, Any] = field(default_factory=dict)
    """Avant/apres, par exemple {"from": "asv", "to": "veterinarian"}.

    JAMAIS de mot de passe, d'empreinte ni de jeton : ce journal est destine
    a etre LU, y compris par quelqu'un qui n'aurait pas a connaitre ces
    valeurs.
    """

    @classmethod
    def record(
        cls,
        *,
        actor_id: uuid.UUID,
        actor_email: str,
        action: AuditAction,
        target_type: AuditTargetType,
        target_id: uuid.UUID,
        now: datetime,
        details: dict[str, Any] | None = None,
    ) -> "AdminAuditEntry":
        """Factory : genere l'identifiant et fige l'horodatage."""
        return cls(
            id=uuid.uuid4(),
            occurred_at=now,
            actor_id=actor_id,
            actor_email=actor_email,
            action=action,
            target_type=target_type,
            target_id=target_id,
            details=details or {},
        )
