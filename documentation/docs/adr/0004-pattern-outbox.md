---
sidebar_position: 4
title: "ADR-0004 — Pattern Outbox pour tous les effets de bord"
sidebar_label: "0004 — Pattern Outbox"
description: "Décision 0004 : outbox transactionnelle et relais TaskIQ."
---

# ADR-0004 — Pattern Outbox pour tous les effets de bord

|               |            |
| ------------- | ---------- |
| **Statut**    | Accepté    |
| **Date**      | 2026-08-20 |
| **Décideurs** | @kederiku  |

## Contexte

Un use case qui écrit en base **puis** publie un message manipule deux systèmes qu'aucune
transaction ne peut engager ensemble. Deux pannes symétriques :

- publier **avant** le commit, et voir le commit échouer : on annonce un fait qui n'a
  jamais eu lieu — un email de bienvenue pour une clinique jamais créée ;
- publier **après** le commit, et voir le processus mourir entre les deux : l'événement
  est perdu à jamais.

La transaction distribuée résoudrait le problème, au prix d'une complexité
disproportionnée pour ce projet.

## Décision

Nous n'écrivons **que dans PostgreSQL**. Les use cases émettent des événements de domaine
via `uow.add_event()` ; le `commit()` les insère dans la table `outbox_events` **dans la
même transaction** que les données métier.

Un relais TaskIQ, planifié toutes les minutes, lit les lignes non traitées avec
`FOR UPDATE SKIP LOCKED`, appelle le handler enregistré pour chaque `event_type`, puis
marque le lot traité.

Le registre `OUTBOX_HANDLERS` inverse la dépendance : `shared` expose le point d'accroche,
chaque contexte s'y branche à l'import de son module de tâches.

## Conséquences

**Positives**

- Il est **impossible** d'avoir une donnée sans son événement, ou l'inverse.
- Aucune transaction distribuée, aucun coordinateur.
- `FOR UPDATE SKIP LOCKED` permet à plusieurs relais de se partager la file sans blocage
  ni coordination externe.
- La table garde une trace auditable — on marque, on ne supprime pas.
- `shared` ne connaît aucun contexte métier.

**Coûts**

- **Livraison at-least-once** : les handlers **doivent** être idempotents. C'est une
  contrainte permanente, pas un détail.
- Latence moyenne d'environ 30 secondes, le relais fonctionnant par scrutin.
- Un `event_type` sans handler est loggé puis marqué traité — sinon il serait retenté
  indéfiniment. Un module de tâches non importé par le worker perd donc silencieusement
  ses effets.
- Restent à faire : `LISTEN/NOTIFY`, backoff, file de rebut, purge des événements traités.

**Neutres**

- `BATCH_SIZE = 50` borne le travail d'un tick et la durée des verrous.

## Alternatives écartées

| Alternative                                       | Pourquoi écartée                                                                              |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Publier directement vers Redis depuis le use case | Le dilemme des deux pannes reste entier                                                       |
| Transaction distribuée (XA, 2PC)                  | Complexité et fragilité disproportionnées                                                     |
| Effets de bord synchrones dans la requête HTTP    | Un envoi d'email lent ou en panne dégrade la réponse à l'utilisateur                          |
| `LISTEN/NOTIFY` dès maintenant                    | Réduit la latence mais ne garantit rien seul : il faudrait de toute façon la table de reprise |

## Où cela vit dans le code

- `shared/domain/events.py` — `DomainEvent`
- `shared/infrastructure/db/uow.py` — `commit()` et `rollback()`
- `shared/infrastructure/outbox/{model,registry,relay}.py`
- `shared/infrastructure/taskiq/broker.py`, `backend/src/vetolib/worker.py`
- `identity/infrastructure/tasks.py` — un exemple d'enregistrement

## Comment on vérifie que la décision tient

`rollback()` **purge le tampon d'événements** : un test qui annule une transaction et
vérifie l'absence de ligne d'outbox échouerait si la publication devenait directe. Le
relais renvoie le nombre d'événements traités, ce qui rend son comportement observable.

Voir [Événements de domaine et pattern Outbox](../architecture/evenements-et-outbox.md).
