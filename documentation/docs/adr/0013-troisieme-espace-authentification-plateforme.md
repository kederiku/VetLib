---
title: "ADR-0013 — Un troisième espace d'authentification pour le back-office plateforme"
sidebar_label: "0013 — Espace d'authentification plateforme"
sidebar_position: 13
---

# ADR-0013 — Un troisième espace d'authentification pour le back-office plateforme

|               |            |
| ------------- | ---------- |
| **Statut**    | Accepté    |
| **Date**      | 2026-08-22 |
| **Décideurs** | @kederiku  |
| **Remplace**  | —          |

## Contexte

Les exploitants du produit n'ont aujourd'hui **aucun moyen** de voir ni de gérer le parc :
combien de cliniques sont inscrites, quel propriétaire a un problème de compte, quel
membre du personnel porte quel rôle. Tout se fait en SQL, à la main, sur la base de
production.

Or l'authentification existante ne peut pas servir cet usage. Les seuls rôles du produit
— `asv`, `veterinarian`, `manager` — sont définis par
[ADR-0002](0002-multi-tenant-par-rls.md) comme **strictement internes à une clinique** :
`users.clinic_id` est `NOT NULL`, et la policy `tenant_isolation` filtre chaque requête
sur `app.clinic_id`. Un exploitant n'appartient à aucune clinique. Il ne peut donc pas
être un `User`, et un back-office ne peut pas être un écran de plus dans le portail B2B.

Trois contraintes encadrent la décision :

1. le dépôt est **public** : aucun compte par défaut, aucun secret, aucune procédure de
   création qui laisserait une trace exploitable ;
2. [ADR-0003](0003-jwt-en-cookies-httponly.md) a déjà tranché la forme des sessions
   (double jeton, cookies `HttpOnly`, claim `kind`) et posé le principe de deux espaces
   **indépendants** ; il serait incohérent d'en dériver un troisième autrement ;
3. les écrans demandés — la liste des cliniques, celle des propriétaires, celle du
   personnel toutes cliniques confondues — sont **cross-tenant par nature**. Aucune
   transaction protégée par la RLS ne peut les servir.

## Décision

**Nous ouvrons un troisième espace d'authentification, entièrement cloisonné, pour les
administrateurs de la plateforme.** Concrètement :

- une table **`platform_admins`**, globale : ni `clinic_id`, ni rôle, ni permissions ;
- une troisième valeur du claim `kind` : **`platform`**, exigée strictement au décodage ;
- une troisième paire de cookies, **`vetolib_admin_access`** et
  **`vetolib_admin_refresh`**, avec deux durcissements par rapport aux deux autres
  espaces : le cookie d'accès porte `path=/api/v1/admin` (et non `/`), et les deux
  cookies sont en `SameSite=Strict` ; le rafraîchissement dure **12 heures** au lieu de
  sept jours ;
- une classe d'adaptateur JWT **dédiée** (`PyJWTPlatformAdminTokenProvider`) et un port
  dédié, plutôt qu'un fournisseur paramétrable par `kind` ;
- **aucune route d'inscription** : les comptes se créent par la commande locale
  `make create-admin`, qui applique la même politique de mot de passe que les deux autres
  espaces ([ADR-0012](0012-politique-de-mot-de-passe.md)) ;
- l'autorisation est **binaire** : un jeton `platform` valide ouvre tout le back-office,
  il n'y a ni rôle ni matrice de permissions ;
- les use cases du back-office s'exécutent sous **UoW système** — donc hors RLS. C'est
  l'entorse assumée de cette décision, et la section suivante en tire les conséquences.

Le code du back-office vit dans le bounded context **`identity`**, et non dans un
cinquième contexte. Il ne fait que lire et muter `Clinic`, `User` et `Owner`, trois
agrégats d'`identity` ; un contexte `administration` devrait soit importer le domaine
d'un autre contexte (ce qu'interdit [ADR-0001](0001-architecture-hexagonale-et-ddd.md)),
soit dupliquer `Role` et la politique de mot de passe. Le jour où le back-office
acquerra ses **propres** agrégats — plans tarifaires, quotas, tickets de support — le
contexte deviendra légitime et dialoguera avec `identity` par identifiant et par
événements.

## Conséquences

**Positives**

- Un jeton du personnel ou d'un propriétaire ne vaut **rien** dans le back-office, et
  réciproquement : la propriété centrale d'ADR-0003 s'étend au troisième espace.
- La révocation d'un administrateur est **immédiate** : le jeton étant maigre, le compte
  est relu en base à chaque requête, au lieu d'attendre l'expiration comme pour le
  « fat token » du personnel. Sur une poignée de comptes, la lecture ne coûte rien.
- Le cookie le plus puissant du système ne circule que sur `/api/v1/admin`. En
  développement, les trois frontends partagent l'hôte `localhost` — les cookies ignorant
  le port — et c'est cette restriction qui l'empêche d'accompagner les appels ordinaires
  du B2C ou du B2B.
- La tolérance « claim `kind` absent = personnel », héritée de la période de transition
  d'ADR-0003, a été **supprimée** au passage. À trois espaces, une branche _fail-open_ au
  coeur du mécanisme de cloisonnement n'était plus tenable.

**Coûts**

- **La RLS ne protège plus rien dans cet espace.** Les endpoints du back-office lisent
  sous le rôle propriétaire des tables ; un endpoint déployé sans dépendance
  d'authentification divulguerait le personnel de toutes les cliniques et tous les
  propriétaires. La barrière est du code, donc oubliable — d'où les compensations
  décrites plus bas, qui ne sont pas facultatives.
