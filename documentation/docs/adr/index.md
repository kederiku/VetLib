---
sidebar_position: 0
title: "Décisions d'architecture"
description: "Pourquoi ce projet tient des ADR, et comment en ajouter un."
keywords: [adr, décisions, architecture, gouvernance]
---

# Décisions d'architecture

## Ce qu'est un ADR

Un **Architecture Decision Record** consigne une décision structurante : son contexte,
ce qui a été décidé, ce que cela coûte, et ce qui a été écarté.

L'intérêt n'est pas de justifier après coup. Il est de répondre, dans six mois ou pour la
personne suivante, à la question la plus coûteuse d'un projet : **« pourquoi est-ce
fait comme ça ? »** Sans réponse écrite, une contrainte volontaire finit par ressembler à
une maladresse, et quelqu'un la « corrige ».

## Le tableau

| N°                                               | Titre                                                             | Statut  |
| ------------------------------------------------ | ----------------------------------------------------------------- | ------- |
| [0001](0001-architecture-hexagonale-et-ddd.md)   | Architecture hexagonale et DDD, organisation « contexte d'abord » | Accepté |
| [0002](0002-multi-tenant-par-rls.md)             | Isolation multi-tenant par Row-Level Security PostgreSQL          | Accepté |
| [0003](0003-jwt-en-cookies-httponly.md)          | JWT en cookies HttpOnly et deux espaces cloisonnés                | Accepté |
| [0004](0004-pattern-outbox.md)                   | Pattern Outbox pour tous les effets de bord                       | Accepté |
| [0005](0005-uuid-soft-delete-index-partiels.md)  | UUID, soft delete et index uniques partiels                       | Accepté |
| [0006](0006-anti-double-reservation-en-base.md)  | Anti-double-réservation délégué à PostgreSQL                      | Accepté |
| [0007](0007-creneaux-calcules-a-la-volee.md)     | Créneaux calculés à la volée, jamais pré-générés                  | Accepté |
| [0008](0008-testcontainers-plutot-que-sqlite.md) | Tests d'intégration sur PostgreSQL réel, jamais SQLite            | Accepté |
| [0009](0009-client-api-genere-et-commite.md)     | Client API Orval généré puis committé                             | Accepté |
| [0010](0010-un-seul-check-requis-gate.md)        | Un seul check requis devant la branche protégée                   | Accepté |
| [0011](0011-licence-du-depot.md)                 | Licence MIT pour un dépôt public                                  | Accepté |
| [0012](0012-politique-de-mot-de-passe.md)        | Politique de mot de passe alignée NIST 800-63B                    | Accepté |

## La section qui compte

Le gabarit de ce projet ajoute une rubrique que l'on trouve rarement ailleurs :
**« Comment on vérifie que la décision tient »**.

Dans VetoLib, chaque décision est adossée à un contrôle automatique : un test
d'intégration, un job de CI, une contrainte de base. C'est ce qui empêche ces fiches
d'être décoratives — et ce qui fait qu'une décision contournée par mégarde se manifeste
par un échec, pas par une dérive silencieuse.

## Comment en ajouter un

1. Copiez `_gabarit.md` en `NNNN-titre-en-kebab-case.md` — le numéro suivant, jamais
   réutilisé.
2. Remplissez les six rubriques. La rubrique « Alternatives écartées » n'est pas
   facultative : une décision sans alternative n'en est pas une.
3. Ajoutez la ligne au tableau ci-dessus.

:::warning On ne modifie jamais un ADR accepté
On en écrit un **nouveau**, qui le remplace. Le premier passe au statut « Remplacé par
ADR-XXXX ». L'historique d'une décision a autant de valeur que la décision courante.
:::

Un ADR peut rester au statut **« Proposé »** le temps qu'une question soit tranchée :
consigner une question ouverte vaut toujours mieux que la laisser implicite.
[ADR-0011](0011-licence-du-depot.md) a vécu ainsi quelques heures avant d'être accepté.

## Le lien avec les docstrings des migrations

Les docstrings de `backend/migrations/versions/` sont déjà, de fait, des mini-ADR : elles
expliquent pourquoi `owners` n'a pas de RLS, pourquoi `btree_gist` est nécessaire,
pourquoi une contrainte a dû être renommée.

Les ADR les **généralisent**, ils ne les dupliquent pas : la docstring dit pourquoi _cette
migration_ fait ce qu'elle fait ; l'ADR dit pourquoi _le projet entier_ fonctionne ainsi.

## Décisions candidates

Deux sujets méritent un ADR mais n'en ont pas encore :

- **Monorepo sans espace de travail npm** — chaque sous-projet a son propre
  `package-lock.json`. Le raisonnement est esquissé dans
  [Vue d'ensemble du monorepo](../architecture/vue-d-ensemble.md#pourquoi-un-monorepo-sans-espace-de-travail-npm).
- **Logs structurés structlog et `request_id` de corrélation** — décrit dans
  [Une requête HTTP, de bout en bout](../architecture/requete-de-bout-en-bout.md).
