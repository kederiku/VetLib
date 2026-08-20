"""Tâches asynchrones (TaskIQ) du contexte identity + branchement sur l'outbox.

Rappel du pattern Outbox, utilisé pour TOUT effet de bord asynchrone :

1. un use case enregistre un événement domaine via uow.add_event(...) ;
2. au commit, le UoW écrit l'événement dans la table outbox_events, DANS
   LA MÊME transaction que les données métier. Publier directement vers
   un broker depuis le use case risquerait un état incohérent (données
   commitées mais message perdu, ou l'inverse) ;
3. le relais (shared/infrastructure/outbox/relay.py, planifié chaque
   minute côté worker) lit les événements non traités et appelle le
   handler enregistré pour chaque event_type -> ce module-ci ;
4. le handler délègue à une tâche TaskIQ (.kiq = envoi au broker), que le
   worker exécute.

La livraison est at-least-once : en cas de crash entre le traitement et le
marquage processed_at, l'événement sera rejoué. Les tâches doivent donc
être idempotentes (les rejouer ne doit pas causer de dégâts).

Ce module est importé par vetolib.worker : l'enregistrement du handler en
bas de fichier s'exécute à l'import (le shared ne connaît aucun contexte,
chaque contexte vient brancher les siens).
"""

from typing import Any

import structlog

from vetolib.shared.infrastructure.outbox.registry import register_outbox_handler
from vetolib.shared.infrastructure.taskiq.broker import broker

logger = structlog.get_logger(__name__)


@broker.task(task_name="identity.send_welcome_email")
async def send_welcome_email(clinic_id: str, email: str, clinic_name: str) -> None:
    """Tâche de démonstration : « envoie » l'email de bienvenue (log uniquement).

    Idempotente par nature (relais outbox = at-least-once).
    """
    logger.info("welcome_email_sent", clinic_id=clinic_id, email=email, clinic_name=clinic_name)


async def _handle_clinic_registered(payload: dict[str, Any]) -> None:
    """Handler outbox de l'événement domaine ClinicRegistered.

    Reçoit le payload JSON stocké dans outbox_events et le transforme en
    tâche TaskIQ. `.kiq(...)` n'exécute pas la fonction : il sérialise
    l'appel et l'envoie au broker, un worker le traitera plus tard.
    """
    await send_welcome_email.kiq(
        clinic_id=str(payload["clinic_id"]),
        email=str(payload["manager_email"]),
        clinic_name=str(payload["clinic_name"]),
    )


# Effet de bord d'import volontaire : associe l'event_type (celui émis par
# l'entité domaine) à son handler dans le registre partagé du relais outbox.
register_outbox_handler("identity.clinic_registered", _handle_clinic_registered)


@broker.task(task_name="identity.send_owner_welcome_email")
async def send_owner_welcome_email(owner_id: str, email: str, first_name: str) -> None:
    """Tâche de démonstration : « envoie » l'email de bienvenue au propriétaire.

    Log uniquement (pas d'envoi réel au bootstrap). Idempotente par nature
    (relais outbox = at-least-once).
    """
    logger.info("owner_welcome_email_sent", owner_id=owner_id, email=email, first_name=first_name)


async def _handle_owner_registered(payload: dict[str, Any]) -> None:
    """Handler outbox de l'événement domaine OwnerRegistered."""
    await send_owner_welcome_email.kiq(
        owner_id=str(payload["owner_id"]),
        email=str(payload["email"]),
        first_name=str(payload["first_name"]),
    )


register_outbox_handler("identity.owner_registered", _handle_owner_registered)
