# VetoLib

[![CI](https://github.com/kederiku/VetLib/actions/workflows/ci.yml/badge.svg)](https://github.com/kederiku/VetLib/actions/workflows/ci.yml)

**[Documentation du projet](https://kederiku.github.io/VetLib/)** — architecture, guides et référence de l'API.

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
cd frontend-admin && npm install && npm run dev   # http://localhost:3003 (back-office)
```

Les frontends tournent **hors Docker** en dev (HMR Turbopack natif). Pour la démo full-stack conteneurisée : `docker compose --profile frontend up -d`.

## Ports

| Service            | Port  |
|--------------------|-------|
| API FastAPI        | 8000  |
| Portal B2C (Next)  | 3000  |
| Clinic B2B (Next)  | 3001  |
| Back-office (Next) | 3003  |
| PostgreSQL         | 5432  |
| Redis              | 6379  |
| MinIO S3 / console | 9000 / 9001 |
| Documentation      | 3002  |

## Architecture

Monorepo : `/backend` (FastAPI, architecture hexagonale + DDD, 4 bounded contexts), `/frontend-b2c`, `/frontend-b2b` et `/frontend-admin` (Next.js App Router), `/documentation` (site Docusaurus publié sur GitHub Pages), `/docker` (Dockerfiles + scripts d'init), `docker-compose.yml`.

Voir [CLAUDE.md](CLAUDE.md) pour les conventions détaillées.

## Génération du client API (Orval)

Le client TypeScript (hooks TanStack Query) est généré depuis l'OpenAPI de FastAPI :

```bash
docker compose up -d api      # l'API doit être accessible sur :8000
cd frontend-b2c && npm run generate:api
cd ../frontend-b2b && npm run generate:api
cd ../frontend-admin && npm run generate:api
```

(ou `make generate-api`, qui enchaîne les trois.)

Le dossier `src/lib/api/generated/` est **committé** (les builds CI ne dépendent pas d'un backend démarré) et ne doit **jamais être édité à la main**.

## Documentation

Le site de documentation vit dans [`documentation/`](documentation/) (Docusaurus,
en français) et est publié automatiquement sur
**<https://kederiku.github.io/VetLib/>** après chaque merge sur `main`.

```bash
make docs          # serveur de développement, rechargement à chaud, :3002
make docs-build    # build de production (échoue sur tout lien ou ancre mort)
make docs-serve    # sert le site construit, tel qu'il sera en ligne
make check-docs    # format + types + build : exactement ce que fait la CI
```

La page de référence de l'API est générée au build à partir de
`backend/openapi.json` (plugin `redocusaurus`) : elle ne s'édite **jamais** à la
main, au même titre que le client Orval. C'est pourquoi toutes les cibles `docs*`
commencent par régénérer ce schéma.

## Commandes courantes

Toutes les commandes du projet (Docker, backend, frontends, migrations, qualité)
sont regroupées dans le [Makefile](Makefile) racine, auto-documenté :

```bash
make help
```

Quelques exemples :

```bash
make env            # copie les .env d'exemple
make up             # infra + api + worker (Docker)
make migrate        # alembic upgrade head
make dev-b2c        # frontend B2C sur :3000 (dev-b2b sur :3001, dev-admin sur :3003)
make docs           # site de documentation sur :3002
make check          # toute la qualité sans Docker (lint, mypy, tests unit, ESLint, tsc, doc)
```

Le Makefile racine délègue au [Makefile du backend](backend/Makefile) (`make -C backend ...`),
qui reste utilisable directement depuis `backend/`.

## CI/CD et contribution

`main` est une branche **protégée** : le push direct est refusé. Toute
modification passe par une branche et une Pull Request, qui ne peut être
fusionnée que si la CI est verte.

```bash
git switch -c feat/ma-fonctionnalite
make check                       # même chose qu'en CI, mais en local et sans Docker
git push -u origin feat/ma-fonctionnalite
gh pr create --fill
gh pr merge --auto --squash      # part tout seul dès que la CI passe au vert
```

### Ce que vérifie la CI

Le workflow [`ci.yml`](.github/workflows/ci.yml) lance ces contrôles en
parallèle sur chaque PR :

| Contrôle | Ce qu'il empêche |
|---|---|
| ruff + ruff format | Code Python hors conventions |
| mypy (strict) | Erreurs de typage |
| pytest `tests/unit` | Régression de la logique métier |
| pytest `tests/integration` | Régression sur PostgreSQL réel (RLS, index partiels) |
| Couverture consolidée | Chute de la couverture backend sous le seuil |
| Migrations Alembic | Deux heads, migration irréversible, ou modèle modifié sans migration |
| ESLint, build Next, `tsc`, Vitest (×3 apps) | Régression frontend |
| Couverture frontend | Chute sous le seuil de chaque app (seuils mesurés app par app) |
| Dérive du client Orval | Endpoint modifié sans `make generate-api` |
| Prettier, `tsc`, build Docusaurus | Doc mal formatée, lien ou ancre morte, site qui ne se construit plus |
| pip-audit, npm audit, revue de dépendances | Dépendance vulnérable |
| actionlint + zizmor | Workflow CI cassé ou vulnérable |
| Build des 3 images Docker | Image qui ne se construit plus |

Après un merge sur `main`, les images sont publiées sur GHCR :
`ghcr.io/kederiku/vetlib-api`, `-portal` et `-clinic`, étiquetées `latest` et
`sha-<commit>`.

Le site de documentation est publié dans la foulée sur GitHub Pages
(<https://kederiku.github.io/VetLib/>) par le job `publier la documentation`.
Comme la publication des images, il dépend du job `gate` et ne s'exécute que sur
un push vers `main` : **une CI rouge ne met jamais rien en ligne**. Il ne
reconstruit rien — il déploie l'artefact déjà produit par le job `documentation`
du même run.

L'analyse de sécurité [CodeQL](.github/workflows/codeql.yml) tourne à part
(sur PR et chaque lundi) et alimente l'onglet *Security*.

### Le job « gate »

Tous ces contrôles convergent vers un job unique nommé **`gate`**, et c'est
lui seul que GitHub exige pour autoriser la fusion. On peut donc ajouter ou
retirer des jobs sans jamais toucher aux réglages du dépôt.

> **`gate` ne doit jamais être renommé.** Un check requis introuvable laisse
> les PR bloquées « en attente », sans message d'erreur. Si un renommage est
> vraiment nécessaire : désactiver le ruleset
> (`gh api --method PUT repos/kederiku/VetLib/rulesets/<id> --input -` avec
> `{"enforcement":"disabled"}`), merger le renommage, relever le nouveau nom
> avec `gh api repos/kederiku/VetLib/commits/main/check-runs --jq
> '.check_runs[].name'`, puis réappliquer le ruleset.

### Reproduire la CI en local

```bash
make check            # tout ce qui ne demande pas Docker (le plus utile au quotidien)
make coverage-front   # couverture des 3 frontends + application des seuils
make check-all        # + tests d'intégration + contrôle des migrations
make coverage         # couverture backend consolidée
make check-docs       # format, types et build du site de documentation
make audit            # vulnérabilités des dépendances
```

## Licence

[MIT](LICENSE) — © 2026 Cédric Delagrée.

Le dépôt est public : la licence MIT autorise explicitement la lecture, la
réutilisation et la modification du code, y compris à des fins commerciales, à la
seule condition de conserver l'avis de copyright. Voir
[ADR-0011](documentation/docs/adr/0011-licence-du-depot.md) pour le raisonnement.
