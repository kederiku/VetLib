"""Points d'entrée TaskIQ.

- Worker    : `taskiq worker vetolib.worker:broker`
- Scheduler : `taskiq scheduler vetolib.worker:scheduler` (labels `schedule=` des tâches)
"""

from taskiq import TaskiqScheduler
from taskiq.schedule_sources import LabelScheduleSource

# L'import des modules de tâches les enregistre auprès du broker
# (et enregistre les handlers outbox de chaque contexte).
import vetolib.identity.infrastructure.tasks
import vetolib.shared.infrastructure.outbox.relay  # noqa: F401
from vetolib.shared.infrastructure.taskiq.broker import broker

scheduler = TaskiqScheduler(broker, sources=[LabelScheduleSource(broker)])

__all__ = ["broker", "scheduler"]
