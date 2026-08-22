/**
 * Configuration Vitest du back-office plateforme.
 *
 * Identique à celle des deux portails (même chaîne esbuild, même alias "@/",
 * même environnement jsdom) : ce qui change, ce sont les seuils de couverture,
 * mesurés sur CETTE application.
 *
 * Ce que ces tests couvrent en priorité : la LOGIQUE PURE — parsing de l'état
 * d'URL des tables, formatage, schémas de validation, traduction des erreurs
 * API. C'est là qu'un test unitaire a le meilleur rapport valeur/coût, et dans
 * un back-office c'est aussi là que vivent les régressions invisibles à l'oeil.
 */
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // Les tests vivent à côté du code testé : on les trouve immédiatement, et
    // supprimer un fichier emporte son test.
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "json-summary", "html"],
      skipFull: true,
      // Sans cela, Vitest EFFACE le rapport dès qu'un test échoue -- la CI
      // n'aurait rien à publier précisément quand on veut les chiffres.
      reportOnFailure: true,
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        // Code généré par Orval : jamais écrit à la main, jamais testé ici.
        "src/lib/api/generated/**",
        // Preset shadcn/ui : code amont, recopié tel quel depuis le B2B.
        "src/components/ui/**",
        "src/**/*.test.{ts,tsx}",
        // Fabriques d'objets de test : outillage, pas code applicatif.
        "src/test/**",
      ],
      // --- Seuils appliqués par la CI, équivalent du fail_under du backend.
      // Remesurés le 22/08/2026, après l'arrivée des datatables :
      // st 81.15 %, br 71.78 %, fn 75.18 %, li 82.19 %.
      // (mesure précédente, back-office réduit à son authentification :
      //  st 73.73 %, br 71.71 %, fn 68.25 %, li 74.73 %)
      // Posés 2 points en dessous (3 pour les branches, dont les compteurs v8
      // bougent au gré de la chaîne de compilation), comme les deux portails.
      //
      // Les seuils MONTENT ici alors que la quantité de code a doublé : les
      // écrans ajoutés sont testés à l'écriture, pas après coup. Ils ne
      // redescendront pas -- une baisse de seuil est un commit dédié, daté et
      // justifié, jamais un ajustement glissé dans la PR qui l'a fait tomber.
      thresholds: {
        statements: 79,
        branches: 68,
        functions: 73,
        lines: 80,
      },
    },
  },
  resolve: {
    // Même alias que tsconfig.json ("@/*" -> "./src/*").
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
});
