---
sidebar_position: 4
title: "Le Makefile, point d'entrée unique"
description: "La carte complète des commandes du projet."
keywords: [make, makefile, commandes, check, coverage]
---

# Le Makefile, point d'entrée unique

Le `Makefile` racine regroupe **toutes** les commandes du projet : Docker, backend,
frontends, migrations, qualité, documentation. C'est délibéré — il n'y a pas à se
souvenir si telle opération se lance depuis `backend/`, avec `npm` ou avec `docker
compose`.

```bash
make help
```

affiche la liste auto-documentée : chaque cible porte sa description après un `##`.

Le `Makefile` racine **délègue** au `Makefile` du backend (`make -C backend ...`), qui
reste utilisable directement depuis `backend/`.

## Environnement et installation

| Cible             | Effet                                                                    |
| ----------------- | ------------------------------------------------------------------------ |
| `make env`        | Copie les deux `.env` d'exemple (`cp -n`, jamais d'écrasement)           |
| `make install`    | Toutes les dépendances : `uv sync` + `npm install` des trois projets npm |
| `make install-ci` | Versions **strictement** verrouillées : `uv sync --locked` + `npm ci`    |

## Docker

| Cible               | Effet                                                               |
| ------------------- | ------------------------------------------------------------------- |
| `make up`           | Infrastructure + API + worker + scheduler, en arrière-plan          |
| `make up-full`      | Idem, plus les deux frontends conteneurisés (profil `frontend`)     |
| `make down`         | Arrête les conteneurs, **conserve** les données                     |
| `make down-volumes` | Arrête **et supprime** les volumes : données locales perdues        |
| `make ps`           | État des conteneurs                                                 |
| `make logs`         | Suit tous les logs. `make logs s=api` pour un seul service          |
| `make restart`      | Redémarre l'API et le worker (après un changement de configuration) |

## Exécution locale, hors Docker

| Cible            | Effet                                                   |
| ---------------- | ------------------------------------------------------- |
| `make dev-api`   | FastAPI en local avec rechargement automatique, `:8000` |
| `make worker`    | Worker TaskIQ en local                                  |
| `make scheduler` | Scheduler TaskIQ en local                               |
| `make dev-b2c`   | Portail propriétaires, `:3000`                          |
| `make dev-b2b`   | Portail cliniques, `:3001`                              |
| `make docs`      | Ce site, `:3002`                                        |

Ces cibles ont besoin de `backend/.env` et d'une infrastructure démarrée
(`make up`). Voir [Configuration](configuration.md).

## Base de données

| Cible                   | Effet                                                             |
| ----------------------- | ----------------------------------------------------------------- |
| `make migrate`          | `alembic upgrade head`                                            |
| `make revision m="..."` | Crée un fichier de migration vide. Le message est **obligatoire** |
| `make check-migrations` | Un seul `head`, réversibilité, absence de dérive. Base requise    |

## Contrat d'API et client généré

| Cible               | Effet                                                                           |
| ------------------- | ------------------------------------------------------------------------------- |
| `make openapi`      | Exporte le contrat dans `backend/openapi.json` (non versionné)                  |
| `make generate-api` | Régénère le client Orval des **deux** frontends. L'API doit tourner sur `:8000` |

`make generate-api` est à relancer après **tout** changement d'endpoint. Un oubli est
détecté par la CI et bloque la demande de fusion. Voir
[Le client API généré par Orval](../frontends/client-api-orval.md).

## Qualité backend

| Cible                   | Docker ? | Effet                                                    |
| ----------------------- | -------- | -------------------------------------------------------- |
| `make lint`             | non      | `ruff check` + `ruff format --check`                     |
| `make format`           | non      | Reformate et corrige ce qui peut l'être                  |
| `make typecheck`        | non      | mypy en mode strict                                      |
| `make test-unit`        | non      | Tests unitaires                                          |
| `make test-integration` | **oui**  | Tests d'intégration sur PostgreSQL réel (testcontainers) |
| `make test`             | **oui**  | Les deux suites                                          |
| `make coverage`         | **oui**  | Couverture consolidée + seuil                            |

## Qualité frontends

| Cible                  | Effet                                                |
| ---------------------- | ---------------------------------------------------- |
| `make lint-front`      | ESLint sur les deux portails                         |
| `make build-front`     | Build de production des deux portails                |
| `make typecheck-front` | `tsc --noEmit`                                       |
| `make test-front`      | Vitest sans couverture (boucle de développement)     |
| `make coverage-front`  | Vitest avec couverture et seuils — ce que fait la CI |
| `make check-front`     | Les quatre précédentes, **dans l'ordre imposé**      |

:::warning L'ordre de `check-front` n'est pas négociable
`lint → build → typecheck → test`. `tsconfig.json` inclut `next-env.d.ts`, lequel importe
`.next/types/routes.d.ts` : ces deux fichiers sont **générés par `next build`** et non
versionnés. Sur un dépôt fraîchement cloné, lancer `typecheck-front` seul échoue sur des
types introuvables.
:::

## Documentation

| Cible              | Effet                                                       |
| ------------------ | ----------------------------------------------------------- |
| `make docs`        | Serveur de développement du site, `:3002`                   |
| `make docs-build`  | Build de production. **Échoue** sur tout lien ou ancre mort |
| `make docs-serve`  | Sert le site construit, exactement comme il sera en ligne   |
| `make docs-format` | Reformate le Markdown, le MDX et le TypeScript du site      |
| `make check-docs`  | Format, types et build — le job CI `documentation`          |

Toutes les cibles qui démarrent ou construisent le site dépendent de `make openapi` : la
référence d'API est produite au build à partir de `backend/openapi.json`.

## Les raccourcis

| Cible            | Périmètre                                                                    |
| ---------------- | ---------------------------------------------------------------------------- |
| `make check`     | Toute la qualité **sans Docker** : backend, frontends, documentation         |
| `make check-all` | `check` + tests d'intégration + contrôle des migrations                      |
| `make audit`     | Vulnérabilités connues : `pip-audit` + `npm audit` sur les trois projets npm |

`make check` est la commande à lancer avant chaque `git push`. Voir
[Contribuer : de la branche à la fusion](../contribuer/workflow-de-contribution.md).

## Comment lire le fichier

Pour qui n'a jamais écrit de `Makefile` : chaque bloc `nom-cible:` est une commande
lançable par `make nom-cible`. Les lignes en dessous commencent **obligatoirement par une
tabulation** — pas des espaces, c'est la syntaxe de `make`. Le texte après `##` sur la
ligne d'une cible est la description affichée par `make help`.

Une cible peut déclarer des **prérequis** avant les deux-points de sa recette :

```makefile
check: lint typecheck test-unit check-front check-docs
```

`make` exécute alors les prérequis d'abord. C'est ce qui garantit, par exemple, que
`make docs-build` régénère toujours le contrat OpenAPI avant de construire le site.
