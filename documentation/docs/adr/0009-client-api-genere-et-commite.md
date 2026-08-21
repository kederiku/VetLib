---
sidebar_position: 9
title: "ADR-0009 — Client API Orval généré puis committé"
sidebar_label: "0009 — Client API généré et committé"
description: "Décision 0009 : génération Orval, dossier committé, détection de dérive en CI."
---

# ADR-0009 — Client API TypeScript généré par Orval, committé, avec `operation_id` obligatoire

|               |            |
| ------------- | ---------- |
| **Statut**    | Accepté    |
| **Date**      | 2026-08-20 |
| **Décideurs** | @kederiku  |

## Contexte

Deux portails Next.js consomment la même API FastAPI. Trois options s'offraient :

**Écrire le client à la main.** Il se désynchronise — pas immédiatement, pas
spectaculairement : un champ devenu optionnel ici, un statut ajouté là, et l'écart ne se
révèle qu'en production.

**Le générer au moment du build.** La CI dépendrait alors d'un backend démarré pour
construire un frontend, et l'image Docker d'un portail aussi.

**Le générer puis le committer.** Le risque devient la dérive : quelqu'un modifie un
endpoint et oublie de régénérer.

## Décision

Nous générons avec **Orval** puis nous **committons** le résultat, et **un job de CI
détecte la dérive**.

Chaque route FastAPI déclare un **`operation_id` explicite** : c'est lui qui donne son nom
au hook TypeScript.

Configuration : `mode: "tags-split"` (un dossier par tag, ce qui calque le découpage en
bounded contexts), `client: "react-query"`, `httpClient: "fetch"`, `clean: true`, et un
**mutator custom** `customFetch` par lequel passe chaque appel.

## Conséquences

**Positives**

- Les builds de CI et les images Docker **ne dépendent pas** d'un backend démarré.
- Un changement de contrat cassant fait échouer `tsc` — au bon moment, en local.
- Le mutator centralise en un seul point l'URL de base, les cookies, la désérialisation,
  le rafraîchissement silencieux et la normalisation des erreurs.
- `clean: true` fait disparaître du client les endpoints supprimés côté backend.
- `tags-split` rend la structure du client lisible : elle reflète celle du backend.

**Coûts**

- **Deux copies** du client, une par portail, à régénérer ensemble.
- Un oubli de `make generate-api` bloque la demande de fusion — c'est le comportement
  voulu, mais il faut le savoir.
- **Renommer un `operation_id` est un changement cassant** pour les deux portails.
- Le dossier généré doit être exclu d'ESLint, de la couverture et de CodeQL.

**Neutres**

- Prettier est appliqué après génération (`afterAllFilesWrite`), pour que le dossier
  committé reste stable et les différences lisibles en revue.

## Alternatives écartées

| Alternative                           | Pourquoi écartée                                                        |
| ------------------------------------- | ----------------------------------------------------------------------- |
| Client écrit à la main                | Se désynchronise silencieusement                                        |
| Génération au moment du build         | La CI et les images dépendraient d'un backend démarré                   |
| Générer sans committer, en pré-commit | Déplace le problème sur le poste de chaque contributeur                 |
| `operation_id` implicite              | FastAPI produit des noms illisibles et instables au moindre remaniement |

## Où cela vit dans le code

- `frontend-b2c/orval.config.ts` et `frontend-b2b/orval.config.ts`
- `frontend-*/src/lib/api/mutator.ts` — le mutator
- `Makefile` — `openapi`, `generate-api`
- `.github/workflows/ci.yml` — job `client API a jour`

## Comment on vérifie que la décision tient

Le job `api-client-drift` régénère le contrat, sert `openapi.json` avec un simple serveur
HTTP statique, relance Orval dans les deux portails, puis :

```bash
git status --porcelain -- frontend-b2c/src/lib/api/generated \
                          frontend-b2b/src/lib/api/generated
```

Une sortie non vide fait échouer le job, donc `gate`, donc la demande de fusion.

Voir [Le client API généré par Orval](../frontends/client-api-orval.md).
