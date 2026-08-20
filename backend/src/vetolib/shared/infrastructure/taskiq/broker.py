"""Broker TaskIQ (Redis) : le canal unique de distribution des tâches asynchrones.

TaskIQ est l'équivalent async-first de Celery : on décore une coroutine avec
`@broker.task(...)`, on l'appelle avec `.kiq(...)` pour l'envoyer dans Redis,
et un process worker séparé (`taskiq worker vetolib.worker:broker`) la
consomme et l'exécute. L'API (producteur) et le worker (consommateur)
importent tous deux CE module : c'est le meme objet `broker` qui sert des
deux côtés.

Place dans l'architecture : couche infrastructure du contexte `shared` — tous
les contextes déclarent leurs tâches sur ce broker (ex. identity/
infrastructure/tasks.py), et le relais outbox s'en sert pour publier les
événements métier.
"""

import taskiq_fastapi
from taskiq_redis import RedisAsyncResultBackend, RedisStreamBroker

from vetolib.config import get_settings

_settings = get_settings()

# Stream (consumer groups) : ack + redelivery — requis pour des jobs métier
# qui ne doivent pas être perdus, contrairement à ListQueueBroker/PubSubBroker.
#
# Pour un novice : Redis propose plusieurs structures de file. Une simple liste
# (ListQueueBroker) perd le message si le worker crashe après l'avoir dépilé ;
# le pub/sub (PubSubBroker) perd tout message émis sans abonné connecté. Les
# Streams, eux, gardent le message tant qu'il n'est pas acquitté (ack) et le
# relivrent à un autre worker en cas de crash — indispensable pour ne pas
# casser la chaine de garanties du pattern Outbox (at-least-once de bout en bout).
#
# Le result backend stocke la valeur de retour des tâches dans Redis, ce qui
# permet a un appelant de faire `await task.kiq(...)` puis `wait_result()`.
broker = RedisStreamBroker(url=_settings.redis_url).with_result_backend(
    RedisAsyncResultBackend(redis_url=_settings.redis_url)
)

# Rend les Depends FastAPI (Request -> app.state) disponibles dans les tâches.
# Le worker importe l'app par ce chemin : elle doit rester importable sans side effects.
#
# Concrètement : cote worker, taskiq_fastapi importe "vetolib.main:app", rejoue
# son cycle de vie (lifespan) et fabrique pour chaque tâche un Request factice
# branché sur cette app. Une tâche peut alors déclarer
# `Annotated[Request, TaskiqDepends()]` et récupérer `app.state.sessionmaker`
# exactement comme une route HTTP — un seul mécanisme d'injection de
# dépendances pour l'API et le worker (voir outbox/relay.py).
taskiq_fastapi.init(broker, "vetolib.main:app")
