/**
 * Configuration du site de documentation VetoLib (Docusaurus 3, TypeScript, 100 % français).
 *
 * Ce que ce fichier décide, et pourquoi :
 *
 * - Le site est publié sur GitHub Pages SOUS UN SOUS-CHEMIN (`/VetLib/`). `url` et `baseUrl`
 *   doivent donc être exacts au caractère près : une erreur ici produit un site en ligne dont
 *   100 % des CSS, JS et images tombent en 404, sans la moindre erreur au build.
 * - Attention au nom : le dossier local s'appelle `VetoLib`, mais le dépôt GitHub s'appelle
 *   `VetLib` (sans le « o »). Toutes les URLs GitHub utilisent `VetLib`.
 * - La référence d'API est construite à partir de `backend/openapi.json`, un fichier GITIGNORÉ
 *   (sortie de `make openapi`) : voir le garde ci-dessous.
 * - `i18n` mono-locale « fr » : cela suffit à activer les traductions françaises fournies par
 *   @docusaurus/theme-translations (barre de navigation, pagination, admonitions...).
 */
import fs from "node:fs";
import path from "node:path";

import type * as Preset from "@docusaurus/preset-classic";
import type { Config, PresetConfig } from "@docusaurus/types";
import { themes as prismThemes } from "prism-react-renderer";

// ---------------------------------------------------------------------------
// Garde : le contrat OpenAPI est-il présent ?
// ---------------------------------------------------------------------------
// `backend/openapi.json` est produit par `make openapi` et volontairement gitignoré
// (cf. le commentaire du .gitignore racine : c'est le client Orval qui est versionné,
// pas le schéma qui l'a produit). Sur un dépôt fraîchement cloné, le fichier n'existe
// donc PAS.
//
// On résout un chemin ABSOLU depuis __dirname, et non la chaîne relative
// '../backend/openapi.json' : le plugin redoc résout les chemins relatifs depuis
// process.cwd(), ce qui casserait un `npm --prefix documentation run build` lancé
// depuis la racine du dépôt.
const OPENAPI_SPEC = path.resolve(__dirname, "..", "backend", "openapi.json");
const hasOpenApi = fs.existsSync(OPENAPI_SPEC);

// Trois comportements volontairement différents :
//
//  1. Fichier présent         -> le preset redocusaurus est monté, la route /api existe.
//  2. Fichier absent EN LOCAL -> avertissement, le preset et l'entrée de navigation sont
//                                retirés, et `npm start` / `npm run build` réussissent.
//                                Motif : corriger une faute de frappe dans un .md ne doit
//                                pas obliger à installer uv, Python et le backend.
//  3. Fichier absent EN CI    -> ÉCHEC IMMÉDIAT avec un message actionnable. Motif : le site
//                                publié ne doit JAMAIS perdre silencieusement sa référence
//                                d'API. L'échappatoire DOCS_SKIP_OPENAPI=1 reste possible.
const skipOpenApi = process.env.DOCS_SKIP_OPENAPI === "1";

if (!hasOpenApi && !skipOpenApi && process.env.CI === "true") {
  throw new Error(
    [
      `Contrat OpenAPI introuvable : ${OPENAPI_SPEC}`,
      "Ce fichier est gitignoré (sortie de `make openapi`) : il doit être généré AVANT",
      "de construire la documentation.",
      "",
      "  make openapi        # depuis la racine du dépôt",
      "",
      "Pour construire la documentation sans la référence API : DOCS_SKIP_OPENAPI=1",
    ].join("\n"),
  );
}

if (!hasOpenApi) {
  console.warn(
    "\n[VetoLib] backend/openapi.json absent : la référence API (/api) ne sera pas générée." +
      "\n          Lancez `make openapi` à la racine du dépôt pour l'obtenir.\n",
  );
}

const GITHUB_URL = "https://github.com/kederiku/VetLib";

