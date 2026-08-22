---
sidebar_position: 2
title: "Qualité et vérifications locales"
description: "Quoi lancer avant de pousser, et dans quel ordre."
keywords: [make check, ruff, mypy, eslint, vitest, seuils, couverture]
---

# Qualité et vérifications locales

## La commande de tous les jours

```bash
make check
```

Elle enchaîne, dans cet ordre :

| Étape         | Outil                                                              |
| ------------- | ------------------------------------------------------------------ |
| `lint`        | ruff (`check` + `format --check`)                                  |
| `typecheck`   | mypy strict                                                        |
| `test-unit`   | pytest sur `tests/unit`                                            |
| `check-front` | ESLint, build Next, `tsc`, Vitest — sur les **trois** applications |
| `check-docs`  | Prettier, `tsc`, build Docusaurus                                  |

C'est le miroir exact des contrôles de CI **qui ne demandent pas Docker**. Le README et
le gabarit de demande de fusion promettent tous deux cette équivalence : elle doit rester
vraie.

## Ce que `make check` ne couvre pas

| Contrôle                      | Commande                | Pourquoi il en est exclu                         |
| ----------------------------- | ----------------------- | ------------------------------------------------ |
| Tests d'intégration           | `make test-integration` | Démarre de vrais conteneurs                      |
| Contrôle des migrations       | `make check-migrations` | Exige une base                                   |
| Couverture backend consolidée | `make coverage`         | Enchaîne les deux suites                         |
| Audit des dépendances         | `make audit`            | Requêtes réseau, résultat variable dans le temps |

```bash
make check-all   # check + tests d'intégration + migrations
```

## L'ordre imposé côté frontends

`make check-front` enchaîne **lint → build → typecheck → test**, et cet ordre n'est pas
esthétique.

`tsconfig.json` inclut `next-env.d.ts`, lequel importe `.next/types/routes.d.ts`. Ces
deux fichiers sont **générés par `next build`** et non versionnés. Sur un dépôt
fraîchement cloné, `tsc` échoue donc sur des types introuvables tant que le build n'a pas
eu lieu.

:::caution Ne jamais lancer `make typecheck-front` seul sur un clone neuf
Vous obtiendrez une cascade d'erreurs qui n'ont rien à voir avec votre code.
:::

Le site de documentation n'a **pas** cette contrainte : son `tsconfig.json` se contente
d'étendre `@docusaurus/tsconfig`, que Docusaurus n'utilise même pas pour compiler. C'est
pourquoi `make check-docs` place `typecheck` **avant** le build — pour échouer vite et
pour pas cher.

## ruff

```toml
target-version = "py313"
line-length = 100
select = ["E", "F", "I", "N", "UP", "B", "ASYNC", "S", "T20", "RUF"]
```

Deux règles méritent d'être connues :

- **`T20`** interdit les `print` oubliés. Le projet utilise structlog ;
- **`S`** (bandit) signale les motifs à risque. `tests/**` déroge à `S101` (`assert`),
  `S105` et `S106` (secrets en dur) — les motifs normaux d'une suite de tests.

`ruff format` est le formateur : `make format` reformate et corrige ce qui peut l'être.

La version de ruff est **épinglée strictement** (`ruff==0.16.3`) : une montée de version
change le formatage, donc le résultat de `--check`. Une mise à jour est un commit dédié,
pas un effet de bord.

## mypy

Mode **strict** sur `src/vetolib` et `tests`, avec le greffon Pydantic, `migrations/`
exclu. C'est ce qui garantit qu'un port mal implémenté ne compile pas — le filet
principal de l'architecture hexagonale.

## Les commentaires pédagogiques

Le dépôt impose que **tout le code soit commenté en français, pour qu'un novice comprenne
son fonctionnement**. Ce n'est pas une politesse : c'est cette matière qui a permis de
rédiger ce site.

Concrètement, sur tout code nouveau ou modifié :

- une **docstring de module**, expliquant le rôle du fichier _dans l'architecture_ ;
- des docstrings de classes et de fonctions ;
- des commentaires qui expliquent le **pourquoi** des choix — RLS, outbox, cookies
  `HttpOnly` — pas le quoi.

Deux contraintes de forme côté Python, imposées par ruff :

- **ponctuation ASCII** dans les commentaires : pas de tirets cadratins ni de guillemets
  typographiques. Les lettres accentuées sont autorisées ;
- **lignes de 100 colonnes maximum**.

Les fichiers de workflow GitHub, eux, sont **entièrement ASCII** — commentaires et `name:`
compris.

## Les seuils de couverture

| Périmètre        | Seuil actuel                  |
| ---------------- | ----------------------------- |
| Backend          | 85 % (mesuré 87 %)            |
| `frontend-b2c`   | st 62 / br 60 / fn 58 / li 63 |
| `frontend-b2b`   | st 63 / br 59 / fn 56 / li 63 |
| `frontend-admin` | st 79 / br 68 / fn 73 / li 80 |

La méthode : **mesurer, puis poser le seuil deux points en dessous** — trois pour les
branches, dont les compteurs v8 bougent au gré de la chaîne de compilation.

:::danger Ne jamais baisser un seuil dans la demande de fusion qui l'a cassé
Un abaissement justifié fait l'objet d'un **commit dédié, daté et commenté**. Sans cette
règle, un seuil devient une formalité qu'on ajuste jusqu'à ce qu'il ne mesure plus rien.
:::

Voir [Stratégie de tests](../backend/strategie-de-tests.md).

## Vérifier les workflows

Si vous touchez à `.github/workflows/`, reproduisez les deux outils de la CI :

```bash
docker run --rm -v "$PWD:/repo" --workdir /repo rhysd/actionlint:1.7.12 -color
uvx zizmor@1.29.0 --min-severity medium .github/workflows/
```

## Récapitulatif

| Situation                                  | Commande                                          |
| ------------------------------------------ | ------------------------------------------------- |
| Avant chaque `git push`                    | `make check`                                      |
| Le backend ou le schéma a changé           | `make check-all`                                  |
| Un endpoint a changé                       | `make generate-api` puis `make check`             |
| La documentation a changé                  | `make check-docs` (déjà inclus dans `make check`) |
| Un workflow a changé                       | actionlint + zizmor, ci-dessus                    |
| Avant une montée de version de dépendances | `make audit`                                      |
