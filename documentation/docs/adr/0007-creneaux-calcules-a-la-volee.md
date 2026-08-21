---
sidebar_position: 7
title: "ADR-0007 — Créneaux calculés à la volée"
sidebar_label: "0007 — Créneaux calculés à la volée"
description: "Décision 0007 : aucune table de créneaux, une fonction pure."
---

# ADR-0007 — Créneaux disponibles calculés à la volée, jamais pré-générés

|               |            |
| ------------- | ---------- |
| **Statut**    | Accepté    |
| **Date**      | 2026-08-20 |
| **Décideurs** | @kederiku  |

## Contexte

Un moteur de réservation doit proposer des créneaux libres. Deux approches existent :
matérialiser une table de créneaux, ou les calculer à la demande.

La matérialisation paraît plus simple — jusqu'au premier changement d'horaire. Il faut
alors un remplissage rétroactif, une purge des créneaux périmés, une reprise à chaque
ajout de congé, et une gestion explicite des deux changements d'heure annuels.

Les horaires d'une clinique sont par ailleurs exprimés en **heures locales**. L'instant
UTC correspondant à « 9 h » varie deux fois par an.

## Décision

Les créneaux sont calculés **à la demande** par `compute_available_slots`, une
**fonction pure** qui croise trois sources : les horaires hebdomadaires (heures locales),
les exceptions (instants absolus) et les rendez-vous actifs.

La conversion heure locale → UTC se fait **jour par jour** via `zoneinfo`, jamais avec un
décalage fixe. Trois constantes bornent la proposition : pas de créneau avant une heure,
pas au-delà de 60 jours, débuts alignés sur le quart d'heure.

## Conséquences

**Positives**

- **Aucune table à maintenir**, aucun remplissage rétroactif, aucune purge.
- Un changement d'horaire est pris en compte **immédiatement**.
- Fonction pure : elle se teste exhaustivement en millisecondes, y compris les deux cas
  limites du changement d'heure.
- La sémantique de chevauchement est **identique** à celle de la contrainte `EXCLUDE` en
  base — bornes demi-ouvertes des deux côtés.

**Coûts**

- Le calcul est refait à chaque consultation. Il est borné (une ressource, une fenêtre de
  jours, un pas de 15 minutes) mais devra être mis en cache si le trafic croît.
- Les données doivent être chargées avant l'appel : c'est le use case qui les rassemble,
  la fonction ne fait aucune entrée-sortie.
- Les cas limites du changement d'heure doivent être **explicitement** traités — ils le
  sont, et testés.

**Neutres**

- Les constantes sont des valeurs par défaut de paramètres, surchargeables par
  l'appelant, ce dont les tests profitent.

## Alternatives écartées

| Alternative                         | Pourquoi écartée                                                                        |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| Table de créneaux matérialisée      | Remplissage rétroactif à chaque changement d'horaire, purge, et gestion manuelle du DST |
| Stockage des horaires en UTC        | Un horaire « 9 h » cesserait d'être 9 h après un changement d'heure                     |
| Décalage fixe au lieu de `zoneinfo` | Faux la moitié de l'année                                                               |
| Calcul en SQL                       | Illisible, et intestable sans base — l'inverse de ce que permet une fonction pure       |

## Où cela vit dans le code

- `scheduling/application/availability.py` — la fonction et ses trois constantes
- `identity/domain/value_objects.py` — le value object `Timezone`
- `backend/migrations/versions/0003_clinics_profile_and_pets.py` — la colonne `timezone`
- `backend/tests/unit/scheduling/` — les tests, dont les cas de changement d'heure

## Comment on vérifie que la décision tient

Les tests unitaires de `tests/unit/scheduling/` couvrent le passage à l'heure d'été (la
plage écrasée ne produit aucun créneau), le passage à l'heure d'hiver (aucun doublon
après déduplication), les créneaux adjacents et les bornes de la fenêtre. Ils tournent
**sans Docker** : c'est la preuve directe que la fonction est restée pure.

Voir [Calcul des créneaux disponibles](../metier/calcul-des-creneaux.md).
