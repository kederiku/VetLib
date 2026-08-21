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
- Auth : JWT double token en **cookies HttpOnly**, deux espaces INDÉPENDANTS cloisonnés par le claim `kind` (un jeton copié d'un espace à l'autre est rejeté) :
  staff B2B (`/api/v1/auth/*`, cookies `vetolib_access` 15 min path `/` + `vetolib_refresh` 7 j path `/api/v1/auth/refresh`) et
  propriétaires B2C (`/api/v1/owner/auth/*` + fiche `PUT /api/v1/owner/profile`, cookies `vetolib_owner_access`/`vetolib_owner_refresh` path `/api/v1/owner/auth/refresh`).
  Jamais de token dans un body JSON. Le même email peut exister dans `users` (staff) ET `owners` (comptes séparés).
- Routes FastAPI : toujours un `operation_id` explicite (noms des hooks Orval).
- UoW : `system_uow()` (flux pré-tenant : login, register) vs `tenant_uow(clinic_id)` (`SET LOCAL ROLE vetolib_app` + `SET LOCAL app.clinic_id`).
- SQLAlchemy : rester sur 2.0.x (< 2.1) ; TypeScript : rester sur 6.x (TS 7 casse typescript-eslint).
- Tests d'intégration : testcontainers PostgreSQL (jamais SQLite — RLS/JSONB/SET LOCAL non émulables).
- **Commentaires pédagogiques** : tout le code (backend, frontends, Docker, tests) est commenté **en français, pour qu'un novice comprenne son fonctionnement** — docstring de module (rôle du fichier dans l'architecture), docstrings de classes/fonctions, et le *pourquoi* des choix (RLS, outbox, cookies HttpOnly…). Maintenir ce niveau sur tout code nouveau ou modifié. Contrainte ruff dans les commentaires Python : ponctuation ASCII (pas de tirets cadratins ni guillemets typographiques ; lettres accentuées OK), lignes ≤ 100.
- **Frontends : utilise les composants `shadcn/ui` le plus possible et du style Tailwind.** Pas de CSS maison; les nouveaux composants s'ajoutent via la CLI shadcn dans `src/components/ui/`.

## Commandes

Le **Makefile racine** est le point d'entrée unique de toutes les commandes du projet — Claude est autorisé à utiliser librement ses cibles (`make help` pour la liste ; il délègue à `backend/Makefile`).

- `make up` : infra + api + worker (Docker). Frontends **hors Docker** en dev : `make dev-b2c` / `make dev-b2b`.
- Deux fichiers d'env distincts (`make env` copie les deux) : `.env` racine = interpolation docker-compose (hostnames Docker) ; `backend/.env` = backend lancé hors Docker (`make dev-api`, alembic, tâches locales — URLs localhost).
- `make migrate` : migrations Alembic (connectées via `ALEMBIC_DATABASE_URL`, superuser).
- `make check` : toute la qualité sans Docker (ruff, mypy, tests unit, ESLint, tsc) ; en ciblé : `make lint typecheck test-unit` (backend) ou `make lint-front typecheck-front`.
- Après tout changement d'endpoint : `make generate-api` (API démarrée sur :8000) — régénère le client Orval des **2** frontends. La CI le vérifie (job `api-client-drift`) : un oubli bloque la PR.
- **Ne jamais éditer `src/lib/api/generated/`** (sortie Orval, committée).
- `make check-front` impose l'ordre **lint → build → typecheck → test** : `tsc` a besoin de `next-env.d.ts` et `.next/types/`, générés par le build et gitignorés. Ne jamais lancer `typecheck-front` seul sur un dépôt fraîchement cloné.

## Contribution — `main` est protégée

Le push direct sur `main` est **refusé** par un ruleset GitHub. Toute
modification passe par une branche + une PR, fusionnable seulement si la CI est
verte (0 approbation requise, le projet a un seul contributeur).

```bash
git switch -c feat/ma-fonctionnalite
make check                       # à lancer AVANT de pousser
git push -u origin feat/ma-fonctionnalite
gh pr create --fill
gh pr merge --auto --squash      # fusion automatique dès que la CI passe
```

- Le seul check requis est le job **`gate`** de `.github/workflows/ci.yml`. **Ne jamais le renommer** : un check requis introuvable bloque toutes les PR sans message d'erreur (procédure de renommage dans le README).
- Ajouter un job à la CI implique de l'ajouter à la liste `needs:` de `gate`, sinon son échec passerait inaperçu.
- Déblocage d'urgence (CI cassée) : désactiver temporairement le ruleset via `gh api --method PUT repos/kederiku/VetLib/rulesets/<id>` avec `{"enforcement":"disabled"}`, puis le réactiver. Il n'y a volontairement pas de contournement silencieux.
- Reproduire la CI en local : `make check` (sans Docker), `make check-all` (avec), `make coverage`, `make audit`.
