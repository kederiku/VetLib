# VetoLib

Plateforme SaaS B2B2C de prise de rendez-vous et de gestion pour cliniques vétérinaires : agenda et créneaux dynamiques côté professionnels (B2B), carnet de santé numérique et prise de RDV en ligne côté propriétaires d'animaux (B2C).

## Prérequis

- Docker + Docker Compose
- [uv](https://docs.astral.sh/uv/) (backend Python)
- Node 24 LTS (`.nvmrc` fourni dans chaque frontend)

## Quickstart

```bash
cp .env.example .env                              # lu par docker-compose (hostnames Docker)
cp backend/.env.example backend/.env              # lu par le backend lancé HORS Docker (localhost)
docker compose up -d          # postgres, redis, minio (+ buckets), api :8000, worker
cd backend && uv run alembic upgrade head && cd ..
cd frontend-b2c && npm install && npm run dev     # http://localhost:3000
cd frontend-b2b && npm install && npm run dev     # http://localhost:3001
```

Les frontends tournent **hors Docker** en dev (HMR Turbopack natif). Pour la démo full-stack conteneurisée : `docker compose --profile frontend up -d`.

## Ports

| Service            | Port  |
|--------------------|-------|
| API FastAPI        | 8000  |
| Portal B2C (Next)  | 3000  |
| Clinic B2B (Next)  | 3001  |
| PostgreSQL         | 5432  |
| Redis              | 6379  |
| MinIO S3 / console | 9000 / 9001 |

## Architecture

Monorepo : `/backend` (FastAPI, architecture hexagonale + DDD, 4 bounded contexts), `/frontend-b2c` et `/frontend-b2b` (Next.js App Router), `/docker` (Dockerfiles + scripts d'init), `docker-compose.yml`.

Voir [CLAUDE.md](CLAUDE.md) pour les conventions détaillées.

## Génération du client API (Orval)

Le client TypeScript (hooks TanStack Query) est généré depuis l'OpenAPI de FastAPI :

```bash
docker compose up -d api      # l'API doit être accessible sur :8000
cd frontend-b2c && npm run generate:api
cd ../frontend-b2b && npm run generate:api
```

Le dossier `src/lib/api/generated/` est **committé** (les builds CI ne dépendent pas d'un backend démarré) et ne doit **jamais être édité à la main**.

## Commandes courantes (backend)

```bash
cd backend
make install        # uv sync
make dev            # uvicorn --reload (hors Docker)
make lint           # ruff check + format --check
make typecheck      # mypy strict
make test           # pytest (unit + integration, Docker requis pour l'intégration)
make test-unit      # pytest unit seulement (sans Docker)
make migrate        # alembic upgrade head
make revision m="description"
```
