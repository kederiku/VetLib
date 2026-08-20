"""Registre des handlers d'événements outbox : associe un `event_type` à sa réaction.

Le relais (outbox/relay.py) lit des lignes `outbox_events` génériques ; il lui
faut savoir QUOI faire pour chaque type d'événement. Ce module fournit ce
mapping sous forme d'un simple dictionnaire global, rempli par les contextes
eux-mêmes.

Pourquoi cette indirection ? Pour respecter le sens des dépendances de
l'architecture hexagonale : `shared` ne doit connaitre AUCUN contexte métier.
C'est donc chaque contexte (identity, patients, ...) qui vient s'enregistrer
ici — inversion de dépendance : shared expose le point d'accroche, les
contextes s'y branchent. Exemple concret : identity/infrastructure/tasks.py
enregistre "identity.clinic_registered" -> envoi de l'email de bienvenue.
"""

from collections.abc import Awaitable, Callable
from typing import Any

# Un handler reçoit le payload JSON de l'événement (le dict stocké en JSONB)
# et déclenche l'effet de bord — typiquement un `.kiq(...)` vers une tâche
# TaskIQ. Il doit être IDEMPOTENT : le relais garantit at-least-once, donc un
# même événement peut être rejoué (crash entre l'appel du handler et le commit
# du marquage `processed_at`).
OutboxHandler = Callable[[dict[str, Any]], Awaitable[None]]

# event_type -> handler. Chaque contexte enregistre les siens à l'import de son
# module de tâches (importé par vetolib.worker) — le shared ne dépend d'aucun contexte.
# Conséquence pratique : si un module de tâches n'est pas importé par le worker,
# ses événements resteront sans handler (le relais les loggue et les marque traités).
OUTBOX_HANDLERS: dict[str, OutboxHandler] = {}


def register_outbox_handler(event_type: str, handler: OutboxHandler) -> None:
    """Enregistre (ou remplace) le handler associé à un type d'événement.

    Appelé au niveau module dans les fichiers de tâches des contextes : le
    simple import du module suffit à peupler le registre — pas de framework
    de plugins, juste un effet d'import maitrisé par vetolib.worker.
    """
    OUTBOX_HANDLERS[event_type] = handler
