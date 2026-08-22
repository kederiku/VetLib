---
sidebar_position: 4
title: "Le back-office plateforme"
description: "La console d'administration : datatables serveur, cliniques, propriétaires et personnel."
keywords:
  [back-office, admin, datatable, tanstack table, pagination, tri, recherche]
---

# Le back-office plateforme

`frontend-admin` est la **troisième** application Next.js du dépôt, servie sur le
port **3003**. Elle est réservée à l'équipe qui exploite la plateforme, et c'est la
seule qui voie les données de **toutes** les cliniques à la fois.

|                           |                                                   |
| ------------------------- | ------------------------------------------------- |
| Nom npm                   | `vetolib-admin`                                   |
| Port                      | 3003                                              |
| Public                    | Administrateurs de la plateforme                  |
| Espace d'authentification | `/api/v1/admin/auth/*` (claim `kind: "platform"`) |
| Référencement             | `X-Robots-Tag: noindex, nofollow`                 |

Le socle technique est celui des deux portails (Next 16 App Router, React 19,
Tailwind 4, shadcn/ui sur Base UI, TanStack Query, Vitest), avec **une seule
dépendance de plus** : `@tanstack/react-table`. Le cloisonnement de l'espace
d'authentification est décrit dans
[ADR-0013](../adr/0013-troisieme-espace-authentification-plateforme.md).

## Les écrans

| URL                | Contenu                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------- |
| `/tableau-de-bord` | Quatre compteurs (`GET /admin/stats`) et les cinq dernières inscriptions de chaque côté |
| `/cliniques`       | Toutes les cliniques : recherche, filtre de statut, création, suspension                |
| `/cliniques/[id]`  | Fiche d'une clinique : identité, chiffres, et son personnel                             |
| `/proprietaires`   | Tous les comptes du portail propriétaires                                               |
| `/personnel`       | Le personnel de toutes les cliniques, filtrable par rôle et par statut                  |

Les URL sont **en français**, comme les libellés du menu et les titres de page : le
libellé de la sidebar, le titre et le segment d'URL sont le même mot, ce qui rend
`pageTitleForPath` évident. Il n'y a aucun enjeu de référencement, la console étant
en `noindex`.

## Les datatables : le serveur décide, la table affiche

C'est le point de conception le plus important de cette application. Page courante,
taille de page, tri, recherche et filtres vivent **dans l'URL**, partent en
paramètres de requête, et PostgreSQL renvoie `{ items, total, limit, offset }`.

`@tanstack/react-table` n'est utilisé que comme **moteur de rendu** :
`manualPagination` et `manualSorting` lui disent que les données reçues sont déjà la
bonne page, déjà triée.

:::warning Un tri client est un tri faux
Trier en mémoire les vingt lignes reçues donne un résultat visuellement
convaincant : les lignes s'ordonnent. Mais le tri ne porte que sur la page affichée,
pas sur la table. « Les cliniques par ordre alphabétique » afficherait alors les
vingt premières lignes **d'un ordre arbitraire**, réordonnées entre elles.
:::

### L'état vit dans l'URL

`lib/table/use-table-url-state.ts` porte cette mécanique, avec trois règles :

1. **parsing défensif** — une URL est une saisie utilisateur. Chaque valeur passe par
   un analyseur qui retombe sur le défaut. La liste blanche de tri est celle de
   l'écran, elle-même sous-ensemble de l'enum du backend : aucune chaîne inventée ne
   peut atteindre un `ORDER BY` ;
2. **les défauts sont absents de l'URL** — `/cliniques` reste l'adresse au repos ;
3. **`router.replace`, jamais `push`** — filtrer n'est pas une étape de navigation :
   le bouton « précédent » ne doit pas rejouer chaque frappe de la recherche.

Conséquence utile : une liste filtrée est **partageable**. « Regarde les cliniques
suspendues » se transmet en collant un lien.

:::danger Absence de filtre = `undefined`, jamais `null`
Le client généré par Orval sérialise un `null` explicite en la **chaîne** `"null"`.
Un `?status=null` produit un 422 sur un paramètre typé par une enum, et — bien pire —
un `?search=null` cherche le mot « null » et renvoie **zéro résultat sans la moindre
erreur**. Les convertisseurs de `lib/table/filters.ts` rendent donc `undefined`, seule
valeur qu'Orval omet de la chaîne de requête.
:::

### Les quatre états d'une liste

`components/shared/data-table.tsx` les porte une fois pour toutes :

- **chargement** : des squelettes **dans** le tableau, en nombre égal à la taille de
  page — la mise en page ne bouge pas quand les données arrivent ;
- **erreur** : `ErrorState`, avec son bouton « Réessayer » obligatoire ;
- **vide** : **deux** états distincts. « Aucune clinique inscrite » propose de créer ;
  « Aucun résultat pour _lilas_ » propose d'effacer la recherche. Le ton engageant
  d'un premier usage n'a aucun sens quand on a juste filtré trop fin ;
- **données** : le tableau, avec `placeholderData: keepPreviousData` pour que le
  changement de page ne fasse pas clignoter l'écran.

## Ce que la console ne fait pas

Ces limites sont des décisions, pas des fonctionnalités manquantes.

| Absent                  | Pourquoi                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Changer un email        | C'est l'identifiant de connexion : le changer d'un clic serait une prise de contrôle, pas une correction de fiche. Le schéma d'API lui-même n'a pas le champ |
| Changer un mot de passe | Donnerait à un exploitant le moyen d'entrer dans le compte d'un client                                                                                       |
| Supprimer un compte     | Le projet est en soft delete intégral ; `deleted_at` reste réservé à l'effacement RGPD                                                                       |
| Export CSV              | Un export est une exfiltration en un clic                                                                                                                    |
| Données médicales       | La console administre des **comptes**, pas des dossiers de soins                                                                                             |

## Les mots de passe générés

Créer une clinique avec son gérant, ou ajouter un membre à une clinique, produit un
mot de passe **généré par le backend** (phrase de passe de cinq mots) et renvoyé une
seule fois dans le 201. Il n'est stocké nulle part en clair et **aucune route ne
permet de le relire**.

Le front en tire une contrainte d'interface : le dialogue bascule sur un écran de
remise avec un bouton « copier », et **refuse de se fermer** autrement que par son
bouton dédié — un clic à côté perdrait le secret.

## Les confirmations

Une seule action exige de **retaper le nom** : **suspendre une clinique**. C'est la
seule qui coupe l'accès de N personnes d'un coup, sans préavis et sans qu'aucune
puisse se dépanner ; le dialogue affiche d'ailleurs l'effectif concerné.

Tout le reste (réactiver, désactiver un propriétaire ou un membre) passe par un
`AlertDialog` simple. Mettre la saisie partout produirait l'inverse de l'effet
recherché : des utilisateurs qui la remplissent en pilote automatique, y compris là
où elle compte.

## Le délai d'effet d'un changement de rôle

Le portail clinique lit les permissions dans le **jeton d'accès**, valable 15
minutes. Un changement de rôle s'applique donc pour la personne concernée au plus
tard au prochain rafraîchissement de sa session. Le dialogue le dit explicitement :
taire ce décalage produirait un ticket de support par semaine.

## Démarrer l'application

```bash
make create-admin email=prenom.nom@exemple.fr   # une seule fois, mot de passe a l'invite
make dev-admin                                  # http://localhost:3003
```

Il n'y a **ni inscription ni mot de passe oublié** sur l'écran de connexion : les
accès sont créés en ligne de commande, par quelqu'un qui a déjà accès à la base.
