/**
 * Configuration Orval : génération du client API typé du back-office.
 *
 * Identique à celle des deux portails, et volontairement : un seul contrat
 * OpenAPI, un seul mode de génération, un seul mutator. Les hooks portent le
 * nom des `operation_id` déclarés côté FastAPI (d'où la convention backend
 * « toujours un operation_id explicite »).
 *
 * Workflow : après tout changement d'endpoint, relancer `make generate-api`,
 * qui régénère les TROIS frontends. La sortie est committée et ne s'édite
 * jamais à la main ; le job CI `client API a jour` la vérifie.
 *
 * Conséquence assumée : cette application génère TOUT le client (auth du
 * personnel, propriétaires, agenda…), pas seulement les tags `admin-*`. Un
 * seul schéma, `mode: tags-split` sans filtre. C'est du code mort, élagué au
 * build et exclu d'ESLint, de CodeQL et de la couverture — et réciproquement,
 * les deux portails embarquent les hooks admin qu'ils n'appelleront jamais.
 */
import { defineConfig } from "orval";

export default defineConfig({
  vetolib: {
    // L'API doit tourner en local (make up) pour que la génération marche.
    input: { target: "http://localhost:8000/openapi.json" },
    output: {
      target: "src/lib/api/generated",
      // Un sous-dossier par tag OpenAPI, ce qui calque l'organisation par
      // bounded context du backend.
      mode: "tags-split",
      client: "react-query",
      httpClient: "fetch",
      // Purge le dossier avant chaque génération : un endpoint supprimé côté
      // backend disparaît aussi ici (pas de code mort qui traîne).
      clean: true,
      override: {
        // Toutes les requêtes passent par customFetch : c'est là qu'on ajoute
        // credentials: "include" pour transmettre les cookies HttpOnly.
        mutator: { path: "src/lib/api/mutator.ts", name: "customFetch" },
      },
    },
    hooks: { afterAllFilesWrite: "prettier --write" },
  },
});
