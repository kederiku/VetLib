---
sidebar_position: 1
title: "Les trois applications Next.js"
description: "B2C, B2B et back-office : périmètres, App Router et socle commun."
keywords: [next.js, app router, shadcn, tailwind, b2b, b2c, back-office]
---

# Les trois applications Next.js

## Trois applications, trois publics

|                           | `frontend-b2c`                   | `frontend-b2b`                   | `frontend-admin`                |
| ------------------------- | -------------------------------- | -------------------------------- | ------------------------------- |
| Nom npm                   | `vetolib-portal`                 | `vetolib-clinic`                 | `vetolib-admin`                 |
| Port                      | 3000                             | 3001                             | 3003                            |
| Public                    | Propriétaires d'animaux          | Personnel de clinique            | Équipe de la plateforme         |
| Espace d'authentification | `/api/v1/owner/auth/*`           | `/api/v1/auth/*`                 | `/api/v1/admin/auth/*`          |
| Image publiée             | `ghcr.io/kederiku/vetlib-portal` | `ghcr.io/kederiku/vetlib-clinic` | `ghcr.io/kederiku/vetlib-admin` |

Les deux premières sont les **portails clients** ; la troisième est la console
d'exploitation, détaillée dans [Le back-office
plateforme](back-office-plateforme.md). Cette page décrit ce que les trois ont en
commun — et c'est presque tout.

