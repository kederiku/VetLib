---
sidebar_position: 2
title: "Première exécution"
description: "Démarrer la pile complète et vérifier que chaque service répond."
keywords: [docker compose, healthz, migrations, ports, minio]
---

# Première exécution

## Ce que `make up` démarre

```bash
make up
```

Sept conteneurs se lancent, dans un ordre imposé par leurs sondes de santé :

| Service      | Rôle                                                                    |
| ------------ | ----------------------------------------------------------------------- |
| `postgres`   | PostgreSQL 18 — la base, et la clé de voûte de l'isolation multi-tenant |
| `redis`      | Redis 8 — courtier de messages pour TaskIQ                              |
| `minio`      | Stockage objet compatible S3, pour les documents                        |
| `minio-init` | Conteneur **éphémère** : crée le bucket, puis se termine                |
| `api`        | FastAPI sur `:8000`                                                     |
| `worker`     | Consomme les tâches TaskIQ, dont le relais d'outbox                     |
| `scheduler`  | Déclenche les tâches périodiques, dont le relais toutes les minutes     |

Les frontends **ne démarrent pas** : ils tournent hors Docker en développement.

L'ordre n'est pas une suggestion. `api`, `worker` et `scheduler` déclarent
`depends_on: condition: service_healthy` sur PostgreSQL et Redis, et l'API attend en plus
`condition: service_completed_successfully` sur `minio-init`. Sans cela, l'API
démarrerait avant que la base n'accepte les connexions et planterait au démarrage. Le
détail est dans [La pile Docker](../exploitation/stack-docker.md).

## Appliquer les migrations

```bash
make migrate
```

Alembic se connecte avec `ALEMBIC_DATABASE_URL`, c'est-à-dire en **superuser** — et non
avec le rôle applicatif. Créer un rôle, poser une politique RLS ou installer une
extension exige des privilèges que l'application n'a délibérément pas au moment de
l'exécution. Voir [Migrations de base de données](../backend/migrations-alembic.md).

## Le tableau des ports

| Service                     | Port        |
| --------------------------- | ----------- |
| API FastAPI                 | 8000        |
| Portail B2C (propriétaires) | 3000        |
| Portail B2B (cliniques)     | 3001        |
| Documentation (ce site)     | 3002        |
| PostgreSQL                  | 5432        |
| Redis                       | 6379        |
| MinIO — API / console       | 9000 / 9001 |

## Vérifier que tout répond

### L'état des conteneurs

```bash
make ps
```

Chaque service doit apparaître `Up` et, pour ceux qui ont une sonde, `(healthy)`.
`minio-init` fait exception : il apparaît `Exited (0)`, et c'est le comportement attendu
— son travail est terminé.

### La sonde applicative

```bash
curl -s http://localhost:8000/healthz
```

```json
{ "status": "ok", "checks": { "database": "ok", "redis": "ok" } }
```

Cette route vit **hors** de `/api/v1` et **sans authentification**, délibérément : la
sonde doit rester joignable même si l'authentification ou le routage métier est cassé.
Elle teste les deux dépendances critiques avec les opérations les moins coûteuses
possibles (`SELECT 1` et `PING`), jamais une requête métier.

En cas de panne, elle répond `503` — la convention que comprennent les sondes Docker et
les orchestrateurs — tout en détaillant **quelle** dépendance est tombée dans le corps
JSON.

### La documentation interactive de l'API

FastAPI expose son Swagger UI sur <http://localhost:8000/docs>. Ce site publie de son
côté une référence Redoc à partir du même contrat : voir
[Référence de l'API HTTP](../reference/api-http.md).

### La console MinIO

<http://localhost:9001>, avec les identifiants `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`
du `.env` racine. Le bucket `vetolib-documents` doit y figurer — c'est la preuve que
`minio-init` a fait son travail.

### Les logs

```bash
make logs           # tous les services
make logs s=api     # un seul
```

## Lancer les interfaces

```bash
make dev-b2c   # http://localhost:3000
make dev-b2b   # http://localhost:3001
```

Chaque commande occupe son terminal. Pour voir ce qu'on peut faire ensuite, suivez
[Tour du produit en 10 minutes](parcours-fonctionnel.md).

## Tout arrêter

```bash
make down           # arrête les conteneurs, GARDE les données
make down-volumes   # arrête ET supprime les volumes : données perdues
```

La distinction est importante. `make down` est l'arrêt de tous les jours. `down-volumes`
est ce qu'il faut quand la base est dans un état incohérent, ou quand les scripts
d'initialisation de PostgreSQL (`docker/postgres-init/`) ont changé : **ils ne sont
rejoués que sur un volume vide**.

## Faire tourner l'API hors Docker

Utile pour attacher un débogueur ou obtenir un rechargement instantané :

```bash
make down          # ou : docker compose stop api worker scheduler
make dev-api       # uvicorn en local, avec rechargement automatique
make worker        # dans un autre terminal
make scheduler     # dans un troisième, si vous testez les tâches périodiques
```

C'est là que `backend/.env` entre en jeu : les URL y pointent vers `localhost` et non
vers les noms d'hôtes Docker. Voir [Configuration](configuration.md).
