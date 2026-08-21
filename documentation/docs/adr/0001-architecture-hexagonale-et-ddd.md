---
sidebar_position: 1
title: "ADR-0001 — Architecture hexagonale et DDD"
sidebar_label: "0001 — Architecture hexagonale et DDD"
description: "Décision 0001 : ports et adapters, organisation par bounded context."
---

# ADR-0001 — Architecture hexagonale et DDD, organisation « contexte d'abord »

|               |            |
| ------------- | ---------- |
| **Statut**    | Accepté    |
| **Date**      | 2026-08-20 |
| **Décideurs** | @kederiku  |

## Contexte

VetoLib est dense en règles métier : quels créneaux sont réservables, qui peut annuler et
jusqu'à quand, quelles transitions d'état sont permises, quel rôle voit quelles données.
Ces règles sont ce que le projet a de plus précieux et de plus durable.

Le framework HTTP, l'ORM, le courtier de messages, eux, sont interchangeables — et le
seront probablement. Sans frontière explicite, la logique métier se dilue dans les
routeurs et les modèles ORM, et devient impossible à tester sans démarrer toute
l'infrastructure.

## Décision

Nous organisons chaque bounded context en **quatre couches** — `domain`, `application`,
`infrastructure`, `presentation` — avec un sens de dépendance strict : rien ne sort de
`domain`.

Le découpage de **premier niveau** est métier, pas technique :
`backend/src/vetolib/<contexte>/{domain,application,infrastructure,presentation}` et non
`domain/<contexte>/`.

`domain/` n'importe **aucun framework** : ni FastAPI, ni SQLAlchemy, ni Pydantic. Les
entités sont des `dataclass`, les objets-valeurs sont `frozen=True` et se valident à la
construction. Les capacités externes passent par des **ports** déclarés par la couche qui
en a besoin et implémentés en `infrastructure/`.

## Conséquences

**Positives**

- Le métier se teste **sans base ni serveur**, en millisecondes.
- Une entité invalide ne peut pas exister : la validation a lieu une fois, à la frontière.
- Remplacer PyJWT, pwdlib ou TaskIQ ne touche aucune ligne de logique métier.
- La frontière d'un contexte est visible dans l'arborescence.

**Coûts**

- Plus de fichiers pour un même comportement : entité, port, use case, DTO, mapper,
  repository, schéma, routeur.
- Une indirection à comprendre avant de contribuer — d'où
  [Ajouter un endpoint, de A à Z](../backend/ajouter-un-endpoint.md).
- Des mappings entité ↔ DTO ↔ schéma à maintenir.

**Neutres**

- L'injection de dépendances de FastAPI sert de _composition root_, sans conteneur DI
  tiers.

## Alternatives écartées

| Alternative                               | Pourquoi écartée                                                                          |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| Découpage par couche technique en premier | La frontière du contexte disparaît ; un changement métier touche quatre dossiers éloignés |
| Modèles ORM comme entités de domaine      | Le métier devient indissociable de SQLAlchemy et ne se teste plus sans base               |
| Architecture en couches classique         | N'inverse pas les dépendances : le métier finit par dépendre de l'infrastructure          |

## Où cela vit dans le code

- `backend/src/vetolib/<contexte>/{domain,application,infrastructure,presentation}/`
- `identity/application/ports.py` — les ports
- `identity/infrastructure/password_hasher.py`, `token_provider.py` — les adapters
- `*/presentation/dependencies.py` — le _composition root_ de chaque contexte
- `shared/domain/entity.py` — la base des entités

## Comment on vérifie que la décision tient

- **mypy strict** : un port mal implémenté ne compile pas.
- **ruff `I`** : le tri des imports rend un import de framework dans `domain/`
  immédiatement visible en revue.
- **`make test-unit`** tourne **sans Docker**. Si un fichier de `domain/` se met à
  dépendre de SQLAlchemy, la suite unitaire cesse de passer — c'est le filet le plus
  direct.

Voir [Architecture hexagonale et DDD](../architecture/architecture-hexagonale.md).
