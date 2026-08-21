---
sidebar_position: 1
title: "Installation"
description: "Amener un poste vierge jusqu'à un make check vert."
keywords: [installation, prérequis, uv, node, docker, make]
---

# Installation

Cette page part d'un poste sur lequel rien n'est installé et s'arrête quand
`make check` passe au vert. Comptez une dizaine de minutes, dont l'essentiel en
téléchargement d'images Docker.

## Prérequis

| Outil                       | Version                    | Pourquoi                                     |
| --------------------------- | -------------------------- | -------------------------------------------- |
| **Docker** + Docker Compose | récente                    | PostgreSQL, Redis, MinIO, l'API et le worker |
| **uv**                      | récente                    | Gestionnaire de paquets Python du backend    |
| **Node**                    | 24 LTS, à jour             | Les deux portails et ce site                 |
| **make**                    | présent sur macOS et Linux | Point d'entrée unique des commandes          |

Le backend exige **Python 3.13** (`requires-python = ">=3.13,<3.14"`), mais vous n'avez
pas à l'installer : `uv` s'en charge, en lisant `backend/.python-version`.

La version de Node vient des fichiers `.nvmrc` — il y en a un par projet npm
(`frontend-b2c/`, `frontend-b2b/`, `documentation/`), tous à `24`. C'est la **seule source
de vérité** : le poste de développement, la CI et l'image Docker la lisent tous.

:::caution Node 24, mais une 24.x récente
Docusaurus 3.10 déclare `"engines": {"node": ">=24.14"}`. Une 24.x plus ancienne
n'empêche pas `npm install` (npm se contente d'un avertissement `EBADENGINE`) mais peut
produire des erreurs obscures au build du site. `nvm install 24` installe la dernière.
:::

## 1. Cloner et préparer les environnements

```bash
git clone git@github.com:kederiku/VetLib.git
cd VetLib
make env
```

`make env` copie **deux** fichiers d'exemple :

- `.env` à la racine — lu uniquement par l'interpolation de `docker-compose.yml`, avec
  des noms d'hôtes **Docker** (`postgres`, `redis`, `minio`) ;
- `backend/.env` — lu par le backend quand il tourne **hors** Docker, avec des URL en
  `localhost`.

C'est le piège le plus coûteux du projet, et il vaut sa propre page :
[Configuration et variables d'environnement](configuration.md).

`make env` utilise `cp -n` : il n'écrase jamais un fichier existant. On peut donc le
relancer sans risque.

## 2. Installer les dépendances

```bash
make install
```

Cette cible installe, dans l'ordre :

- les dépendances Python du backend (`uv sync`, qui crée aussi `backend/.venv`) ;
- les paquets npm de `frontend-b2c/`, `frontend-b2b/` et `documentation/`.

Il existe une variante `make install-ci` qui utilise `uv sync --locked` et `npm ci` :
elle installe **exactement** les versions verrouillées et échoue si un fichier de
verrouillage est désynchronisé de son `package.json`. C'est ce que fait la CI ; en local,
`make install` suffit.

## 3. Démarrer l'infrastructure

```bash
make up
make migrate
```

`make up` démarre PostgreSQL, Redis, MinIO (et son conteneur d'initialisation), l'API,
le worker et le scheduler. `make migrate` applique les migrations Alembic.

Le détail de ce qui vient d'être lancé est dans
[Première exécution](premiere-execution.md).

## 4. Vérifier

```bash
make check
```

C'est la commande la plus utile du dépôt : elle enchaîne exactement les contrôles de la
CI qui ne demandent pas Docker.

| Étape         | Ce qu'elle vérifie                                               |
| ------------- | ---------------------------------------------------------------- |
| `lint`        | ruff : style et bogues courants du Python                        |
| `typecheck`   | mypy en mode strict                                              |
| `test-unit`   | les tests unitaires du backend                                   |
| `check-front` | ESLint, build Next.js, `tsc` et Vitest sur les **deux** portails |
| `check-docs`  | Prettier, `tsc` et build Docusaurus de ce site                   |

Comptez plusieurs minutes au premier passage : deux builds Next.js et un build Docusaurus
partent de zéro.

Pour aller plus loin, `make check-all` ajoute ce qui exige Docker (tests d'intégration
sur un vrai PostgreSQL, contrôle des migrations). Voir
[Qualité et vérifications locales](../contribuer/qualite-et-verifications.md).

## 5. Lancer les interfaces

```bash
make dev-b2c   # portail propriétaires  -> http://localhost:3000
make dev-b2b   # portail cliniques      -> http://localhost:3001
make docs      # ce site                -> http://localhost:3002
```

Chaque commande occupe son terminal. Les frontends tournent **hors Docker** en
développement : le rechargement à chaud de Next.js y est nettement plus rapide.

## Problèmes courants

### `make check` échoue sur `tsc` alors que rien n'a changé

Sur un dépôt fraîchement cloné, `tsc` a besoin de `next-env.d.ts` et de
`.next/types/routes.d.ts`, deux fichiers **générés par `next build`** et non versionnés.
C'est pourquoi `make check-front` impose l'ordre `lint → build → typecheck → test`. Ne
lancez jamais `make typecheck-front` seul sur un clone neuf.

### Le build de la documentation se plaint de `backend/openapi.json`

Ce fichier est la sortie de `make openapi` et il est volontairement non versionné.
Toutes les cibles `docs*` le régénèrent d'elles-mêmes ; si vous lancez `npm run build`
directement dans `documentation/`, faites `make openapi` d'abord. Voir
[Rédiger cette documentation](../contribuer/rediger-la-documentation.md).

### Le port 5432 est déjà pris

Un PostgreSQL local tourne déjà. Arrêtez-le, ou changez le mappage de port du service
`postgres` dans `docker-compose.yml`.

### Repartir de zéro

```bash
make down-volumes
```

Arrête les conteneurs **et supprime les volumes** : toutes les données locales sont
perdues. C'est le moyen le plus sûr de retrouver une base propre, notamment quand les
scripts d'initialisation de PostgreSQL ont changé — ils ne sont rejoués que sur un volume
vide.