const config: Config = {
  title: "VetoLib",
  tagline:
    "La documentation technique du SaaS de gestion de cliniques vétérinaires",
  favicon: "img/favicon.svg",

  // --- Publication ----------------------------------------------------------
  url: "https://kederiku.github.io",
  baseUrl: "/VetLib/",
  organizationName: "kederiku",
  projectName: "VetLib",
  // GitHub Pages ajoute un slash final par défaut. La documentation Docusaurus
  // recommande de trancher explicitement (true ou false, jamais undefined).
  trailingSlash: false,

  // --- Garde-fous -----------------------------------------------------------
  // Trois de ces quatre réglages sont PLUS STRICTS que les défauts de Docusaurus 3,
  // qui se contentent d'un avertissement. Sans eux, le job CI « documentation »
  // serait vert alors que le site publié contient des liens et des ancres morts :
  // exactement ce qu'on lui demande d'attraper.
  onBrokenLinks: "throw",
  onBrokenAnchors: "throw",
  onDuplicateRoutes: "throw",

  i18n: {
    defaultLocale: "fr",
    locales: ["fr"],
  },

  // --- Options à venir dans Docusaurus v4 -----------------------------------
  // v4     : on adopte dès maintenant le comportement de la prochaine majeure
  //          (couches CSS en cascade, cloisonnement du stockage local, génération
  //          statique en threads) pour que la migration soit un non-événement.
  // faster : bascule le build sur Rspack + SWC + Lightning CSS. C'est le réglage
  //          du modèle officiel de Docusaurus depuis la 3.10.
  //          En cas de build inexplicablement cassé, isoler avec
  //          `faster: { rspackBundler: false }` avant de chercher ailleurs.
  future: {
    v4: true,
    faster: true,
  },

  markdown: {
    // 'detect' : les .md sont compilés en CommonMark PUR, seuls les .mdx passent par MDX.
    // Sans cela (défaut 'mdx'), TOUT .md est du JSX : un « < » ou un « { » dans une phrase
    // française (« annulation < 24 h », « le paramètre {clinic_id} ») casse le build avec
    // un message de parseur illisible. On écrit donc en .md par défaut, et on ne passe en
    // .mdx que sur les rares pages qui ont besoin de composants React.
    format: "detect",
    mermaid: true,
    hooks: {
      // Depuis la 3.9, ces réglages vivent sous markdown.hooks : les clés de premier
      // niveau sont dépréciées.
      onBrokenMarkdownLinks: "throw",
      onBrokenMarkdownImages: "throw",
    },
  },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          routeBasePath: "docs",
          editUrl: `${GITHUB_URL}/tree/main/documentation/`,
          // Lit l'historique git : exige un checkout complet (fetch-depth: 0) en CI,
          // sinon toutes les pages affichent la même date.
          showLastUpdateTime: true,
          // Un seul contributeur : afficher l'auteur n'apporte aucune information.
          showLastUpdateAuthor: false,
          breadcrumbs: true,
        },
        // Site de documentation pure : pas de rubrique à alimenter. Le journal des
        // évolutions du projet, ce sont les Pull Requests et l'historique git.
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
        sitemap: {
          lastmod: "date",
          changefreq: "weekly",
          priority: 0.5,
          // La page de recherche et la référence Redoc n'ont aucune valeur pour un
          // moteur de recherche : l'une est vide sans JavaScript, l'autre est un
          // rendu côté navigateur.
          ignorePatterns: ["/search", "/api/**"],
        },
      } satisfies Preset.Options,
    ],
    // Référence d'API interactive, rendue par Redoc à partir du contrat OpenAPI du
    // backend. Le preset n'est monté que si le fichier existe (voir le garde en tête
    // de ce fichier) : sinon Docusaurus prendrait le chemin pour une URL distante et
    // échouerait sur un message incompréhensible.
    //
    // La route vit sous /api, DÉLIBÉRÉMENT hors de /docs : Redoc embarque plusieurs
    // mégaoctets de JavaScript qu'on ne veut charger que sur cette page.
    ...(hasOpenApi
      ? ([
          [
            "redocusaurus",
            {
              specs: [
                {
                  id: "vetolib-api",
                  spec: OPENAPI_SPEC,
                  route: "/api/",
                },
              ],
              theme: {
                primaryColor: "#0f766e",
                primaryColorDark: "#2dd4bf",
              },
            },
          ],
        ] satisfies PresetConfig[])
      : []),
  ],

  themes: [
    "@docusaurus/theme-mermaid",
    [
      // Recherche entièrement hors ligne : l'index est construit au build et servi avec
      // le site. Aucun compte Algolia, aucune requête vers un tiers, et la recherche
      // fonctionne même sur un site consulté sans réseau.
      //
      // Déclaré dans `themes` et non dans `plugins` : c'est ainsi qu'il REMPLACE la
      // barre de recherche Algolia embarquée par preset-classic.
      "@easyops-cn/docusaurus-search-local",
      {
        // ['fr', 'en'] et non ['fr'] seul : la documentation est française mais truffée
        // de termes techniques anglais (outbox, tenant, refresh token). Avec les deux
        // langues, lunr applique les DEUX racinisateurs : « migrations » trouve
        // « migration », et « tenanted » trouve « tenant ».
        language: ["fr", "en"],
        indexDocs: true,
        // Pas de blog sur ce site : sans ce réglage, le plugin cherche un dossier absent.
        indexBlog: false,
        indexPages: true,
        docsRouteBasePath: "/docs",
        // L'empreinte de l'index va dans le NOM du fichier. Le CDN de GitHub Pages cache
        // agressivement : avec une empreinte en paramètre d'URL, un index périmé pourrait
        // être servi après un déploiement, et la recherche deviendrait silencieusement
        // obsolète.
        hashed: "filename",
        highlightSearchTermsOnTargetPage: true,
        searchResultLimits: 10,
        searchResultContextMaxLength: 80,
        explicitSearchResultPath: true,
      },
    ],
  ],

  themeConfig: {
    image: "img/vetolib-social-card.png",
    metadata: [
      {
        name: "keywords",
        content:
          "vetolib, vétérinaire, saas, fastapi, next.js, ddd, hexagonal, multi-tenant, rls, postgresql",
      },
      {
        name: "description",
        content:
          "Documentation technique de VetoLib : architecture hexagonale, DDD, multi-tenant PostgreSQL RLS, FastAPI et Next.js.",
      },
    ],
    colorMode: {
      defaultMode: "light",
      respectPrefersColorScheme: true,
    },
    docs: {
      sidebar: { hideable: true, autoCollapseCategories: true },
    },
    tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 4 },

    navbar: {
      title: "VetoLib",
      logo: { alt: "Logo VetoLib", src: "img/logo.svg" },
      items: [
        {
          type: "docSidebar",
          sidebarId: "documentationSidebar",
          position: "left",
          label: "Documentation",
        },
        {
          type: "doc",
          docId: "architecture/vue-d-ensemble",
          position: "left",
          label: "Architecture",
        },
        {
          type: "doc",
          docId: "adr/index",
          position: "left",
          label: "Décisions (ADR)",
        },
        // Ajoutée seulement si la route /api existe : sinon `onBrokenLinks: 'throw'`
        // ferait échouer le build sur un dépôt où `make openapi` n'a pas été lancé.
        ...(hasOpenApi
          ? [{ to: "/api/", label: "Référence API", position: "left" as const }]
          : []),
        { href: GITHUB_URL, label: "GitHub", position: "right" },
      ],
    },

    footer: {
      style: "dark",
      links: [
        {
          title: "Démarrer",
          items: [
            { label: "Installation", to: "/docs/demarrer/installation" },
            {
              label: "Première exécution",
              to: "/docs/demarrer/premiere-execution",
            },
            { label: "Le Makefile", to: "/docs/demarrer/commandes-make" },
          ],
        },
        {
          title: "Comprendre",
          items: [
            {
              label: "Architecture hexagonale",
              to: "/docs/architecture/architecture-hexagonale",
            },
            {
              label: "Multi-tenant et RLS",
              to: "/docs/architecture/multi-tenant-et-rls",
            },
            { label: "Décisions d'architecture", to: "/docs/adr" },
          ],
        },
        {
          title: "Projet",
          items: [
            { label: "Dépôt GitHub", href: GITHUB_URL },
            {
              label: "Pipeline CI",
              href: `${GITHUB_URL}/actions/workflows/ci.yml`,
            },
            {
              label: "Signaler un problème",
              href: `${GITHUB_URL}/issues/new/choose`,
            },
          ],
        },
      ],
      copyright: "VetoLib — documentation construite avec Docusaurus.",
    },

    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      // python, json, yaml, tsx et markdown sont DÉJÀ dans le paquet de base de
      // prism-react-renderer. Ceux-ci ne le sont pas et doivent être chargés depuis
      // prismjs.
      additionalLanguages: [
        "bash",
        "sql",
        "diff",
        "docker",
        "ini",
        "toml",
        "makefile",
      ],
    },

    mermaid: {
      theme: { light: "neutral", dark: "dark" },
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
