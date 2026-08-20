"""Logging structuré de tout le backend, via structlog.

Deux familles de logs cohabitent : ceux de notre code (structlog) et ceux des
bibliothèques (uvicorn, sqlalchemy...) émis via le module logging stdlib. Ce
fichier branche les deux sur la même chaîne de processeurs, pour une sortie
homogène quel que soit l'émetteur :
- dev (LOG_JSON=false) : rendu console lisible et colorisé ;
- prod (LOG_JSON=true) : une ligne JSON par événement, exploitable par un
  collecteur de logs (Loki, Datadog...).
Appelé une seule fois au démarrage du processus (lifespan de main.py).
"""

import logging
import sys
from typing import Any

import orjson
import structlog


def _orjson_dumps(obj: Any, **_: Any) -> str:
    """Sérialiseur JSON rapide (orjson) ; default=str couvre UUID, datetime, etc."""
    return orjson.dumps(obj, default=str).decode()


def configure_logging(*, log_json: bool) -> None:
    """Structlog + capture des logs stdlib (uvicorn, sqlalchemy) au même format."""
    # Processeurs communs aux deux chaînes (structlog et stdlib) :
    # - merge_contextvars injecte le contexte lié à la requête en cours
    #   (request_id posé par le middleware de shared/presentation) dans
    #   chaque ligne de log, sans le passer explicitement partout ;
    # - puis nom du logger, niveau et horodatage ISO en UTC.
    shared_processors: list[structlog.typing.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
    ]
    renderer: structlog.typing.Processor
    if log_json:
        renderer = structlog.processors.JSONRenderer(serializer=_orjson_dumps)
    else:
        renderer = structlog.dev.ConsoleRenderer()

    # Côté structlog : les événements ne sont PAS rendus ici. wrap_for_formatter
    # les emballe puis les confie au handler stdlib configuré plus bas -> un
    # seul point de rendu pour tous les logs du processus.
    structlog.configure(
        processors=[*shared_processors, structlog.stdlib.ProcessorFormatter.wrap_for_formatter],
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # foreign_pre_chain : applique les processeurs communs aux logs "étrangers"
    # (stdlib pur : uvicorn, sqlalchemy...) pour qu'ils sortent exactement au
    # même format que les nôtres.
    formatter = structlog.stdlib.ProcessorFormatter(
        processors=[structlog.stdlib.ProcessorFormatter.remove_processors_meta, renderer],
        foreign_pre_chain=shared_processors,
    )
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    root = logging.getLogger()
    # On purge les handlers déjà installés (ceux d'uvicorn notamment) : tout
    # le processus doit sortir par cet unique handler stdout, sans doublons.
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.INFO)
