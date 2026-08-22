---
sidebar_position: 4
title: "Stratégie de tests"
description: "Choisir le bon niveau de test et tenir les seuils de couverture."
keywords: [tests, pytest, testcontainers, vitest, couverture, seuils]
---

# Stratégie de tests

## La pyramide du projet

```mermaid
flowchart TD
  U["tests/unit<br/>doublures en mémoire, zéro entrée-sortie<br/>millisecondes, SANS Docker"]
  I["tests/integration<br/>PostgreSQL et Redis réels (testcontainers)<br/>application FastAPI complète"]
  F["Vitest × 3 applications<br/>jsdom, Testing Library"]

  U --> P1["Prouve : règles métier, transitions,<br/>calcul des créneaux, validation"]
  I --> P2["Prouve : RLS, SET LOCAL, index partiels,<br/>contrainte EXCLUDE, trajet HTTP complet"]
  F --> P3["Prouve : rendu, formulaires,<br/>états de chargement et d'erreur"]

  U -.->|"ne peut PAS prouver"| N1["que la RLS filtre réellement"]
  I -.->|"ne peut PAS prouver"| N2["ce que voit l'utilisateur"]
```

## `tests/unit` — rapide, sans Docker

Les use cases y sont exercés avec des **doublures en mémoire** (`tests/unit/*/fakes.py`)
qui implémentent les mêmes ports que les repositories réels. Aucune base, aucun réseau.

C'est ce niveau qui bénéficie directement de l'architecture hexagonale : parce que
`domain/` n'importe aucun framework, tester `Appointment.cancel_by_owner()` ne demande
rien d'autre qu'un objet et une date.

```bash
make test-unit
```

Le port `Clock` prend ici tout son sens : figer le temps rend déterministe une règle
comme « au moins 24 heures avant le début », qui dépendrait sinon de la date d'exécution
de la suite.

## `tests/integration` — PostgreSQL réel, jamais SQLite

```bash
make test-integration   # Docker requis
```

testcontainers démarre de vrais conteneurs PostgreSQL et Redis, applique les migrations
Alembic, puis exerce l'application FastAPI complète : HTTP → use case → SQLAlchemy →
PostgreSQL.

:::danger Pourquoi SQLite est exclu
La RLS, `SET LOCAL`, `JSONB` et les index uniques partiels **ne sont pas émulables** par
SQLite. Un test SQLite donnerait une confiance fausse précisément sur les mécanismes de
sécurité — c'est-à-dire au pire endroit possible. Voir
[ADR-0008](../adr/0008-testcontainers-plutot-que-sqlite.md).
:::

Le coût est maîtrisé par la portée des fixtures : les conteneurs et les migrations sont
en `scope="session"` et ne tournent qu'une fois pour toute la suite. L'isolation entre
tests est assurée par un `TRUNCATE` des tables avant chaque test.

Les fichiers actuels couvrent les flux critiques :

| Fichier                          | Ce qu'il prouve                                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `test_rls_isolation.py`          | Une clinique ne voit rien d'une autre, même sans clause de filtrage                                   |
| `test_auth_flow.py`              | Connexion, rafraîchissement, déconnexion côté personnel                                               |
| `test_owner_auth_flow.py`        | Idem côté propriétaires, et le cloisonnement des deux espaces                                         |
| `test_scheduling_flow.py`        | Réservation, confirmation, annulation, anti-double-réservation                                        |
| `test_scheduling_permissions.py` | Un rôle insuffisant reçoit bien un `403`                                                              |
| `test_pets_flow.py`              | Le filtrage applicatif par `owner_id`                                                                 |
| `test_clinics_me.py`             | Lecture et mise à jour du profil de clinique                                                          |
| `test_clinic_suspension.py`      | Les cinq points où une clinique suspendue coupe l'accès de son personnel                              |
| `test_admin_auth_flow.py`        | Le back-office : attributs des cookies, révocation, limitation de débit                               |
| `test_admin_routes_protected.py` | **Toute** route `/api/v1/admin/*` exige le cookie d'administrateur                                    |
| `test_admin_directory_flow.py`   | Recherche sans accent (`unaccent`), jokers échappés, et la lecture à travers **toutes** les cliniques |
| `test_admin_mutations_flow.py`   | Créer, suspendre, désactiver : l'effet réel, et la ligne d'audit écrite                               |
| `test_admin_bootstrap_cli.py`    | `make create-admin` : création, refus du doublon, garde-fou du dernier compte                         |

Trois de ces fichiers méritent un mot.

