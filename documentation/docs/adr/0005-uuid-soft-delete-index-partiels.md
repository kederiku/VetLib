---
sidebar_position: 5
title: "ADR-0005 — UUID, soft delete et index uniques partiels"
sidebar_label: "0005 — UUID, soft delete, index partiels"
description: "Décision 0005 : conventions transverses du schéma."
---

# ADR-0005 — Clés primaires UUID, soft delete généralisé et index uniques partiels

|               |            |
| ------------- | ---------- |
| **Statut**    | Accepté    |
| **Date**      | 2026-08-20 |
| **Décideurs** | @kederiku  |

## Contexte

Trois contraintes convergent.

Les identifiants **circulent dans des URL publiques** — une clinique consultable sans
compte, un rendez-vous partagé par lien. Une séquence d'entiers est énumérable : elle
révèle le volume d'activité et permet de sonder des ressources voisines.

Les données de santé animale **ne se suppriment pas** sur un clic. Il faut pouvoir
retrouver l'historique d'un animal ou d'un rendez-vous annulé.

Mais un compte supprimé doit pouvoir **libérer son email**, ce qu'une contrainte `UNIQUE`
classique interdit tant que la ligne existe.

## Décision

**PK UUID partout**, générées par la couche domaine (`uuid4` à la création de l'entité),
jamais par la base : aucune valeur par défaut sur la colonne.

**Soft delete généralisé** : `deleted_at`, jamais de `DELETE`. La règle est appliquée au
niveau des privilèges — les `GRANT` du rôle applicatif **n'incluent pas `DELETE`**.

**Index uniques partiels**, restreints aux lignes vivantes :

```sql
CREATE UNIQUE INDEX uq_users_email_active ON users (clinic_id, email)
  WHERE deleted_at IS NULL;
```

## Conséquences

**Positives**

- Les identifiants ne sont pas énumérables et ne fuitent aucun volume d'activité.
- L'`id` est connu **avant** l'`INSERT` : cela simplifie les événements de domaine, les
  réponses d'API et les liens entre agrégats.
- Un `DELETE` accidentel échoue **au niveau de la base**, pas seulement de la convention.
- Un email redevient réutilisable après suppression du compte.
- L'historique reste auditable.

**Coûts**

- **Toute lecture doit filtrer `deleted_at IS NULL`.** C'est la responsabilité des
  repositories, et l'oubli le plus probable de ce modèle.
- Les tables grossissent sans jamais rétrécir : une purge périodique devra être conçue,
  avec ses implications réglementaires.
- Un UUID pèse 16 octets contre 4 ou 8 pour un entier, et sa distribution aléatoire
  fragmente davantage les index.

**Neutres**

- `created_at` est fourni par le domaine via le port `Clock` ; le `server_default` n'est
  qu'un filet pour un `INSERT` hors ORM.

## Alternatives écartées

| Alternative                         | Pourquoi écartée                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| Entiers auto-incrémentés            | Énumérables dans des URL publiques                                               |
| UUIDv7 (ordonnés dans le temps)     | Meilleure localité d'index, mais réintroduit une part d'énumérabilité temporelle |
| `DELETE` physique + table d'archive | Deux schémas à maintenir, et une fenêtre où la donnée n'est nulle part           |
| `UNIQUE` classique sur l'email      | Condamnerait l'adresse à jamais après une suppression                            |

## Où cela vit dans le code

- `shared/infrastructure/db/base.py` — les quatre mixins et la convention de nommage
- `backend/migrations/versions/0001` à `0003` — les index partiels
- `docker/postgres-init/02-app-role.sh` et chaque migration — les `GRANT` sans `DELETE`

## Comment on vérifie que la décision tient

L'absence de `GRANT DELETE` est le contrôle le plus solide : **une tentative de
suppression physique échoue sous le rôle applicatif**, quel que soit le code. Les tests
d'intégration exercent en outre le cycle « créer, supprimer, recréer avec le même
email », qui échouerait avec un `UNIQUE` classique.

Voir [Modèle de données](../architecture/modele-de-donnees.md).
