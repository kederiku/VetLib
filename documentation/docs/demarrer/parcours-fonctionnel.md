---
sidebar_position: 5
title: "Tour du produit en 10 minutes"
description: "Faire vivre un rendez-vous de bout en bout via les deux portails."
keywords: [démonstration, parcours, rendez-vous, b2b, b2c]
---

# Tour du produit en 10 minutes

Ce parcours fait naître, confirmer et terminer un rendez-vous en passant par les deux
portails. Il suppose la pile démarrée (voir [Première exécution](premiere-execution.md))
et les deux frontends lancés :

```bash
make dev-b2c   # http://localhost:3000
make dev-b2b   # http://localhost:3001
```

## 1. Créer une clinique et son gérant — portail B2B

Rendez-vous sur <http://localhost:3001> et suivez l'inscription.

L'enregistrement d'une clinique crée **deux** choses en une transaction : la clinique
elle-même, et son premier utilisateur, qui reçoit automatiquement le rôle `manager` — le
plus privilégié. C'est un flux **pré-tenant** : au moment où la demande arrive, la
clinique n'existe pas encore, il n'y a donc aucun `clinic_id` sur lequel appliquer la
RLS. Il passe par la UoW système. Voir
[Isolation multi-tenant et RLS](../architecture/multi-tenant-et-rls.md).

Au passage, un événement `identity.clinic_registered` est écrit dans l'outbox. Le
scheduler déclenchera le relais dans la minute qui suit, et le handler correspondant
provoquera son effet de bord. Vous pouvez l'observer :

```bash
make logs s=worker
```

## 2. Configurer l'agenda — portail B2B, rubrique Réglages

Trois objets à créer, dans cet ordre.

**Une ressource.** Un praticien ou une salle. Une ressource peut être liée à un
utilisateur (`user_id`), ou rester anonyme (« Salle de chirurgie »).

**Des horaires hebdomadaires.** Pour chaque jour ouvré, une plage `start_time` /
`end_time`. Ce sont des heures **locales** à la clinique — le fuseau IANA de la clinique
(`Europe/Paris` par défaut) est ce qui donne leur sens. Voir
[Calcul des créneaux](../metier/calcul-des-creneaux.md).

**Un type de rendez-vous.** Un nom et une durée en minutes : « Consultation, 30 min »,
« Vaccination, 15 min ». C'est la durée du type qui détermine celle du créneau.

Vous pouvez aussi ajouter une **exception d'horaire** (congés, urgence). Contrairement
aux horaires hebdomadaires, une exception est un couple d'**instants absolus**, pas des
heures locales.

## 3. Créer un compte propriétaire et un animal — portail B2C

Sur <http://localhost:3000>, suivez l'inscription. Elle se déroule en **trois étapes** :

1. **Le compte** : prénom, nom, email, téléphone et mot de passe. C'est la seule étape
   obligatoire — à sa validation, le compte existe et la session s'ouvre.
2. **L'adresse** : facultative, passable d'un clic.
3. **Les animaux** : nom et espèce, autant que vous voulez. Facultative également.

Ce découpage a une conséquence qui mérite d'être comprise : **chaque étape écrit
immédiatement**. Abandonner après l'étape 1 laisse un compte parfaitement utilisable, que
l'on complète ensuite depuis « Mon compte » et « Mes animaux ».

Pourquoi créer le compte dès la première étape plutôt qu'à la fin ? Pour que « cette
adresse est déjà utilisée » remonte tout de suite. L'alternative — vérifier la
disponibilité de l'email avant de créer quoi que ce soit — exigerait un endpoint public
répondant « ce compte existe » à qui le demande : exactement l'oracle d'énumération que le
reste de l'authentification s'attache à éviter.

Aucun endpoint n'a été créé pour ce parcours : les trois étapes s'enchaînent sur
`POST /owner/auth/register`, `POST /owner/auth/login`, `PUT /owner/profile` et
`POST /owner/pets`. L'étape 3 ferait sinon écrire le contexte `patients` depuis un flux
qui appartient à `identity`.

:::tip Essayez un mot de passe connu
Saisissez `passwordpassword` : 16 caractères, conforme en longueur, et pourtant refusé. Il
figure dans les fuites de données publiques. Voir
[la politique de mot de passe](../architecture/authentification.md#la-politique-de-mot-de-passe).
:::

Le compte créé est **global** : il ne dépend d'aucune clinique. C'est pourquoi ni
`owners` ni `pets` ne portent de `clinic_id`, et pourquoi le même email peut exister à la
fois dans `users` et dans `owners` sans conflit — ce sont deux comptes distincts, dans
deux espaces d'authentification cloisonnés. Voir
[Authentification](../architecture/authentification.md).

## 4. Réserver un créneau

Toujours sur le portail B2C : choisissez la clinique, le motif, puis un créneau.

Les créneaux proposés ne sont pas stockés en base : ils sont **calculés à la volée** en
croisant les horaires hebdomadaires, les exceptions et les rendez-vous déjà actifs.
Trois filtres s'appliquent :

- pas de créneau commençant dans moins d'une heure ;
- pas de créneau au-delà de 60 jours ;
- des débuts alignés sur le quart d'heure.

Le rendez-vous ainsi créé naît **`pending`** : c'est une _demande_, que la clinique doit
confirmer.

:::tip Essayez la course
Ouvrez deux onglets et réservez le même créneau en même temps. L'un des deux reçoit un
`409`. Ce n'est pas un contrôle applicatif : c'est PostgreSQL qui arbitre, via une
contrainte `EXCLUDE`. Voir
[Modèle de données](../architecture/modele-de-donnees.md#lanti-double-réservation-arbitré-par-postgresql).
:::

## 5. Confirmer, puis terminer — portail B2B, rubrique Agenda

La demande apparaît dans l'agenda de la clinique. Deux actions :

- **Confirmer** : `pending → confirmed`.
- **Terminer** : `confirmed → completed`, une fois la consultation faite.

Toute autre transition lève une erreur métier traduite en `409`. Le graphe complet est
dans [Cycle de vie d'un rendez-vous](../metier/cycle-de-vie-d-un-rendez-vous.md).

Un rendez-vous pris **par le staff** (téléphone, comptoir) naît directement `confirmed` :
la clinique n'a pas à se confirmer à elle-même.

## 6. Annuler

Depuis le portail B2C, l'annulation en ligne n'est possible que **jusqu'à 24 heures**
avant le début. En deçà, il faut appeler la clinique — le staff, lui, peut toujours
annuler.

L'annulation libère le créneau **automatiquement**, sans code supplémentaire : le statut
`cancelled` sort du périmètre du `WHERE status IN ('pending', 'confirmed')` de la
contrainte d'exclusion.

## Ce qui s'est passé dans les coulisses

| Ce que vous avez vu                                         | Ce qui l'a produit                                                      |
| ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| Vous restez connecté sans jamais voir de jeton              | [Cookies HttpOnly et double jeton](../architecture/authentification.md) |
| Une clinique ne voit jamais l'agenda d'une autre            | [RLS PostgreSQL](../architecture/multi-tenant-et-rls.md)                |
| Un email part après l'inscription, sans ralentir la réponse | [Pattern Outbox](../architecture/evenements-et-outbox.md)               |
| Le second réservataire reçoit un `409` propre               | [Contrainte `EXCLUDE`](../architecture/modele-de-donnees.md)            |
| Les créneaux sont justes même au changement d'heure         | [Calcul des créneaux](../metier/calcul-des-creneaux.md)                 |