`test_clinic_suspension.py` existe parce que la suspension d'une clinique agit dans cinq
use cases différents — dont un qui vit dans un **autre** bounded context (le lecteur de
cliniques de `scheduling`). Un test unitaire par use case ne dirait rien de l'ensemble ;
seul un parcours HTTP complet prouve que les cinq points sont branchés.

`test_admin_routes_protected.py` est d'une autre nature : il ne teste pas un scénario, il
**énumère**. Il lit le schéma OpenAPI de l'application, retient toutes les routes
`/api/v1/admin/*`, et exige un `401` strict sur chacune, sans cookie puis avec un vrai
cookie du personnel recopié. C'est la contrepartie automatisée du fait que cet espace
contourne la Row-Level Security ([ADR-0013](../adr/0013-troisieme-espace-authentification-plateforme.md)) :
sa barrière étant du code, elle est oubliable, et une liste écrite à la main se périmerait
dès la route suivante. Un test compagnon vérifie que l'énumération n'est pas vide — le
mode de panne le plus insidieux d'un test généré est de ne rien tester du tout.

`test_admin_directory_flow.py` garde l'autre moitié de la même décision. Ses listes
doivent voir **plusieurs cliniques à la fois** : le test central inscrit deux cliniques
par le flux public, puis demande une seule liste de personnel et exige d'y retrouver les
deux. Si quelqu'un branchait un jour le back-office sur un UoW tenant, la Row-Level
Security ne renverrait plus que le personnel d'une clinique — sans erreur, sans alerte,
juste une liste tranquillement incomplète. C'est la contrepartie automatisée de l'entorse
assumée dans [Isolation multi-tenant et RLS](../architecture/multi-tenant-et-rls.md) :
dans cet espace, la base ne rattrape plus rien, donc la propriété doit être prouvée par un
test — et seule une vraie base, politiques actives, peut la prouver.

## Les tests frontend

Vitest en environnement `jsdom`, avec Testing Library. Configuration `globals: false` :
chaque test importe explicitement `describe`, `it` et `expect` depuis `vitest`. C'est
aussi la raison des doublures manuelles de `localStorage` et de `matchMedia` dans
`vitest.setup.ts`.

```bash
make test-front        # rapide, sans couverture
make coverage-front    # avec couverture et seuils : ce que fait la CI
```

## La couverture et ses seuils

| Périmètre              | Seuil                         | Mesure de référence                   |
| ---------------------- | ----------------------------- | ------------------------------------- |
| Backend (`fail_under`) | **85 %**                      | 87 % au 2026-08-21                    |
| `frontend-b2c`         | st 62 / br 60 / fn 58 / li 63 | st 64,7 / br 63,2 / fn 60,7 / li 65,4 |
| `frontend-b2b`         | st 63 / br 59 / fn 56 / li 63 | st 65,1 / br 62,2 / fn 58,0 / li 65,5 |
| `frontend-admin`       | st 79 / br 68 / fn 73 / li 80 | st 81,2 / br 71,8 / fn 75,2 / li 82,1 |

La méthode est constante : **on mesure, puis on pose le seuil deux points en dessous**
(trois pour les branches, dont les compteurs v8 bougent au gré de la chaîne de
compilation). Assez serré pour attraper une régression franche, assez lâche pour ne pas
transformer chaque demande de fusion en négociation.

Côté backend, la couverture est **consolidée** : les tests unitaires et d'intégration
tournent sur deux exécuteurs distincts en CI, chacun produit une mesure partielle, et
`coverage combine` les fusionne avant d'appliquer le seuil. C'est ce que permet
`relative_files = true` dans `pyproject.toml`.

Les seuils frontend sont **globaux, volontairement** : des seuils par dossier
demanderaient une mesure par dossier, et poser des chiffres non mesurés les rendrait
indiscernables de chiffres négociés.

:::warning La règle de gouvernance des seuils
**Ne jamais baisser un seuil dans la demande de fusion qui l'a cassé.** Si un abaissement
est justifié, il fait l'objet d'un commit dédié, daté et commenté. Sans cette règle, un
seuil devient une formalité qu'on ajuste à la baisse jusqu'à ce qu'il ne mesure plus rien.
:::

## Ce que la CI en fait

| Job                             | Contenu                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------- |
| `backend - tests unitaires`     | `pytest tests/unit`, produit `.coverage.unit`                                 |
| `backend - tests d'integration` | `pytest tests/integration`, produit `.coverage.integration`                   |
| `backend - couverture`          | Récupère les deux, `coverage combine`, applique `fail_under`                  |
| `frontend - <app>`              | ESLint, build, `tsc`, Vitest avec seuils, pour chacune des trois applications |

Voir [Le pipeline d'intégration continue](../exploitation/pipeline-ci.md).
