---
sidebar_position: 0
title: "Bienvenue"
description: "Ce qu'est VetoLib, à qui s'adresse cette documentation et par où commencer."
keywords: [vetolib, documentation, introduction, saas, vétérinaire]
---

# Bienvenue dans la documentation VetoLib

## Ce qu'est VetoLib

VetoLib est une plateforme **SaaS B2B2C** de prise de rendez-vous et de gestion pour
cliniques vétérinaires. Deux publics, un seul backend :

- **les cliniques** (B2B) gèrent leur agenda, leurs praticiens, leurs types de
  rendez-vous et leurs créneaux ;
- **les propriétaires d'animaux** (B2C) réservent en ligne, suivent leurs rendez-vous et
  tiennent le carnet de santé de leurs animaux.

Cette double audience explique la quasi-totalité de l'architecture : deux portails
distincts, trois espaces d'authentification cloisonnés (dont celui, à part, du back-office
réservé aux exploitants), et une base de données partagée
mais compartimentée clinique par clinique.

## Ce que ce site contient

Cette documentation décrit **le logiciel**, pas son mode d'emploi commercial. Elle
s'adresse à qui doit le comprendre, le faire tourner ou le modifier.

| Vous voulez…                             | Allez à                                                                          |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| Le faire tourner sur votre poste         | [Installation](demarrer/installation.md)                                         |
| Comprendre comment il est construit      | [Vue d'ensemble du monorepo](architecture/vue-d-ensemble.md)                     |
| Y contribuer                             | [Contribuer : de la branche à la fusion](contribuer/workflow-de-contribution.md) |
| Connaître les endpoints                  | [Référence de l'API HTTP](reference/api-http.md)                                 |
| Savoir **pourquoi** tel choix a été fait | [Décisions d'architecture](adr/index.md)                                         |

## Trois parcours de lecture

### « Je veux le faire tourner »

[Installation](demarrer/installation.md) →
[Première exécution](demarrer/premiere-execution.md) →
[Tour du produit en 10 minutes](demarrer/parcours-fonctionnel.md)

Comptez une dizaine de minutes, dont l'essentiel en téléchargement d'images Docker.

### « Je veux comprendre »

[Vue d'ensemble](architecture/vue-d-ensemble.md) →
[Architecture hexagonale et DDD](architecture/architecture-hexagonale.md) →
[Une requête HTTP, de bout en bout](architecture/requete-de-bout-en-bout.md) →
[Isolation multi-tenant et RLS](architecture/multi-tenant-et-rls.md)

Ces quatre pages donnent la carte. Les autres pages d'architecture creusent un mécanisme
chacune : [authentification](architecture/authentification.md),
[outbox](architecture/evenements-et-outbox.md),
[modèle de données](architecture/modele-de-donnees.md).

### « Je veux contribuer »

[Organisation du code backend](backend/organisation-du-code.md) →
[Ajouter un endpoint, de A à Z](backend/ajouter-un-endpoint.md) →
[Qualité et vérifications locales](contribuer/qualite-et-verifications.md) →
[Contribuer](contribuer/workflow-de-contribution.md)

## Les quatre partis pris à connaître

Si vous ne lisez que quatre choses, que ce soit celles-ci.

**L'isolation multi-tenant est dans la base, pas dans le code.** Une base unique, une
colonne `clinic_id`, et des politiques PostgreSQL Row-Level Security appliquées à un rôle
`NOBYPASSRLS`. Un `WHERE` oublié n'est donc pas une fuite de données de santé. →
[Multi-tenant et RLS](architecture/multi-tenant-et-rls.md)

**Le domaine n'importe aucun framework.** Entités et objets-valeurs sont des `dataclass`
Python nues, testables sans base ni serveur. →
[Architecture hexagonale](architecture/architecture-hexagonale.md)

**Aucun effet de bord n'est publié hors de sa transaction.** Les événements s'écrivent
dans une table, dans la même transaction que les données métier ; un relais les publie
ensuite. →
[Événements et outbox](architecture/evenements-et-outbox.md)

**Aucun jeton ne transite dans un corps JSON.** Cookies `HttpOnly`, double jeton, et deux
espaces d'authentification qui se rejettent mutuellement. →
[Authentification](architecture/authentification.md)

## Ce que ce site ne contient pas

- **Le contexte `billing`.** Le dossier existe, mais ne contient que des `__init__.py`.
  Les pages arriveront avec le code, pas avant : documenter une intention plutôt qu'un
  comportement produirait une documentation fausse dès le premier écart.
- **Un guide utilisateur.** Le
  [tour du produit](demarrer/parcours-fonctionnel.md) montre les parcours, mais du point
  de vue de qui développe.
- **Des secrets ou des données réelles.** Le dépôt est public, ce site aussi.

## Les conventions de ce site

**Tout est en français**, y compris les libellés des schémas — c'est la règle du dépôt,
qui impose des commentaires pédagogiques en français dans tout le code.

**Le code cité est réel**, avec son chemin dans le dépôt. Si un extrait vous semble
étrange, ouvrez le fichier : il porte presque toujours un commentaire qui explique
pourquoi.

**Les schémas sont en Mermaid**, donc versionnés et comparables en revue. Chaque schéma
est doublé d'un paragraphe de texte : Mermaid est rendu côté navigateur, il n'est donc
lisible ni par la recherche ni par un lecteur d'écran.

Les encadrés ont un sens constant :

:::note
Une précision utile, dont on peut se passer en première lecture.
:::

:::tip
Un conseil pratique, ou quelque chose à essayer.
:::

:::warning
Un piège fréquent, ou une contrainte d'ordre à respecter.
:::

:::danger
Une règle qu'on n'enfreint pas : sécurité, isolation des données, ou un geste qui
bloquerait le projet.
:::
