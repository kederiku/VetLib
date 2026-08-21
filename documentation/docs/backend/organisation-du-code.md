---
sidebar_position: 1
title: "Organisation du code backend"
description: "Savoir où poser chaque nouveau fichier."
keywords: [arborescence, couches, conventions, docstring, ruff]
---

# Organisation du code backend

## L'arborescence

```text
backend/
├── Makefile                  # cibles déléguées par le Makefile racine
├── pyproject.toml            # dépendances, ruff, mypy, pytest, coverage
├── .python-version           # 3.13
├── migrations/versions/      # migrations Alembic
├── tests/{unit,integration}/
└── src/vetolib/
    ├── config.py             # Settings pydantic — SEUL lecteur de os.environ
    ├── logging.py            # configuration structlog
    ├── main.py               # composition de l'app FastAPI
    ├── worker.py             # point d'entrée TaskIQ (broker + scheduler)
    ├── identity/             # un bounded context...
    │   ├── domain/
    │   ├── application/
    │   ├── infrastructure/
    │   └── presentation/
    ├── patients/
    ├── scheduling/
    ├── billing/              # squelette : 5 __init__.py
    └── shared/
```

## Que met-on dans chaque couche

### `domain/`

Le métier pur. **Zéro import de framework** — ni `fastapi`, ni `sqlalchemy`, ni
`pydantic`.

| Fichier            | Contenu                                                        |
| ------------------ | -------------------------------------------------------------- |
| `<entité>.py`      | Les entités, en `dataclass`, avec leurs méthodes de transition |
| `value_objects.py` | Les objets-valeurs immuables et auto-validés                   |
| `errors.py`        | Les exceptions métier du contexte                              |
| `events.py`        | Les événements de domaine                                      |
| `repositories.py`  | Les **ports** repository (protocoles)                          |

### `application/`

L'orchestration. Ne connaît que `domain/`.

| Fichier      | Contenu                                                           |
| ------------ | ----------------------------------------------------------------- |
| `use_cases/` | Un fichier par cas d'usage, une classe avec une méthode `execute` |
| `dto.py`     | Les objets de transfert, `frozen=True`                            |
| `ports.py`   | Les ports non-repository : UoW, hachage, jetons, horloge          |
| `mappers.py` | Entité ↔ DTO                                                      |

### `infrastructure/`

Les adapters. C'est la seule couche qui connaît les bibliothèques externes.

| Fichier           | Contenu                                                     |
| ----------------- | ----------------------------------------------------------- |
| `models.py`       | Les modèles SQLAlchemy 2.0 (`Mapped[...]`, `mapped_column`) |
| `repositories.py` | Les implémentations concrètes des ports repository          |
| `uow.py`          | L'UoW du contexte, qui expose ses repositories              |
| `tasks.py`        | Les tâches TaskIQ et l'enregistrement des handlers d'outbox |

### `presentation/`

L'interface HTTP.

| Fichier           | Contenu                                                                    |
| ----------------- | -------------------------------------------------------------------------- |
| `router.py`       | Agrège les sous-routeurs et expose `<CONTEXTE>_ERROR_STATUS`               |
| `routers/`        | Un fichier par famille de routes                                           |
| `schemas.py`      | Les schémas Pydantic v2 d'entrée et de sortie                              |
| `dependencies.py` | Le _composition root_ : c'est ici que les ports rencontrent leurs adapters |

## Le contexte `shared`

Même découpe, contenu transverse : `Entity` et les familles d'erreurs, les ports
`UnitOfWork` et `Clock`, la `Base` SQLAlchemy et ses mixins, l'outbox, le courtier
TaskIQ, les gestionnaires d'erreurs, le middleware de corrélation et `/healthz`.

**`shared` ne connaît aucun contexte métier.** Quand il a besoin d'eux — le registre
d'outbox — l'inversion est explicite : `shared` expose le point d'accroche, les contextes
s'y branchent.

## `main.py` : l'assemblage

Aucune logique métier. Il branche les pièces :

- le `lifespan` ouvre les ressources de longue durée (moteur SQLAlchemy, client Redis,
  courtier TaskIQ) et les range dans `app.state` ;
- CORS, avec `allow_credentials=True` — indispensable puisque l'authentification passe
  par des cookies ;
- le middleware de `request_id` ;
- les gestionnaires d'erreurs, avec les tables des trois contextes fusionnées ;
- `/healthz` **hors** de `/api/v1`, et tous les routeurs métier **sous** `/api/v1`.

:::warning `main.py` doit rester importable sans effet de bord
Le worker TaskIQ importe `vetolib.main:app` (contrainte de `taskiq-fastapi`). Aucune
connexion ne doit donc s'ouvrir à l'import : tout se passe dans le `lifespan`. C'est
aussi ce qui rend `make openapi` instantané et sans base de données.
:::

## `worker.py` : le second point d'entrée

Le worker consomme les tâches TaskIQ, dont le relais d'outbox. Le scheduler, lui,
déclenche les tâches périodiques. C'est en important les modules `tasks.py` des contextes
que le worker peuple le registre `OUTBOX_HANDLERS`.

## Les conventions de commentaires

Le dépôt impose une discipline inhabituelle et assumée : **tout le code est commenté en
français, pour qu'un novice comprenne son fonctionnement**.

- **Docstring de module obligatoire**, expliquant le rôle du fichier _dans
  l'architecture_ — pas seulement ce qu'il fait.
- **Docstrings de classes et de fonctions.**
- Les commentaires expliquent le **pourquoi**, pas le quoi. Les meilleurs exemples du
  dépôt : `shared/infrastructure/db/uow.py`, `identity/presentation/cookies.py`,
  `shared/infrastructure/outbox/relay.py`.

Deux contraintes de forme dans les commentaires Python, imposées par ruff :

- **ponctuation ASCII** — pas de tirets cadratins ni de guillemets typographiques ; les
  lettres accentuées sont autorisées ;
- **lignes de 100 colonnes maximum**.

C'est ce corpus qui a servi de matière première à la rédaction de ce site.

## Les règles ruff actives

```toml
target-version = "py313"
line-length = 100
select = ["E", "F", "I", "N", "UP", "B", "ASYNC", "S", "T20", "RUF"]
```

| Code     | Famille                                                                            |
| -------- | ---------------------------------------------------------------------------------- |
| `E`, `F` | pycodestyle et pyflakes — les fondamentaux                                         |
| `I`      | Tri des imports — rend un import de framework dans `domain/` immédiatement visible |
| `N`      | Conventions de nommage                                                             |
| `UP`     | Modernisation de la syntaxe pour la version Python ciblée                          |
| `B`      | flake8-bugbear — les pièges classiques                                             |
| `ASYNC`  | Les erreurs propres au code asynchrone                                             |
| `S`      | bandit — les motifs à risque de sécurité                                           |
| `T20`    | Interdit les `print` oubliés                                                       |
| `RUF`    | Les règles propres à ruff                                                          |

`tests/**` déroge à `S101` (`assert`), `S105` et `S106` (secrets en dur) : ce sont
précisément les motifs normaux d'une suite de tests.

mypy tourne en **mode strict** sur `src/vetolib` et `tests`, avec le greffon Pydantic, et
exclut `migrations/`.
