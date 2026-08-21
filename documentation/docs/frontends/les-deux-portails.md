---
sidebar_position: 1
title: "Les deux portails Next.js"
description: "B2C et B2B : périmètres, App Router et socle d'interface."
keywords: [next.js, app router, shadcn, tailwind, b2b, b2c]
---

# Les deux portails Next.js

## Deux applications, deux publics

|                           | `frontend-b2c`                   | `frontend-b2b`                   |
| ------------------------- | -------------------------------- | -------------------------------- |
| Nom npm                   | `vetolib-portal`                 | `vetolib-clinic`                 |
| Port                      | 3000                             | 3001                             |
| Public                    | Propriétaires d'animaux          | Personnel de clinique            |
| Espace d'authentification | `/api/v1/owner/auth/*`           | `/api/v1/auth/*`                 |
| Image publiée             | `ghcr.io/kederiku/vetlib-portal` | `ghcr.io/kederiku/vetlib-clinic` |

Ce sont **deux projets npm indépendants**, chacun avec son `package-lock.json`. Voir
[Vue d'ensemble du monorepo](../architecture/vue-d-ensemble.md#pourquoi-un-monorepo-sans-espace-de-travail-npm).

## Le socle technique

Identique des deux côtés :

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

Le B2B ajoute deux dépendances que le B2C n'a pas : `next-themes` (bascule clair/sombre)
et `sonner` (notifications éphémères).

:::note TypeScript reste en 6.x
Une contrainte du projet, inscrite dans `CLAUDE.md` et verrouillée dans
`dependabot.yml` : **TypeScript 7 casse typescript-eslint**. La majeure est ignorée par
Dependabot dans les trois projets npm.
:::

## L'organisation des routes

Les deux applications utilisent le même découpage par **groupes de routes** — les
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

| `frontend-b2c`            | `frontend-b2b`          |
| ------------------------- | ----------------------- |
| `(protected)/animaux`     | `(protected)/dashboard` |
| `(protected)/rendez-vous` | `(protected)/agenda`    |
| `(protected)/account`     | `(protected)/reglages`  |

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

**Identiques au caractère près** entre les deux portails : `tsconfig.json`,
`eslint.config.mjs`, `postcss.config.mjs`, `components.json`, `vitest.setup.ts`, et la
liste des dépendances de développement.

**Dupliqués mais différents** : `src/lib/api/generated/` — chaque portail possède sa
propre copie du client, régénérée par sa propre commande.

**Spécifiques** : tout `src/lib/<domaine>/` (`pets` et `appointments` côté B2C ; `agenda`,
`scheduling`, `clinic`, `auth` côté B2B).

Le partage se fait par duplication assumée, pas par un paquet commun. Un paquet
partagé imposerait un espace de travail npm, avec les inconvénients décrits dans la vue
d'ensemble.

## Deux détails d'implémentation qui méritent d'être connus

### L'« indice de session » du portail B2B

Les cookies sont `HttpOnly` : JavaScript ne peut donc pas savoir si une session existe
autrement qu'en interrogeant l'API. Pour un visiteur qui arrive sur `/login` sans s'être
jamais connecté, cette vérification produit systématiquement deux erreurs rouges dans la
console — un `401` sur `/me`, puis un `401` sur le rafraîchissement tenté par le mutator.

`src/lib/auth/session-hint.ts` pose donc un drapeau dans `localStorage` à la connexion et
le retire à la déconnexion. Le garde public ne lance la vérification que si le drapeau est
présent.

C'est un **indice, pas une vérité** : les cookies restent la seule autorité. Le drapeau
peut se tromper dans les deux sens sans rien casser — drapeau présent mais cookies
expirés, le garde resynchronise et redirige ; cookies valides mais `localStorage` purgé,
le formulaire s'affiche et se reconnecter fonctionne.

Chaque accès à `localStorage` est protégé par un `try/catch` : en navigation privée ou
avec le stockage bloqué, `localStorage` lève une exception, et l'on se comporte alors
comme si le drapeau n'existait pas. Côté rendu serveur, toutes les fonctions ne font rien.

### La configuration ESLint

Configuration plate (ESLint 10), identique dans les deux portails, avec un seul réglage
manuel :

```js
settings: { react: { version: "19.2" } },
```

ESLint 10 a supprimé `context.getFilename()`, qu'utilise la détection automatique de
`eslint-plugin-react` 7.37 embarqué par `eslint-config-next`. Fixer la version
court-circuite la détection.

Les `globalIgnores` excluent `src/lib/api/generated/**` et `next-env.d.ts` : du code
généré, qu'on ne corrige pas à la main.
