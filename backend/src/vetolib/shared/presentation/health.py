"""Endpoint de santé /healthz pour Docker et les orchestrateurs.

Couche presentation du contexte partagé (shared) : cette route n'appartient
à aucun contexte métier, elle expose l'état technique de l'application.

À quoi sert /healthz ? docker-compose appelle périodiquement GET /healthz
(voir le bloc "healthcheck" du service api dans docker-compose.yml) pour
marquer le conteneur sain ou non (visible dans `docker compose ps`).
Dans ce projet, aucun service n'attend l'api : c'est elle qui attend
postgres, redis et minio via "depends_on: condition: service_healthy".
Plus tard, un orchestrateur (Kubernetes, load balancer) pourra utiliser
cette sonde pour sortir une instance du trafic ou la redémarrer.

Choix de conception :
- la route vit hors du préfixe /api/v1 et sans authentification : la sonde
  doit rester joignable même si l'auth ou le routage métier est cassé ;
- on teste les deux dépendances critiques (PostgreSQL et Redis) avec les
  opérations les moins coûteuses possibles, jamais une requête métier ;
- en cas de panne on répond 503 (la convention que comprennent les
  healthchecks), tout en renvoyant le détail par dépendance dans le corps
  JSON pour faciliter le diagnostic humain.
"""

from fastapi import APIRouter, Request, Response, status
from sqlalchemy import text

router = APIRouter(tags=["health"])


@router.get("/healthz", operation_id="healthz")
async def healthz(request: Request, response: Response) -> dict[str, object]:
    """Hors /api/v1, sans auth : sonde DB + Redis pour les healthchecks Docker.

    Répond 200 si tout va bien, 503 sinon, avec le détail par dépendance :
    {"status": "ok"|"degraded", "checks": {"database": ..., "redis": ...}}.
    """
    checks: dict[str, str] = {}
    healthy = True

    # sessionmaker et redis sont posés sur app.state au démarrage de
    # l'application (fonction lifespan dans main.py).
    try:
        # SELECT 1 : la requête la moins coûteuse qui soit, juste pour
        # prouver qu'une connexion PostgreSQL s'ouvre et répond.
        async with request.app.state.sessionmaker() as session:
            await session.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:  # catch large volontaire : une sonde ne doit jamais lever
        checks["database"] = "error"
        healthy = False

    try:
        # PING est la commande Redis standard pour vérifier la connexion.
        await request.app.state.redis.ping()
        checks["redis"] = "ok"
    except Exception:
        checks["redis"] = "error"
        healthy = False

    # 503 signale "unhealthy" a Docker/K8s ; le corps JSON, lui, dit
    # précisément quelle dépendance est en panne.
    response.status_code = status.HTTP_200_OK if healthy else status.HTTP_503_SERVICE_UNAVAILABLE
    return {"status": "ok" if healthy else "degraded", "checks": checks}
