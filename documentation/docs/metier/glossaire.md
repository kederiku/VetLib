---
sidebar_position: 1
title: "Glossaire"
description: "Le vocabulaire métier et technique de VetoLib, en un seul endroit."
keywords: [glossaire, vocabulaire, définitions]
---

# Glossaire

## Vocabulaire métier

**Animal** (`pets`) — L'animal d'un propriétaire. Il appartient au propriétaire, **pas à
une clinique** : Rex reste le même chien chez tous les vétérinaires que son maître
consulte.

**ASV** — Auxiliaire spécialisé vétérinaire. Le rôle le moins privilégié : accueil,
secrétariat, agenda. **Pas d'accès aux données médicales.** Voir
[Rôles et permissions](roles-et-permissions.md).

**Clinique** (`clinics`) — Le _tenant_. Toutes les données de l'agenda lui appartiennent
et sont isolées des autres cliniques par la RLS.

**Client de passage** (_guest_) — Une personne sans compte, saisie par le personnel au
comptoir ou au téléphone. Un rendez-vous a soit un `owner_id`, soit un `guest_name` —
jamais ni l'un ni l'autre.

**Créneau** (_slot_) — Une période réservable, `[début, fin)`. **Jamais stocké** : calculé
à la demande. Voir [Calcul des créneaux](calcul-des-creneaux.md).

**Exception d'horaire** (`schedule_exceptions`) — Une période pendant laquelle une
ressource n'est pas disponible : congés, urgence, formation. Ce sont des **instants
absolus**, contrairement aux horaires hebdomadaires.

**Gérant** (_manager_) — Le rôle le plus privilégié. Le premier utilisateur créé avec la
clinique le reçoit automatiquement.

**Horaire hebdomadaire** (`weekly_schedules`) — Une plage récurrente pour une ressource,
par jour de semaine (0 = lundi). Les heures sont **locales** à la clinique.

**Propriétaire** (`owners`) — Le compte d'un propriétaire d'animal, côté B2C. Compte
**global** : il n'appartient à aucune clinique.

**Ressource** (`resources`) — Ce qu'on réserve : aujourd'hui un praticien, demain une
salle ou un équipement (l'énumération `ResourceKind` est prête à les accueillir).

**Type de rendez-vous** (`appointment_types`) — Un motif et sa durée : « Consultation,
30 min ». C'est lui qui détermine la longueur du créneau.

**Utilisateur** (`users`) — Un membre du **personnel** d'une clinique. À ne pas confondre
avec un propriétaire : ce sont deux tables et deux espaces d'authentification distincts,
et le même email peut exister dans les deux.

## Vocabulaire technique

**Adapter** — L'implémentation concrète d'un port, dans `infrastructure/`. Exemple :
`PyJWTTokenProvider` pour le port `TokenProvider`.

**Bounded context** — Une frontière métier dans laquelle un mot a un seul sens. Ici :
`identity`, `patients`, `scheduling`, `billing`. Voir
[Les quatre bounded contexts](../architecture/bounded-contexts.md).

**`clinic_id`** — La colonne d'isolation multi-tenant, cible des politiques RLS.

**DTO** (_data transfer object_) — Un objet figé (`frozen`) qui traverse une frontière de
couche. Distinct de l'entité de domaine et du schéma Pydantic.

**Entité** — Un objet de domaine avec une **identité** : deux entités de mêmes valeurs
mais d'`id` différents sont distinctes. Opposé du value object.

**`gate`** — Le job d'agrégation de la CI, et le **seul** check exigé par la branche
protégée. Voir [Le pipeline CI](../exploitation/pipeline-ci.md).

**`kind`** — Le claim JWT qui cloisonne les deux espaces d'authentification : `"staff"`
ou `"owner"`. Un jeton copié d'un espace à l'autre est rejeté.

**`operation_id`** — L'identifiant explicite d'une route FastAPI. Il **détermine le nom
du hook** généré par Orval : le changer renomme le hook dans les deux portails.

**Orval** — Le générateur qui transforme le contrat OpenAPI en hooks TanStack Query.

**Outbox** — Le motif qui garantit qu'un effet de bord n'est jamais publié hors de la
transaction qui l'a produit. Voir
[Événements et outbox](../architecture/evenements-et-outbox.md).

**Port** — Une interface déclarée par la couche qui en a besoin, implémentée ailleurs.
Exemples : `UnitOfWork`, `PasswordHasher`, `Clock`.

**RLS** (_Row-Level Security_) — Le mécanisme PostgreSQL qui filtre les lignes visibles
selon une politique. Le socle de l'isolation multi-tenant. Voir
[Multi-tenant et RLS](../architecture/multi-tenant-et-rls.md).

**Soft delete** — Suppression logique : on pose `deleted_at`, on ne supprime jamais
physiquement. Les `GRANT` du rôle applicatif n'incluent d'ailleurs pas `DELETE`.
À ne pas confondre avec la **suspension**, ci-dessous.

**Suspension / désactivation** — Le gel **réversible** d'un accès, porté par la colonne
`is_active` : une clinique suspendue ou un compte désactivé ne peut plus se connecter,
mais garde son adresse e-mail réservée et toutes ses données. C'est ce qui la distingue
du soft delete, qui libère l'e-mail dans les index uniques partiels et interdit donc
tout retour en arrière. Voir
[Modèle de données](../architecture/modele-de-donnees.md#suspendre-nest-pas-supprimer--la-colonne-is_active).

**Jeton d'accès / de rafraîchissement** — 15 minutes / 7 jours. Transportés en cookies
`HttpOnly`, jamais dans un corps JSON.

**Tenant** — Le locataire d'une base partagée. Ici, la clinique.

**UoW** (_Unit of Work_) — L'objet qui porte une transaction. Deux modes :
`system_uow()` (RLS non appliquée) et `tenant_uow(clinic_id)` (RLS active).

**`vetolib_app`** — Le rôle PostgreSQL applicatif, `NOBYPASSRLS` et non propriétaire des
tables. C'est **parce qu'il n'est ni l'un ni l'autre** que les politiques RLS s'appliquent
à lui.

**Value object** — Un objet de domaine **sans** identité, défini par sa valeur, immuable
et auto-validé à la construction. Exemples : `Email`, `Address`, `WeeklyTimeRange`.