Ce sont **trois projets npm indépendants**, chacun avec son `package-lock.json`. Voir
[Vue d'ensemble du monorepo](../architecture/vue-d-ensemble.md#pourquoi-un-monorepo-sans-espace-de-travail-npm).

## Le socle technique

Identique dans les trois applications :

| Brique                   | Version                                          |
| ------------------------ | ------------------------------------------------ |
| Next.js (App Router)     | 16.3.1                                           |
| React                    | 19.2.8                                           |
| TanStack Query           | 5.101.4                                          |
| Tailwind CSS             | 4.3.3                                            |
| shadcn/ui                | style `base-luma`, base `neutral`, icônes Lucide |
| Zod + React Hook Form    | validation et formulaires                        |
| TypeScript               | 6.0.3                                            |
| Vitest + Testing Library | tests                                            |

Les deux portails ont exactement la même liste de dépendances, `next-themes` (bascule
clair/sombre) et `sonner` (notifications éphémères) compris. Le back-office en diffère
sur deux points, tous deux justifiés par son périmètre : il ajoute
`@tanstack/react-table` (les datatables de la console) et retire `date-fns` et
`react-day-picker` (aucun calendrier — il n'y a pas de rendez-vous dans une console
d'exploitation).

:::note TypeScript reste en 6.x
Une contrainte du projet, inscrite dans `CLAUDE.md` et verrouillée dans
`dependabot.yml` : **TypeScript 7 casse typescript-eslint**. La majeure est ignorée par
Dependabot dans les trois projets npm.
:::

## L'organisation des routes

Les trois applications utilisent le même découpage par **groupes de routes** — les
parenthèses ne produisent pas de segment d'URL, elles servent à partager une mise en
page :

```text
src/app/
├── (auth)/          # mise en page publique : login, register
│   ├── login/
│   └── register/
├── (protected)/     # mise en page authentifiée, protégée par un garde
│   └── ...
├── layout.tsx
├── page.tsx
├── providers.tsx    # QueryClientProvider, thème
└── globals.css
```

| `frontend-b2c`                 | `frontend-b2b`          | `frontend-admin`              |
| ------------------------------ | ----------------------- | ----------------------------- |
| `(protected)/tableau-de-bord`  | `(protected)/dashboard` | `(protected)/tableau-de-bord` |
| `(protected)/rendez-vous`      | `(protected)/agenda`    | `(protected)/cliniques`       |
| `(protected)/rendez-vous/[id]` | —                       | `(protected)/cliniques/[id]`  |
| `(protected)/animaux`          | —                       | `(protected)/proprietaires`   |
| `(protected)/animaux/[id]`     | —                       | `(protected)/personnel`       |
| `(protected)/mon-compte`       | `(protected)/reglages`  | —                             |

Les routes du B2C sont **en français**, y compris `/tableau-de-bord` là où le B2B garde
`/dashboard` : l'URL d'un portail grand public est vue par ses utilisateurs — barre
d'adresse, favoris, lien partagé — celle d'un outil professionnel beaucoup moins.

Le back-office est en français lui aussi, pour une autre raison : la console est en
`noindex`, il n'y a donc aucun enjeu de référencement, et le vocabulaire métier est
français sans équivalent net dans le code (« propriétaires » quand l'API dit `owners`).
Le libellé du menu, le titre de la page et le segment d'URL deviennent alors le **même
mot**, ce qui rend `pageTitleForPath` évident au lieu d'être une table de correspondance
mentale.

Le back-office n'a **pas** de route `register` : aucun compte ne s'y crée en ligne, ils
sont créés par `make create-admin`.

### Le cas particulier de `/register` côté B2C

L'inscription des propriétaires est un parcours en trois étapes
(`components/auth/register/`), et son étape 1 crée le compte **et ouvre la session**. Les
étapes 2 et 3 se déroulent donc connecté, sur cette même page publique.

Conséquence : le `GuestGuard` — dont le rôle est de renvoyer vers `/mon-compte` un
propriétaire déjà connecté — ne peut pas être posé au niveau de la page, il éjecterait la
personne au milieu de son inscription. Il est porté par le wizard lui-même, avec
`enabled={step === 1}`. C'est la seule page du monorepo où ce garde est conditionnel.

## Tailwind v4 : pas de fichier de configuration

Tailwind 4 se configure **dans le CSS**, plus dans un `tailwind.config.js`. Toute la
personnalisation vit donc dans `src/app/globals.css`, et `postcss.config.mjs` se réduit à
un plugin :

```js
export default { plugins: { "@tailwindcss/postcss": {} } };
```

Chercher un `tailwind.config.js` est une perte de temps : il n'y en a pas, et c'est
normal.

## La règle d'interface : shadcn/ui, pas de CSS maison

Le dépôt impose d'utiliser **les composants `shadcn/ui` autant que possible**, avec du
style Tailwind. Les nouveaux composants s'ajoutent par la CLI shadcn, dans
`src/components/ui/`.

Deux conséquences pratiques :

- `src/components/ui/` est du **code amont**, non maintenu ici. Il est exclu de
  l'analyse CodeQL et de la mesure de couverture Vitest, exactement comme le client
  généré par Orval.
- Écrire une feuille de style maison pour un composant qui existe dans shadcn est un
  écart à signaler en revue.

## Ce qui est mutualisé, et ce qui ne l'est pas

**Identiques au caractère près** dans les trois applications : `tsconfig.json`,
`eslint.config.mjs`, `postcss.config.mjs`, `components.json`, `vitest.setup.ts`, et la
liste des dépendances de développement.

**Dupliqués mais différents** : `src/lib/api/generated/` — chaque application possède
sa propre copie du client, régénérée par sa propre commande. Et `src/app/globals.css`,
dont la teinte de marque diffère : émeraude (OKLCH 163) pour le B2C, indigo (277) pour
le B2B, azur (220) pour le back-office — le point le plus équidistant des deux marques
produit, et quasi complémentaire du rouge `destructive`.

**Spécifiques** : tout `src/lib/<domaine>/` (`pets`, `appointments` et `account` côté
B2C ; `agenda`, `scheduling`, `clinic`, `auth` côté B2B ; `table`, `clinics`, `owners`
et `staff` côté back-office).

**La même coquille, transposée** : `AppShell` + `AppSidebar` + `SiteHeader` +
`UserMenu`, avec `lib/navigation.ts` pour source unique des entrées de menu et du titre
de page, et `components/shared/` pour les primitives de mise en page
(`PageContainer`, `PageHeader`, `EmptyState`, `ErrorState`). Une seule différence
assumée : seul le B2B a des **rôles et des permissions**. Un propriétaire voit tout son
espace, et l'autorisation du back-office est binaire ; dans ces deux applications, la
sidebar ne filtre donc rien.

### Les deux largeurs de page

Le `PageContainer` est le **seul endroit** de chaque application où une largeur de page
se décide : `SidebarInset`, au-dessus, est en `w-full flex-1` sans plafond. D'où la règle du
`CLAUDE.md` — un écran ne fixe jamais sa propre largeur.

| Variante | Largeur                   | Pour quoi                                                                      |
| -------- | ------------------------- | ------------------------------------------------------------------------------ |
| défaut   | `max-w-[96rem]` (1536 px) | Écrans denses : tableaux de bord, listes, grille d'animaux, agenda, datatables |
| `narrow` | `max-w-3xl` (768 px)      | Lecture et formulaires : Mon compte, fiche d'un rendez-vous, tunnel, réglages  |

Les trois applications partagent la même largeur dense. Le raisonnement initial — « les listes
d'un particulier sont plus courtes, donc le B2C doit être plus étroit » — confondait la
longueur des listes avec la largeur de la fenêtre : sur un écran de 1920, le B2C laissait
près de 500 px de vide de chaque côté.

Le plafond, lui, reste volontaire. Sans lui, une ligne de rendez-vous s'étirerait sur
2500 px en ultra-large et le vide se déplacerait simplement à l'intérieur du contenu. Les
768 px de la variante étroite sont une limite **typographique** : au-delà d'environ
800 px, l'œil perd la ligne entre le libellé à gauche et la fin du champ à droite.

L'état replié de la sidebar est persisté dans le cookie `sidebar_state`, relu par un
Server Component pour éviter le flash ouvert → replié au rechargement. En développement
local, ce cookie n'est **pas** cloisonné par port : `localhost:3000`, `localhost:3001`
et `localhost:3003` le partagent, replier la sidebar d'une application replie donc celle
des deux autres. Sans conséquence en production, où les domaines diffèrent.

Le partage se fait par duplication assumée, pas par un paquet commun. Un paquet
partagé imposerait un espace de travail npm, avec les inconvénients décrits dans la vue
d'ensemble.

## Deux détails d'implémentation qui méritent d'être connus

### L'« indice de session »

Les cookies sont `HttpOnly` : JavaScript ne peut donc pas savoir si une session existe
autrement qu'en interrogeant l'API. Pour un visiteur qui arrive sur `/login` sans s'être
jamais connecté, cette vérification produit systématiquement deux erreurs rouges dans la
console — un `401` sur `/me`, puis un `401` sur le rafraîchissement tenté par le mutator.

`src/lib/auth/session-hint.ts` pose donc un drapeau dans `localStorage` à la connexion et
le retire à la déconnexion. Le garde public ne lance la vérification que si le drapeau est
présent. Le mécanisme est repris à l'identique dans le B2B et dans le back-office, sous
des clés distinctes.

C'est un **indice, pas une vérité** : les cookies restent la seule autorité. Le drapeau
peut se tromper dans les deux sens sans rien casser — drapeau présent mais cookies
expirés, le garde resynchronise et redirige ; cookies valides mais `localStorage` purgé,
le formulaire s'affiche et se reconnecter fonctionne.

Chaque accès à `localStorage` est protégé par un `try/catch` : en navigation privée ou
avec le stockage bloqué, `localStorage` lève une exception, et l'on se comporte alors
comme si le drapeau n'existait pas. Côté rendu serveur, toutes les fonctions ne font rien.

### La configuration ESLint

Configuration plate (ESLint 10), identique dans les trois applications, avec un seul
réglage manuel :

```js
settings: { react: { version: "19.2" } },
```

ESLint 10 a supprimé `context.getFilename()`, qu'utilise la détection automatique de
`eslint-plugin-react` 7.37 embarqué par `eslint-config-next`. Fixer la version
court-circuite la détection.

Les `globalIgnores` excluent `src/lib/api/generated/**` et `next-env.d.ts` : du code
généré, qu'on ne corrige pas à la main.
