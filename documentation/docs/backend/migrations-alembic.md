---
sidebar_position: 3
title: "Migrations de base de données"
description: "Écrire une migration correcte, réversible et tenantée."
keywords: [alembic, migration, rls, grant, réversibilité, head]
---

# Migrations de base de données

## Pourquoi Alembic se connecte en superuser

Les migrations utilisent `ALEMBIC_DATABASE_URL`, **distincte** de `DATABASE_URL`. Ce
n'est pas une redondance : créer un rôle, installer une extension, poser une politique
RLS ou accorder un `GRANT` exigent des privilèges que l'application n'a délibérément
**pas** au moment de l'exécution.

C'est la même logique qui fait exister le rôle `vetolib_app` : le principe du moindre
privilège appliqué à deux moments différents du cycle de vie.

## Créer une révision

```bash
make revision m="scheduling: ajoute la colonne X"
```

Le message est **obligatoire** — la cible échoue sans lui. Elle crée un fichier vide dans
`backend/migrations/versions/`, à remplir à la main.

L'autogénération d'Alembic peut servir de point de départ, mais elle ne voit qu'une
partie du schéma (voir plus bas) : ce qu'elle produit est toujours à relire.

## Le gabarit d'une table tenantée

La migration `0001_identity_initial.py` est explicitement écrite comme un **gabarit**. Une
nouvelle table tenantée reprend ses quatre éléments.

### 1. Les colonnes conventionnelles

```python
sa.Column("id", sa.Uuid(), nullable=False),
sa.Column("clinic_id", sa.Uuid(), sa.ForeignKey("clinics.id"), nullable=False),
sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
```

### 2. Les index uniques **partiels**

Un `UNIQUE` classique condamnerait à jamais l'email d'un compte supprimé, puisque la
ligne reste en base :

```python
op.create_index(
    "uq_users_email_active",
    "users",
    ["clinic_id", "email"],
    unique=True,
    postgresql_where=sa.text("deleted_at IS NULL"),
)
```

### 3. Les `GRANT`, sans `DELETE`

```python
op.execute(f"GRANT SELECT, INSERT, UPDATE ON ma_table TO {APP_ROLE}")
```

Le commentaire de `0001` est net : « Pas de GRANT DELETE : soft delete uniquement — la
règle est dans le schéma. » Ce n'est plus une convention qu'on peut oublier, c'est une
impossibilité.

### 4. La politique RLS

```python
op.execute("ALTER TABLE ma_table ENABLE ROW LEVEL SECURITY")
op.execute(
    """
    CREATE POLICY tenant_isolation ON ma_table
    FOR ALL
    USING      (clinic_id = NULLIF(current_setting('app.clinic_id', true), '')::uuid)
    WITH CHECK (clinic_id = NULLIF(current_setting('app.clinic_id', true), '')::uuid)
    """
)
```

Le `NULLIF(..., '')` est expliqué dans
[Multi-tenant et RLS](../architecture/multi-tenant-et-rls.md) : sur une connexion poolée,
`current_setting` renvoie la chaîne vide et non `NULL`. Sans lui, le cast échoue ; avec
lui, le comportement par défaut est _fail-closed_.

## Ce qu'Alembic n'autogénère pas

| Objet                                       | Conséquence               |
| ------------------------------------------- | ------------------------- |
| Extensions (`btree_gist`)                   | À créer avec `op.execute` |
| Politiques RLS, `ENABLE ROW LEVEL SECURITY` | À écrire à la main        |
| `GRANT`                                     | À écrire à la main        |
| Contraintes `EXCLUDE`                       | À écrire en SQL brut      |

C'est la raison pour laquelle un `alembic revision --autogenerate` ne suffit **jamais**
pour une table tenantée.

## La réversibilité est obligatoire

```bash
make check-migrations
```

Cette cible — reproduite par le job CI `backend-migrations` — vérifie trois choses :

1. **un seul `head`.** Deux têtes signifient deux branches de migration : Alembic ne sait
   plus laquelle appliquer. C'est le symptôme classique de deux demandes de fusion
   parallèles ayant chacune créé sa révision.
2. **la réversibilité.** La CI applique `upgrade head`, puis `downgrade base`, puis
   `upgrade head` de nouveau. Un `downgrade()` vide ou faux casse ici.
3. **l'absence de dérive.** `alembic check` échoue si un modèle a changé sans migration
   correspondante.

Le `downgrade()` doit défaire dans l'**ordre inverse** — les tables filles avant les
tables mères, à cause des clés étrangères — et supprimer explicitement ce qui a été créé
à la main :

```python
def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON users")
    op.execute("ALTER TABLE users DISABLE ROW LEVEL SECURITY")
    op.drop_table("users")
    op.drop_table("clinics")
```

Une exception assumée dans `0004` : l'extension `btree_gist` est **conservée** au
`downgrade`. Elle est partagée, sans coût, et la supprimer casserait d'autres objets.

## La leçon de la migration 0005

Les migrations `0001` à `0004` passaient à `CheckConstraint` des noms **déjà préfixés**
(`ck_users_role_valid`), que la convention de nommage du `MetaData` préfixait une seconde
fois. Résultat en base : `ck_users_ck_users_role_valid`.

Rien ne cassait. C'est exactement ce qui rend l'incident intéressant : les modèles ORM
utilisaient les noms courts, la base les noms doubles, et **le jour où un `autogenerate`
aurait voulu modifier une de ces contraintes, il ne l'aurait pas trouvée**. La migration
`0005` renomme une fois pour toutes vers la forme canonique.

Deux enseignements :

- laissez la convention de nommage faire son travail — passez le nom **court** ;
- une dérive silencieuse entre modèles et schéma est plus coûteuse qu'une erreur bruyante.

## Les cinq migrations actuelles

| Révision | Contenu                                                                        |
| -------- | ------------------------------------------------------------------------------ |
| `0001`   | `clinics`, `users`, `outbox_events`, rôle applicatif, `GRANT`, RLS sur `users` |
| `0002`   | `owners` — **sans** RLS, et la docstring explique pourquoi                     |
| `0003`   | Profil des cliniques (adresse, fuseau IANA) et table `pets`                    |
| `0004`   | Tout `scheduling` : `btree_gist`, contrainte `EXCLUDE`, RLS sur cinq tables    |
| `0005`   | Renommage des contraintes `CHECK` vers la convention                           |

Leurs docstrings sont, de fait, des mini-décisions d'architecture : elles expliquent
**pourquoi** `owners` n'a pas de RLS, **pourquoi** `btree_gist` est nécessaire,
**pourquoi** annuler libère un créneau. Les [ADR](../adr/index.md) les généralisent, ils
ne les remplacent pas.
