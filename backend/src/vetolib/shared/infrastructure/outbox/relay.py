"""Relais Outbox : le pont entre la table `outbox_events` et les tâches TaskIQ.

C'est la seconde moitié du pattern Outbox. La première moitié (l'UoW, voir
shared/infrastructure/db/uow.py) écrit les événements dans la table AVEC la
transaction métier ; ce relais, lui, tourne côté worker et "vide" la table :
il sélectionne les lignes non traitées, appelle le handler enregistré pour
chaque `event_type` (voir outbox/registry.py) — lequel publie en général une
tâche TaskIQ — puis marque les lignes comme traitées.

Le relais est lui-même une tâche TaskIQ planifiée toutes les minutes par le
scheduler (`taskiq scheduler vetolib.worker:scheduler`, via le label
`schedule=` lu par LabelScheduleSource). C'est du POLLING : simple et robuste,
au prix d'une latence moyenne de ~30 s (d'où le TODO LISTEN/NOTIFY).
"""

from datetime import UTC, datetime
from typing import Annotated

import structlog
from fastapi import Request
from sqlalchemy import select
from taskiq import TaskiqDepends

from vetolib.shared.infrastructure.outbox.model import OutboxEventModel
from vetolib.shared.infrastructure.outbox.registry import OUTBOX_HANDLERS
from vetolib.shared.infrastructure.taskiq.broker import broker

logger = structlog.get_logger(__name__)

# Nombre max d'événements relayés par exécution : borne le travail d'un tick
# et la durée pendant laquelle les lignes restent verrouillées (FOR UPDATE).
BATCH_SIZE = 50


# `TaskiqDepends()` + taskiq_fastapi (voir taskiq/broker.py) : la tâche reçoit
# un objet Request FastAPI factice donnant accès à `app.state`, donc au
# sessionmaker construit au démarrage de l'app — même DI que les routes HTTP.
@broker.task(task_name="outbox.relay", schedule=[{"cron": "* * * * *"}])
async def relay_outbox(request: Annotated[Request, TaskiqDepends()]) -> int:
    """Relais Outbox : publie les événements non traités vers leurs handlers TaskIQ.

    `FOR UPDATE SKIP LOCKED` : plusieurs relais peuvent tourner sans se marcher
    dessus. Sémantique at-least-once — les handlers doivent être idempotents.
    Un événement sans handler est loggé puis marqué traité (pas de boucle infinie).

    Détail du at-least-once : le handler est appelé PENDANT la transaction, mais
    le marquage `processed_at` n'est durable qu'au commit final. Si le process
    meurt entre les deux, l'événement sera relu et le handler rappelé au tick
    suivant — d'où l'exigence d'idempotence. C'est le compromis assumé : on
    préfère un doublon possible à une perte certaine.

    `SKIP LOCKED` en pratique : chaque instance de relais saute les lignes déjà
    verrouillées par une autre au lieu d'attendre — deux workers se partagent
    la file sans blocage ni double traitement simultané.

    TODO: LISTEN/NOTIFY pour réduire la latence, backoff + dead-letter,
    purge périodique des événements traités.
    """
    # Session "système" hors UoW tenant : la table outbox n'est pas soumise à
    # la RLS et le relais travaille pour toutes les cliniques à la fois.
    sessionmaker = request.app.state.sessionmaker
    processed = 0
    async with sessionmaker() as session:
        result = await session.execute(
            select(OutboxEventModel)
            .where(OutboxEventModel.processed_at.is_(None))  # index partiel dédié
            .order_by(OutboxEventModel.occurred_at)  # relais en ordre chronologique
            .limit(BATCH_SIZE)
            .with_for_update(skip_locked=True)
        )
        events = result.scalars().all()
        for event in events:
            handler = OUTBOX_HANDLERS.get(event.event_type)
            if handler is None:
                # Type inconnu (module de tâches pas importé ? faute de frappe ?) :
                # on loggue et on marque quand même traité, sinon l'événement
                # serait retenté a chaque tick pour toujours.
                logger.warning("outbox_handler_missing", event_type=event.event_type)
            else:
                # En général le handler fait juste un `.kiq(...)` : il pousse la
                # vraie charge de travail dans une tâche TaskIQ dédiée, le relais
                # reste donc rapide.
                await handler(event.payload)
            event.processed_at = datetime.now(UTC)
            processed += 1
        # Un seul commit pour tout le lot : rend les marquages durables et libère
        # les verrous FOR UPDATE pris par le SELECT.
        await session.commit()
    if processed:
        logger.info("outbox_relayed", count=processed)
    return processed
