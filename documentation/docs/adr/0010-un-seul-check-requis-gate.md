---
sidebar_position: 10
title: "ADR-0010 — Un seul check requis devant main"
sidebar_label: "0010 — Un seul check requis (gate)"
description: "Décision 0010 : un job agrégateur découple la CI des réglages du dépôt."
---

# ADR-0010 — Un seul check requis (`gate`) devant la branche protégée `main`

|               |            |
| ------------- | ---------- |
| **Statut**    | Accepté    |
| **Date**      | 2026-08-21 |
| **Décideurs** | @kederiku  |

## Contexte

`main` est protégée : toute modification passe par une demande de fusion, fusionnable
seulement si la CI est verte.

Déclarer **tous** les jobs comme checks requis dans les réglages GitHub pose deux
problèmes. D'abord, toute évolution de la CI oblige à modifier la configuration du dépôt
— une action manuelle, hors du dépôt, invisible dans l'historique Git. Ensuite, un check
requis **introuvable** (renommé, supprimé, jamais déclenché) laisse les demandes de fusion
bloquées « en attente », **sans message d'erreur explicite**. C'est une panne
particulièrement pénible à diagnostiquer.

## Décision

Un job unique nommé **`gate`** agrège tous les contrôles via ses `needs`, et il est le
**seul** check requis par le ruleset (avec les deux analyses CodeQL, qui vivent dans un
workflow séparé).

```yaml
gate:
  name: gate
  permissions: {}
  needs: [... liste exhaustive ...]
  if: always()
```

Une étape traduit ensuite les résultats en succès ou en échec :

```yaml
if: >-
  contains(needs.*.result, 'failure')
  || contains(needs.*.result, 'cancelled')
  || (github.event_name == 'pull_request' && contains(needs.*.result, 'skipped'))
```

## Conséquences

**Positives**

- Ajouter ou retirer un contrôle **ne demande aucune modification des réglages du dépôt**.
- L'évolution de la CI est entièrement versionnée.
- Un seul check à surveiller sur une demande de fusion.
- `permissions: {}` : le job ne clone rien et n'appelle aucune API.

**Coûts**

- La liste `needs` doit rester **exhaustive**. Un job oublié pourrait échouer sans que
  personne ne s'en aperçoive — c'est le seul vrai risque du montage.
- **Aucun job conditionnel ne peut y figurer** : il serait _skipped_ sur les demandes de
  fusion et ferait échouer la porte. Les jobs d'après-fusion dépendent donc de `gate` au
  lieu d'y être listés.
- Le nom `gate` devient un contrat avec un réglage extérieur au dépôt : **le renommer
  bloquerait toutes les demandes de fusion.**

**Neutres**

- CodeQL reste hors de `gate` : il exige `security-events: write`, une permission qu'on
  ne veut pas accorder au workflow qui exécute le code des demandes de fusion.

## Les deux subtilités qui justifient le code

**`if: always()` est indispensable.** Sans lui, un job en échec parmi les `needs`
annulerait `gate`, qui resterait _skipped_ — et **GitHub considère un check ignoré comme
réussi**. La demande de fusion redeviendrait fusionnable alors que la CI est rouge.

**`!cancelled()` ne conviendrait pas non plus** : une annulation du run rendrait `gate`
lui-même ignoré, donc vert.

## Alternatives écartées

| Alternative                                | Pourquoi écartée                                                                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Déclarer tous les jobs comme checks requis | Chaque évolution de CI devient une modification manuelle des réglages, hors du dépôt                                             |
| Aucun check requis                         | La protection de branche ne servirait plus à rien                                                                                |
| `gate` avec `if: success()`                | Deviendrait _skipped_ en cas d'échec, donc considéré comme réussi                                                                |
| Un filtre `paths:` sur le workflow         | Le check requis ne serait **jamais** rapporté sur les demandes qui ne touchent pas ces chemins : blocage définitif et silencieux |

## Où cela vit dans le code

- `.github/workflows/ci.yml` — le job `gate` et le cartouche d'en-tête qui explique
  l'absence de filtre `paths:`
- `README.md` — la procédure de renommage d'urgence
- `CLAUDE.md` — l'obligation d'ajouter tout nouveau job aux `needs`

## Comment on vérifie que la décision tient

Le job affiche `toJSON(needs)` avant de trancher : le résultat de chaque dépendance est
lisible dans les logs. Toute demande de fusion sert de vérification en continu — une
liste `needs` incomplète se détecterait par un `gate` vert malgré un job rouge, visible
dans la liste des checks.

Voir [Le pipeline d'intégration continue](../exploitation/pipeline-ci.md).
