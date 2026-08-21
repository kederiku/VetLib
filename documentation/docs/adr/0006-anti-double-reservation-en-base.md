---
sidebar_position: 6
title: "ADR-0006 — Anti-double-réservation délégué à PostgreSQL"
sidebar_label: "0006 — Anti-double-réservation en base"
description: "Décision 0006 : contrainte EXCLUDE et btree_gist."
---

# ADR-0006 — Anti-double-réservation délégué à PostgreSQL

|               |            |
| ------------- | ---------- |
| **Statut**    | Accepté    |
| **Date**      | 2026-08-20 |
| **Décideurs** | @kederiku  |

## Contexte

Deux propriétaires cliquent au même instant sur le même créneau. Un contrôle applicatif
« je lis les rendez-vous existants, je vérifie qu'il n'y a pas de chevauchement, j'écris »
**perd systématiquement** cette course : les deux transactions lisent avant que l'une
n'écrive.

Un verrou applicatif ou un niveau d'isolation `SERIALIZABLE` résoudrait le problème, au
prix d'une complexité et d'un coût de contention réels.

## Décision

Nous confions l'arbitrage à PostgreSQL, avec une contrainte d'exclusion :

```sql
ALTER TABLE appointments ADD CONSTRAINT ex_appointments_no_overlap
EXCLUDE USING gist (
    resource_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
)
WHERE (status IN ('pending', 'confirmed'));
```

Elle exige l'extension **`btree_gist`**, créée à la main dans la migration `0004` : un
index GiST ne sait pas indexer un UUID sans elle.

## Conséquences

**Positives**

- La course est arbitrée **en base** : l'un des deux réservataires reçoit un `409`, quel
  que soit le nombre d'instances de l'API.
- Les bornes demi-ouvertes `[début, fin)` rendent deux rendez-vous **adjacents**
  compatibles — 10 h 00-10 h 30 puis 10 h 30-11 h 00.
- Le `WHERE` produit l'effet le plus élégant du montage : **annuler un rendez-vous le
  fait sortir du périmètre de la contrainte, donc libère le créneau**, sans une ligne de
  code, sans tâche de nettoyage, sans risque d'oubli.
- Aucun verrou explicite, aucune contention hors des vrais conflits.

**Coûts**

- Une extension PostgreSQL de plus, et une contrainte écrite en SQL brut — Alembic ne
  l'autogénère pas.
- La violation remonte comme une erreur d'intégrité, qu'il faut traduire en erreur
  métier puis en `409`.
- Le calcul des créneaux disponibles doit adopter **exactement** la même sémantique de
  chevauchement, sous peine de proposer un créneau que la base refusera.

**Neutres**

- Au `downgrade`, l'extension `btree_gist` est **conservée** : elle est partagée et sans
  coût, et la supprimer casserait d'autres objets.

## Alternatives écartées

| Alternative                                       | Pourquoi écartée                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Vérification applicative avant écriture           | Perd la course : deux transactions lisent avant d'écrire                                         |
| `SELECT ... FOR UPDATE` sur la ressource          | Sérialise **toutes** les réservations d'un praticien, y compris celles qui ne se chevauchent pas |
| Isolation `SERIALIZABLE`                          | Coût global et erreurs de sérialisation à gérer partout, pour un problème local                  |
| Créneaux pré-générés avec une ligne verrouillable | Réintroduit la table de créneaux écartée par [ADR-0007](0007-creneaux-calcules-a-la-volee.md)    |

## Où cela vit dans le code

- `backend/migrations/versions/0004_scheduling_initial.py` — l'extension et la contrainte
- `scheduling/domain/appointment.py` — `cancel()`, et le commentaire sur la libération
  automatique
- `scheduling/application/availability.py` — `_overlaps()`, la même sémantique côté calcul

## Comment on vérifie que la décision tient

`backend/tests/integration/test_scheduling_flow.py` exerce la réservation concurrente sur
un PostgreSQL réel et vérifie qu'un seul rendez-vous survit. Le test de l'annulation
vérifie que le créneau redevient proposé, ce qui échouerait si le `WHERE` disparaissait
de la contrainte.

Voir [Modèle de données](../architecture/modele-de-donnees.md).
