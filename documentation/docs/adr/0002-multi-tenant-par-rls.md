---
sidebar_position: 2
title: "ADR-0002 — Isolation multi-tenant par Row-Level Security"
sidebar_label: "0002 — Isolation multi-tenant par RLS"
description: "Décision 0002 : RLS PostgreSQL et rôle applicatif NOBYPASSRLS."
---

# ADR-0002 — Isolation multi-tenant par Row-Level Security PostgreSQL

|               |            |
| ------------- | ---------- |
| **Statut**    | Accepté    |
| **Date**      | 2026-08-20 |
| **Décideurs** | @kederiku  |

## Contexte

Toutes les cliniques partagent une base unique, avec des tables portant une colonne
`clinic_id`. C'est le modèle le plus économe — une migration, un pool, une sauvegarde.

C'est aussi le plus dangereux : **un `WHERE clinic_id` oublié devient une fuite de
données de santé**. Sur des dizaines de requêtes écrites sur plusieurs années, la
probabilité d'un oubli n'est pas faible, elle est proche de 1. Une revue de code ne peut
pas garantir l'absence d'oubli ; une contrainte technique, si.

Difficulté supplémentaire : PostgreSQL **n'applique pas** la RLS aux superusers, aux
rôles `BYPASSRLS`, ni au propriétaire des tables. Une application connectée avec le rôle
qui a créé les tables verrait tout, politiques ou pas.

## Décision

Nous déplaçons la défense de l'applicatif vers la base, avec la **Row-Level Security** de
PostgreSQL, et un **rôle applicatif dédié** `vetolib_app`, `NOLOGIN NOBYPASSRLS` et non
propriétaire des tables.

Chaque table tenantée porte une politique :

```sql
CREATE POLICY tenant_isolation ON <table>
FOR ALL
USING      (clinic_id = NULLIF(current_setting('app.clinic_id', true), '')::uuid)
WITH CHECK (clinic_id = NULLIF(current_setting('app.clinic_id', true), '')::uuid);
```

Les transactions passent par un _Unit of Work_ en deux modes : `system_uow()` pour les
flux qui ne connaissent pas encore le tenant (connexion, rafraîchissement,
enregistrement), et `tenant_uow(clinic_id)`, qui émet `SET LOCAL ROLE vetolib_app` puis
`set_config('app.clinic_id', ..., true)`.

## Conséquences

**Positives**

- Un `WHERE` oublié n'est plus une faille : au pire un résultat trop large **à
  l'intérieur** d'un même tenant.
- La garantie vaut pour **tout** accès sous ce rôle, y compris un futur script ou une
  console.
- `WITH CHECK` empêche aussi d'**écrire** une ligne dans une autre clinique.
- `SET LOCAL` est annulé au commit : aucune fuite entre deux requêtes poolées, et le
  montage reste compatible avec PgBouncer en mode transaction.

**Coûts**

- Un rôle de plus à créer et à maintenir ; les `GRANT` doivent être reposés par chaque
  migration, les privilèges par défaut ne couvrant pas les bases éphémères de
  testcontainers.
- Les politiques ne sont **pas autogénérées** par Alembic : elles s'écrivent à la main.
- Le mode « système » reste une porte ouverte, à réserver strictement aux flux
  pré-tenant.
- Les tests d'isolation exigent un vrai PostgreSQL — voir
  [ADR-0008](0008-testcontainers-plutot-que-sqlite.md).

**Neutres**

- Pas de `FORCE ROW LEVEL SECURITY` : le rôle propriétaire continue de contourner les
  politiques. C'est exactement ce qui permet aux flux pré-tenant et aux migrations de
  fonctionner.

## Alternatives écartées

| Alternative                           | Pourquoi écartée                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Une base ou un schéma par clinique    | Migrations et sauvegardes multipliées ; ne passe pas à l'échelle sur des milliers de petites cliniques |
| Filtrage applicatif seul              | Un oubli suffit ; rien ne le détecte avant l'incident                                                  |
| Filtrage par une couche ORM générique | Contournable par une requête SQL brute, et invisible depuis la base                                    |

## Où cela vit dans le code

- `docker/postgres-init/02-app-role.sh` — création du rôle
- `backend/src/vetolib/shared/infrastructure/db/uow.py` — les deux modes
- `backend/migrations/versions/0001_identity_initial.py` — le gabarit de politique
- `backend/migrations/versions/0004_scheduling_initial.py` — son application à cinq tables
- `backend/src/vetolib/config.py` — `app_db_role`

## Comment on vérifie que la décision tient

`backend/tests/integration/test_rls_isolation.py` monte deux cliniques dans un PostgreSQL
réel et vérifie qu'une transaction ouverte pour l'une ne voit rien de l'autre — y compris
en émettant volontairement une requête **sans** clause de filtrage.

Voir [Isolation multi-tenant et RLS](../architecture/multi-tenant-et-rls.md).
