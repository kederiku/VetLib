import taskiq_fastapi
from taskiq_redis import RedisAsyncResultBackend, RedisStreamBroker

from vetolib.config import get_settings

_settings = get_settings()

# Stream (consumer groups) : ack + redelivery — requis pour des jobs métier
# qui ne doivent pas être perdus, contrairement à ListQueueBroker/PubSubBroker.
broker = RedisStreamBroker(url=_settings.redis_url).with_result_backend(
    RedisAsyncResultBackend(redis_url=_settings.redis_url)
)

# Rend les Depends FastAPI (Request -> app.state) disponibles dans les tâches.
# Le worker importe l'app par ce chemin : elle doit rester importable sans side effects.
taskiq_fastapi.init(broker, "vetolib.main:app")
