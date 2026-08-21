/**
 * Configuration Vitest : les tests unitaires du portail B2C (propriétaires d'animaux).
 *
 * Vitest est le lanceur de tests de l'écosystème Vite : il réutilise la même
 * chaîne de compilation (esbuild) que Next, donc il comprend TypeScript, JSX et
 * l'alias "@/" sans transpilation supplémentaire. Aucun plugin React n'est
 * nécessaire : esbuild compile le JSX nativement grâce au "jsx": "react-jsx"
 * du tsconfig.json.
 *
 * Ce que ces tests couvrent : la LOGIQUE PURE (calculs de créneaux, formatage
 * de dates, permissions, schémas de validation, traduction des erreurs API).
 * C'est là qu'un test unitaire a le meilleur rapport valeur/coût : la fonction
 * est déterministe, le test est rapide, et la régression serait invisible à
 * l'oeil nu dans l'interface.
 */
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // jsdom simule un navigateur (document, window) : indispensable dès qu'un
    // test touche un composant React ou un hook.
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // Les tests vivent à côté du code qu'ils testent (layout.ts / layout.test.ts) :
    // on les trouve immédiatement, et un fichier supprimé emporte son test.
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      // Sortie console : le tableau par fichier est LE diagnostic quand la CI
      // passe au rouge, le resume donne le chiffre global. json-summary
      // alimente le resume de la Pull Request, html sert a voir quelles lignes
      // manquent (coverage/index.html, deja gitignore).
      reporter: ["text", "text-summary", "json-summary", "html"],
      // Masque les fichiers integralement couverts, comme skip_covered cote
      // backend. Declare explicitement : Vitest l'active tout seul quand il
      // detecte un agent, ce qui ferait diverger la sortie entre un poste de
      // developpement et la CI.
      skipFull: true,
      // Sans cela, Vitest EFFACE le rapport des qu'un test echoue -- la CI
      // n'aurait rien a publier precisement dans le cas ou l'on veut les
      // chiffres.
      reportOnFailure: true,
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        // Code généré par Orval : jamais écrit à la main, donc jamais testé ici.
        "src/lib/api/generated/**",
        // Composants installés via la CLI shadcn/ui : code amont.
        "src/components/ui/**",
        "src/**/*.test.{ts,tsx}",
        // Fabriques d'objets de test : outillage, pas code applicatif.
        "src/test/**",
      ],
      // --- Seuils appliques par la CI, equivalent du fail_under du backend.
      // Mesure de reference au moment de leur mise en place (21/08/2026) :
      // st 64.7 %, br 63.2 %, fn 60.66 %, li 65.42 %.
      // Les seuils sont poses 2 points en dessous (3 pour branches, dont les
      // compteurs v8 bougent au gre de la chaine de compilation). A remonter
      // quand la couverture reelle progresse : voir la section CI/CD du README.
      //
      // Un seul jeu de seuils GLOBAL, volontairement : des seuils par dossier
      // demanderaient une mesure par dossier, et poser des chiffres non
      // mesures les rendrait indiscernables de chiffres negocies.
      thresholds: {
        statements: 62,
        branches: 60,
        functions: 58,
        lines: 63,
      },
    },
  },
  resolve: {
    // Même alias que tsconfig.json ("@/*" -> "./src/*"), sinon les imports
    // "@/lib/..." des fichiers testés seraient introuvables.
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
});
