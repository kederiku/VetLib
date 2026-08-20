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
    await send_welcome_email.kiq(
        clinic_id=str(payload["clinic_id"]),
        email=str(payload["manager_email"]),
        clinic_name=str(payload["clinic_name"]),
    )


register_outbox_handler("identity.clinic_registered", _handle_clinic_registered)
