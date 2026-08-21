---
sidebar_position: 8
title: "ADR-0008 — Tests d'intégration sur PostgreSQL réel"
sidebar_label: "0008 — testcontainers, jamais SQLite"
description: "Décision 0008 : testcontainers plutôt que SQLite en mémoire."
---

# ADR-0008 — Tests d'intégration sur PostgreSQL réel via testcontainers, jamais SQLite

|               |            |
| ------------- | ---------- |
| **Statut**    | Accepté    |
| **Date**      | 2026-08-20 |
| **Décideurs** | @kederiku  |

## Contexte

SQLite en mémoire est le raccourci habituel des tests d'intégration : instantané, sans
dépendance, sans conteneur. Il fonctionne tant que l'on ne teste que du CRUD.

VetoLib fait reposer sa sécurité sur des mécanismes **propres à PostgreSQL** :
Row-Level Security, `SET LOCAL ROLE`, `set_config`, index uniques partiels, contrainte
`EXCLUDE` avec `btree_gist`, colonnes `JSONB`.

Aucun n'est émulable par SQLite.

## Décision

Les tests d'intégration démarrent de **vrais conteneurs** PostgreSQL et Redis via
**testcontainers**, appliquent les migrations Alembic, puis exercent l'application FastAPI
complète : HTTP → use case → SQLAlchemy → PostgreSQL.

Les fixtures de conteneurs et de migrations sont en `scope="session"` ; l'isolation entre
tests passe par un `TRUNCATE` avant chaque test.

## Conséquences

**Positives**

- On teste ce qui tourne réellement en production, y compris les politiques RLS et les
  contraintes d'exclusion.
- Les migrations sont exercées à chaque exécution de la suite : une migration cassée se
  voit immédiatement.
- Aucune divergence de dialecte SQL entre les tests et la production.

**Coûts**

- **Docker est requis** pour `make test-integration`, et donc pour `make check-all`. La
  cible `make check` du quotidien en est délibérément exclue.
- La suite est plus lente qu'avec SQLite — atténué par les fixtures de session.
- En CI, `TESTCONTAINERS_RYUK_DISABLED=true` est nécessaire, et les images sont
  pré-téléchargées.

**Neutres**

- Les tests **unitaires**, eux, n'utilisent aucune base : des doublures en mémoire
  implémentent les mêmes ports. C'est là que va la majorité des cas.

## Alternatives écartées

| Alternative                                    | Pourquoi écartée                                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| SQLite en mémoire                              | N'émule ni RLS, ni `SET LOCAL`, ni index partiels, ni `EXCLUDE`. Donnerait une **confiance fausse au pire endroit** : les mécanismes de sécurité |
| PostgreSQL partagé, installé sur la machine    | Rend les tests dépendants d'un état extérieur et non reproductible                                                                               |
| Service PostgreSQL de GitHub Actions pour tout | Utilisé pour le job des migrations, mais ne fonctionne pas sur un poste de développement                                                         |
| Ne pas tester la RLS                           | Reviendrait à ne pas tester la propriété de sécurité la plus importante du projet                                                                |

## Où cela vit dans le code

- `backend/tests/integration/conftest.py` — fixtures, portées, `TRUNCATE`
- `backend/pyproject.toml` — `testcontainers[postgres,redis]`, `asyncio_mode = "auto"`
- `.github/workflows/ci.yml` — job `backend - tests d'integration`

## Comment on vérifie que la décision tient

`test_rls_isolation.py` **ne peut pas passer** sous SQLite : il exige un vrai rôle
PostgreSQL et de vraies politiques. Sa seule existence rend le retour en arrière
impossible sans que la suite ne devienne rouge.

Voir [Stratégie de tests](../backend/strategie-de-tests.md).
