"""Points d'entrée TaskIQ.

- Worker    : `taskiq worker vetolib.worker:broker`
- Scheduler : `taskiq scheduler vetolib.worker:scheduler` (labels `schedule=` des tâches)

Pourquoi un worker séparé ? Les effets de bord asynchrones (relais de
l'outbox, emails...) sortent du cycle requête/réponse HTTP : l'API écrit un
événement dans outbox_events dans la même transaction que le changement
métier (atomicité garantie), puis le worker exécute la tâche via Redis
Streams (ack + relivraison : rien n'est perdu si un worker tombe). Le
scheduler, lui, pousse au broker les tâches planifiées par leur label
(ex. le cron chaque minute du relais outbox).
"""

from taskiq import TaskiqScheduler
from taskiq.schedule_sources import LabelScheduleSource

# L'import des modules de tâches les enregistre auprès du broker
# (et enregistre les handlers outbox de chaque contexte).
import vetolib.identity.infrastructure.tasks
import vetolib.shared.infrastructure.outbox.relay  # noqa: F401
from vetolib.shared.infrastructure.taskiq.broker import broker

# LabelScheduleSource : le planning est déclaré au plus près de chaque tâche
# (label `schedule=` du décorateur @broker.task), pas dans un fichier central.
scheduler = TaskiqScheduler(broker, sources=[LabelScheduleSource(broker)])

__all__ = ["broker", "scheduler"]
