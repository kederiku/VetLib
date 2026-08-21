---
sidebar_position: 3
title: "Configuration et variables d'environnement"
description: "Les deux fichiers .env, toutes les variables, et les garde-fous de production."
keywords: [env, pydantic settings, configuration, jwt, cors, prod]
---

# Configuration et variables d'environnement

## Pourquoi **deux** fichiers `.env`

C'est le piège le plus coûteux du projet, et il tient à une différence de point de vue
sur le réseau.

| Fichier         | Lu par                                                                     | Noms d'hôtes                 |
| --------------- | -------------------------------------------------------------------------- | ---------------------------- |
| `.env` (racine) | **Uniquement** l'interpolation de `docker-compose.yml`                     | `postgres`, `redis`, `minio` |
| `backend/.env`  | Le backend lancé **hors** Docker (`make dev-api`, Alembic, tâches locales) | `localhost`                  |

Dans le réseau Docker, `postgres` est un nom résolvable. Depuis votre poste, il ne veut
rien dire — il faut `localhost`. Les deux fichiers décrivent donc la **même**
infrastructure, vue de deux endroits différents.

`make env` copie les deux exemples d'un coup, avec `cp -n` (jamais d'écrasement).

:::danger Le symptôme
Un backend lancé avec `make dev-api` qui échoue sur un `getaddrinfo failed` pour l'hôte
`postgres` signifie presque toujours que `backend/.env` est absent : le processus est
alors tombé sur le `.env` racine, ou sur les valeurs par défaut.
:::

## Comment la configuration est lue

Tout passe par `backend/src/vetolib/config.py`. **Aucune autre couche ne lit
`os.environ`** : la configuration est typée, validée au démarrage, et facile à
substituer en test.

L'ordre de priorité est celui de pydantic-settings :

1. les variables d'environnement du processus (ce que `docker compose` injecte) ;
2. le fichier `.env` du répertoire courant — donc `backend/.env` en pratique ;
3. les valeurs par défaut déclarées dans la classe `Settings`, qui sont des valeurs de
   **développement uniquement**.

`get_settings()` est décoré par `@lru_cache` : l'environnement n'est lu qu'une fois par
processus. Les tests peuvent forcer une relecture avec `get_settings.cache_clear()`.

## Toutes les variables

### Base de données

| Variable               | Valeur de dev                                                  | Rôle                                                                                                                |
| ---------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`         | `postgresql+asyncpg://postgres:postgres@postgres:5432/vetolib` | Pool applicatif. Se connecte en rôle **propriétaire** ; les transactions tenant basculent ensuite sur `APP_DB_ROLE` |
| `ALEMBIC_DATABASE_URL` | identique                                                      | Réservée aux migrations : créer des rôles et poser la RLS exigent des privilèges que l'application n'a pas          |
| `APP_DB_ROLE`          | `vetolib_app`                                                  | Rôle non-superuser `NOBYPASSRLS` endossé par `tenant_uow()`                                                         |

`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `APP_DB_USER` et `APP_DB_PASSWORD`
n'existent que dans le `.env` racine : ils configurent l'**image** PostgreSQL et ses
scripts d'initialisation, pas le backend.

### Redis et stockage objet

| Variable              | Valeur de dev          | Rôle                                                      |
| --------------------- | ---------------------- | --------------------------------------------------------- |
| `REDIS_URL`           | `redis://redis:6379/0` | Courtier TaskIQ (Redis Streams) et stockage des résultats |
| `S3_ENDPOINT_URL`     | `http://minio:9000`    | Point d'entrée S3                                         |
| `S3_BUCKET_DOCUMENTS` | `vetolib-documents`    | Bucket des documents                                      |

### Authentification

| Variable                      | Valeur de dev                          | Rôle                                                                                     |
| ----------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------- |
| `JWT_SECRET`                  | `dev-only-secret-change-me-0123456789` | Secret HS256. **Refusé en production**                                                   |
| `JWT_ISSUER` / `JWT_AUDIENCE` | `vetolib`                              | Claims `iss` et `aud`, vérifiés au décodage                                              |
| `JWT_ACCESS_TTL_SECONDS`      | `900` (15 min)                         | Durée du cookie d'accès                                                                  |
| `JWT_REFRESH_TTL_SECONDS`     | `604800` (7 j)                         | Durée du cookie de rafraîchissement                                                      |
| `COOKIE_SECURE`               | `false` en dev                         | `true` en production : cookies réservés au HTTPS                                         |
| `CORS_ORIGINS`                | les deux portails                      | Liste **exacte**, sans joker : l'authentification par cookies impose `allow_credentials` |

Voir [Authentification](../architecture/authentification.md) pour ce que ces durées
impliquent.

### Divers

| Variable              | Valeur de dev           | Rôle                                                                                                                                  |
| --------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `ENV`                 | `dev`                   | `dev`, `test` ou `prod`. `prod` déclenche les garde-fous ci-dessous                                                                   |
| `LOG_JSON`            | `false`                 | `false` : rendu console lisible. `true` : JSON structuré                                                                              |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Lu par les **frontends**. Le préfixe `NEXT_PUBLIC_` est ce qui autorise Next.js à l'exposer au navigateur (elle est inlinée au build) |

## Les garde-fous de production

`ENV=prod` déclenche un validateur qui **refuse de démarrer** dans deux cas :

```python
if secret == _DEV_JWT_SECRET or len(secret.encode()) < 32:
    raise ValueError(
        "ENV=prod : JWT_SECRET doit être défini, différent du défaut de dev "
        "et faire au moins 32 octets."
    )
if _DEV_PG_CREDENTIALS in self.database_url or _DEV_PG_CREDENTIALS in (
    self.alembic_database_url
):
    raise ValueError("ENV=prod : identifiants PostgreSQL par défaut interdits.")
```

Le raisonnement est explicite dans la docstring : **mieux vaut un crash immédiat qu'une
production qui tourne silencieusement avec un secret connu de tous**. La borne de
32 octets vient de la RFC 7518 pour HS256.

## Ce que la configuration ne fait jamais

- **Aucun `os.environ` hors de `config.py`.** Chercher `os.environ` dans `src/` doit ne
  rien remonter d'autre.
- **Aucun secret dans le code.** Le seul secret littéral du dépôt est le défaut de
  développement, et il est justement ce que le validateur interdit en production.
- **Aucun secret dans ce site.** Le dépôt est public, donc ce site l'est aussi : les
  valeurs listées ici sont celles des fichiers `.env.example`, c'est-à-dire des valeurs
  de développement destinées à être remplacées.
