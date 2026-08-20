# VetoLib — Guide pour les sessions Claude

SaaS B2B2C de gestion de cliniques vétérinaires (type Doctolib). **Multi-tenant** par `clinic_id` avec **RLS PostgreSQL** — d'où le rôle DB applicatif non-superuser `vetolib_app` (NOBYPASSRLS) distinct du superuser réservé aux migrations.

## Architecture

Hexagonale (ports & adapters) + DDD, organisation « contexte d'abord » : `backend/src/vetolib/<contexte>/{domain,application,infrastructure,presentation}`.

Bounded contexts : `identity` (implémenté : clinics, users, auth JWT), `patients`, `scheduling`, `billing` (squelettes vides à implémenter sur le même modèle qu'`identity`).

- `domain/` : entités dataclasses pures, value objects, erreurs, événements, ports repository. **Zéro import framework.**
- `application/` : use cases, DTOs frozen, ports (UoW, PasswordHasher, TokenProvider, Clock).
- `infrastructure/` : modèles SQLAlchemy 2.0 async, repos concrets, adapters (pwdlib/Argon2, PyJWT, TaskIQ).
- `presentation/` : routeurs FastAPI, schémas Pydantic v2, dépendances DI.
- `shared/` : mêmes couches, éléments transverses (Base + mixins DB, UoW, outbox, error handlers, /healthz).

## Monorepo

```
docker-compose.yml  docker/  backend/  frontend-b2c/ (:3000)  frontend-b2b/ (:3001)
```

## Conventions

- UUID pour toutes les PK ; **soft deletes** (`deleted_at`, jamais de DELETE) ; pattern **Outbox** (`outbox_events` + relais TaskIQ) pour tout effet de bord asynchrone.
- Auth : JWT double token en **cookies HttpOnly** (`vetolib_access` 15 min path `/`, `vetolib_refresh` 7 j path `/api/v1/auth/refresh`). Jamais de token dans un body JSON.
- Routes FastAPI : toujours un `operation_id` explicite (noms des hooks Orval).
- UoW : `system_uow()` (flux pré-tenant : login, register) vs `tenant_uow(clinic_id)` (`SET LOCAL ROLE vetolib_app` + `SET LOCAL app.clinic_id`).
- SQLAlchemy : rester sur 2.0.x (< 2.1) ; TypeScript : rester sur 6.x (TS 7 casse typescript-eslint).
- Tests d'intégration : testcontainers PostgreSQL (jamais SQLite — RLS/JSONB/SET LOCAL non émulables).

## Commandes

- `docker compose up -d` : infra + api + worker. Frontends **hors Docker** en dev.
- `cd backend && uv run alembic upgrade head` : migrations (connectées via `ALEMBIC_DATABASE_URL`, superuser).
- `make -C backend lint typecheck test-unit` : qualité backend sans Docker.
- Après tout changement d'endpoint : `npm run generate:api` dans **les 2** frontends.
- **Ne jamais éditer `src/lib/api/generated/`** (sortie Orval, committée).
