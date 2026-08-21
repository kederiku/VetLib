---
sidebar_position: 3
title: "Les quatre bounded contexts"
description: "identity, patients, scheduling, billing : frontières, contenu et communication."
keywords: [bounded context, ddd, identity, patients, scheduling, billing]
---

# Les quatre bounded contexts

## Ce qu'est un bounded context

Un _bounded context_ est une frontière à l'intérieur de laquelle un mot a **un seul
sens**. C'est la notion la plus utile du Domain-Driven Design, et la plus facile à
illustrer ici : « propriétaire » désigne, dans `identity`, un compte avec un email et un
mot de passe ; dans `scheduling`, il désigne la personne à qui appartient un rendez-vous.
Ce sont deux préoccupations différentes, elles vivent donc dans deux contextes
différents et communiquent par identifiant, jamais par objet partagé.

Chaque contexte a ses quatre couches (voir
[Architecture hexagonale](architecture-hexagonale.md)) et **n'importe jamais le domaine
d'un autre contexte**.

## `identity` — comptes, cliniques, authentification

Le contexte le plus complet. Il détient trois tables : `clinics`, `users` (le personnel)
et `owners` (les propriétaires d'animaux).

- **Domaine** : `Clinic`, `User`, `Owner`, et les value objects `Email`,
  `HashedPassword`, `Role`, `Address`, `Timezone`.
- **Application** : douze use cases — connexion, rafraîchissement, déconnexion,
  enregistrement d'une clinique, mise à jour du profil…
- **Infrastructure** : hachage Argon2 via pwdlib, émission et vérification des JWT via
  PyJWT, repositories SQLAlchemy.
- **Présentation** : cinq routeurs — `auth`, `clinics`, `owner_auth`, `owner_profile`,
  `public_clinics`.

C'est ici que vit le cloisonnement des deux espaces d'authentification, décrit dans
[Authentification](authentification.md).

## `patients` — les animaux

Le contexte le plus petit, et donc le meilleur point d'entrée pour lire du code : une
seule table (`pets`), quatre use cases (créer, lister les miens, modifier, supprimer).

Particularité : **`pets` ne porte pas de `clinic_id` et n'a pas de politique RLS**. Un
animal appartient à un _propriétaire_, pas à une clinique — Rex reste le même chien chez
tous les vétérinaires que son maître consulte. Le filtrage se fait donc par `owner_id`,
au niveau applicatif, verrouillé par l'interface du port `PetRepository`. Voir
[Isolation multi-tenant et RLS](multi-tenant-et-rls.md).

## `scheduling` — agenda, créneaux, rendez-vous

Le contexte le plus riche en règles métier.

- **Domaine** : `Resource` (un praticien ou une salle), `WeeklySchedule` (les horaires
  récurrents), `ScheduleException` (congés, blocages ponctuels), `AppointmentType`
  (motif et durée), `Appointment` et sa machine à états.
- **Application** : `availability.py`, une **fonction pure** qui calcule les créneaux
  disponibles sans la moindre entrée-sortie. Voir
  [Calcul des créneaux](../metier/calcul-des-creneaux.md).
- **Présentation** : cinq routeurs, dont `public` (consultable sans compte, pour la prise
  de rendez-vous en ligne) et `owner` (les rendez-vous d'un propriétaire connecté).

Toutes les tables de ce contexte sont **tenantées** : elles portent `clinic_id` et sont
protégées par une politique RLS.

## `billing` — un squelette assumé

Le dossier existe, avec ses quatre couches, mais ne contient que des `__init__.py`. Ce
n'est pas un oubli : c'est une place réservée, qui indique où poser la facturation quand
elle arrivera, et qui garantit que la structure du monorepo ne changera pas à ce
moment-là.

:::note Ce que la documentation ne couvre pas encore
Tant que `billing` est vide, aucune page de ce site ne décrit la facturation. Les pages
seront ajoutées avec le code, pas avant : documenter une intention plutôt qu'un
comportement produirait une documentation fausse dès le premier écart.
:::

## `shared` — le transverse

`shared` n'est pas un contexte métier mais le socle commun, avec la même découpe en
couches :

| Couche            | Contenu                                                                           |
| ----------------- | --------------------------------------------------------------------------------- |
| `domain/`         | `Entity`, les familles d'erreurs (`DomainError`, `ConflictError`…), `DomainEvent` |
| `application/`    | Les ports `UnitOfWork` et `Clock`                                                 |
| `infrastructure/` | `Base` SQLAlchemy et ses mixins, moteur et UoW, outbox, broker TaskIQ             |
| `presentation/`   | Gestionnaires d'erreurs, middleware de corrélation, `/healthz`                    |

## Comment les contextes communiquent

**Règle : jamais d'import croisé entre domaines.** Deux mécanismes seulement.

### Par identifiant

Un `Appointment` porte un `owner_id` et un `pet_id`, pas un objet `Owner` ni un objet
`Pet`. Le contexte `scheduling` n'a donc aucune raison d'importer le domaine de
`identity` ou de `patients`.

### Par événement, via l'outbox

Quand un contexte doit provoquer un effet ailleurs, il émet un **événement de domaine**
que le relais publie ensuite. L'inversion de dépendance est faite dans
`shared/infrastructure/outbox/registry.py` : `shared` expose un point d'accroche, et ce
sont les contextes qui viennent s'y enregistrer.

```python
# vetolib/shared/infrastructure/outbox/registry.py
OUTBOX_HANDLERS: dict[str, OutboxHandler] = {}


def register_outbox_handler(event_type: str, handler: OutboxHandler) -> None:
    OUTBOX_HANDLERS[event_type] = handler
```

`shared` ne connaît donc aucun contexte ; c'est `identity/infrastructure/tasks.py` qui
enregistre `"identity.clinic_registered"`. Détail complet dans
[Événements de domaine et pattern Outbox](evenements-et-outbox.md).

### Le seul point de fusion : les erreurs

`main.py` fusionne les tables « erreur métier → statut HTTP » de chaque contexte en un
seul dictionnaire :

```python
register_error_handlers(
    app,
    {**IDENTITY_ERROR_STATUS, **PATIENTS_ERROR_STATUS, **SCHEDULING_ERROR_STATUS},
)
```

Aucune collision n'est possible : les clés sont des **classes** d'exception, distinctes
par contexte.
