from collections.abc import Awaitable, Callable
from typing import Any

OutboxHandler = Callable[[dict[str, Any]], Awaitable[None]]

# event_type -> handler. Chaque contexte enregistre les siens à l'import de son
# module de tâches (importé par vetolib.worker) — le shared ne dépend d'aucun contexte.
OUTBOX_HANDLERS: dict[str, OutboxHandler] = {}


def register_outbox_handler(event_type: str, handler: OutboxHandler) -> None:
    OUTBOX_HANDLERS[event_type] = handler