- Un troisième jeu de cookies, de constantes et de tests à maintenir, et une troisième
  origine dans `CORS_ORIGINS`.
- Les hooks `admin` apparaissent dans les clients Orval des **trois** applications, y
  compris celles qui ne les appelleront jamais : un seul schéma OpenAPI, `mode:
tags-split` sans filtre ([ADR-0009](0009-client-api-genere-et-commite.md)). C'est du
  code mort, élagué au build et exclu d'ESLint, de CodeQL et de la couverture.

**Neutres**

- La table `platform_admins` n'a **pas** de RLS, et ce n'est pas un oubli : sans
  `clinic_id`, aucune policy n'aurait de colonne sur laquelle porter. Sa protection est
  un **privilège** — la migration `0008` révoque explicitement tout droit du rôle
  applicatif `vetolib_app` dessus. Attention au piège : `docker/postgres-init/02-app-role.sh`
  pose un `ALTER DEFAULT PRIVILEGES` qui accorde automatiquement `SELECT/INSERT/UPDATE`
  sur toute table créée ensuite.
- Les routes `/api/v1/admin/*` figurent dans le schéma OpenAPI public. Les masquer
  (`include_in_schema=False`) empêcherait Orval de générer le client du back-office, et
  l'obscurité n'est de toute façon pas un contrôle d'accès.

## Alternatives écartées

| Alternative                                                        | Pourquoi écartée                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Un rôle `superadmin` dans `users`, avec `clinic_id` nullable       | Casse l'invariant « un membre du personnel appartient à une clinique », affaiblit la policy `tenant_isolation` (qui devrait tolérer un `clinic_id` nul), et mélange l'escalade de privilèges la plus grave du produit avec les comptes ordinaires du personnel.                       |
| Réutiliser les cookies du personnel avec un `kind` différent       | Les trois applications partagent l'hôte `localhost` en développement : un seul jeu de noms ferait s'écraser les sessions, et le cookie le plus puissant partirait sur toutes les requêtes.                                                                                            |
| Un rôle PostgreSQL `vetolib_admin` avec `BYPASSRLS`                | N'apporte **rien** : le pool est déjà connecté en propriétaire des tables et, faute de `FORCE ROW LEVEL SECURITY`, le propriétaire contourne déjà ses propres policies. On ajouterait de la plomberie pour obtenir les mêmes privilèges effectifs, avec l'illusion d'un durcissement. |
| Une policy RLS conditionnée à un GUC `app.is_platform_admin`       | La plus dangereuse. L'isolation de **toutes** les transactions tenant dépendrait d'un booléen de session qu'un `set_config` mal placé laisserait à `true`, et l'on perdrait la propriété la plus précieuse de la policy actuelle : son caractère _fail-closed_.                       |
| Une matrice de permissions pour les administrateurs                | Deux ou trois exploitants, et tous les écrans visibles par tout le monde : la matrice serait une cérémonie. La porte de sortie est décrite dans la docstring du fournisseur de jetons — une colonne `role`, une matrice séparée, un claim `perms`, une fabrique de dépendance.        |
| Une migration ou une variable d'environnement pour créer le compte | Le dépôt est public : un compte par défaut est un compte en production le jour où quelqu'un déploie sans y penser. Une variable d'environnement laisserait le secret dans l'environnement du processus.                                                                               |

## Où cela vit dans le code

- `backend/src/vetolib/identity/domain/platform_admin.py` — l'agrégat
- `backend/src/vetolib/identity/infrastructure/token_provider.py` — `_KIND_PLATFORM` et
  la classe dédiée
- `backend/src/vetolib/identity/presentation/cookies.py` — les noms, `path` et `SameSite`
- `backend/src/vetolib/identity/presentation/admin_dependencies.py` — la garde
  `get_current_admin`, posée sur les **routeurs**
- `backend/src/vetolib/identity/infrastructure/login_throttle.py` — la limitation de débit
- `backend/src/vetolib/cli/create_admin.py` — la création des comptes
- `backend/migrations/versions/0008_platform_admins.py` — la table et son `REVOKE`

## Comment on vérifie que la décision tient

`backend/tests/integration/test_admin_routes_protected.py` **énumère** toutes les routes
`/api/v1/admin/*` de l'application, à partir du schéma OpenAPI, et exige un `401` strict
sur chacune sans cookie d'administrateur — puis recommence avec un vrai cookie du
personnel recopié sous le nom du cookie admin. Une liste écrite à la main se périmerait
dès la prochaine route ; ici, les routes sont découvertes **dans l'application
elle-même**. Un test compagnon vérifie que l'énumération n'est pas vide : c'est le mode
de panne le plus insidieux d'un test généré.

S'y ajoutent `test_admin_tokens.py`, qui rejette les six combinaisons croisées
`kind` × fournisseur sur les vrais adaptateurs PyJWT, et un test d'intégration qui
constate qu'une requête émise sous `SET LOCAL ROLE vetolib_app` sur `platform_admins`
échoue en « permission denied » — le seul contrôle qui verrouille le `REVOKE`.

## Ce qui reste ouvert

Le durcissement complet de la base — `FORCE ROW LEVEL SECURITY` sur toutes les tables
tenantées **et** un pool connecté sur un rôle non-propriétaire — réduirait le rayon
d'action d'un bug dans cet espace. C'est un chantier à part entière, qui touche tous les
contextes : il est mentionné ici pour que son absence soit une décision, pas un oubli.
