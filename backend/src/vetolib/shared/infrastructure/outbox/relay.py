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

BATCH_SIZE = 50


@broker.task(task_name="outbox.relay", schedule=[{"cron": "* * * * *"}])
async def relay_outbox(request: Annotated[Request, TaskiqDepends()]) -> int:
    """Relais Outbox : publie les événements non traités vers leurs handlers TaskIQ.

    `FOR UPDATE SKIP LOCKED` : plusieurs relais peuvent tourner sans se marcher
    dessus. Sémantique at-least-once — les handlers doivent être idempotents.
    Un événement sans handler est loggé puis marqué traité (pas de boucle infinie).

    TODO: LISTEN/NOTIFY pour réduire la latence, backoff + dead-letter,
    purge périodique des événements traités.
    """
    sessionmaker = request.app.state.sessionmaker
    processed = 0
    async with sessionmaker() as session:
        result = await session.execute(
            select(OutboxEventModel)
            .where(OutboxEventModel.processed_at.is_(None))
            .order_by(OutboxEventModel.occurred_at)
            .limit(BATCH_SIZE)
            .with_for_update(skip_locked=True)
        )
        events = result.scalars().all()
        for event in events:
            handler = OUTBOX_HANDLERS.get(event.event_type)
            if handler is None:
                logger.warning("outbox_handler_missing", event_type=event.event_type)
            else:
                await handler(event.payload)
            event.processed_at = datetime.now(UTC)
            processed += 1
        await session.commit()
    if processed:
        logger.info("outbox_relayed", count=processed)
    return processed
