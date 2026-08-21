/**
 * Configuration Vitest : les tests unitaires du espace clinique B2B.
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
      reporter: ["text", "text-summary"],
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
    },
  },
  resolve: {
    // Même alias que tsconfig.json ("@/*" -> "./src/*"), sinon les imports
    // "@/lib/..." des fichiers testés seraient introuvables.
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
});
