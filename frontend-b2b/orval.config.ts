/**
 * Configuration Orval : génération du client API typé du portail B2B.
 *
 * Principe : le backend FastAPI expose son contrat OpenAPI ; Orval le lit et
 * génère dans src/lib/api/generated des hooks TanStack Query (useQuery /
 * useMutation) typés de bout en bout. Le frontend ne code donc JAMAIS ses
 * appels HTTP à la main : il consomme des hooks dont les noms viennent des
 * `operation_id` déclarés sur chaque route FastAPI (d'où la convention
 * backend "toujours un operation_id explicite").
 *
 * Workflow : après tout changement d'endpoint côté backend, relancer
 * `npm run generate:api` dans les DEUX frontends (b2c et b2b). La sortie
 * est committée mais ne s'édite jamais à la main.
 */
import { defineConfig } from "orval";

export default defineConfig({
  vetolib: {
    // Source du contrat : l'OpenAPI servi par le backend lancé en local.
    // Il faut donc que l'API tourne (docker compose up -d) pour générer.
    input: { target: "http://localhost:8000/openapi.json" },
    output: {
      target: "src/lib/api/generated",
      // "tags-split" : un sous-dossier par tag OpenAPI (auth, clinics...),
      // ce qui calque l'organisation par bounded context du backend.
      mode: "tags-split",
      // Hooks TanStack Query (et non un simple client axios/fetch brut).
      client: "react-query",
      // Sous le hook, les requêtes passent par fetch natif (pas d'axios) ;
      // fetch est remplacé par notre mutator (voir override plus bas).
      httpClient: "fetch",
      // Purge le dossier avant chaque génération : les endpoints supprimés
      // côté backend disparaissent aussi côté frontend (pas de code mort).
      clean: true,
      // Pas d'override.query : les défauts Orval sont corrects
      // (GET -> useQuery, non-GET -> useMutation). Forcer les deux à true
      // génèrerait des hooks useQuery sur les POST.
      override: {
        // Toutes les requêtes générées passent par customFetch : c'est là
        // qu'on ajoute credentials: "include" pour transmettre les cookies
        // JWT HttpOnly (l'auth VetoLib ne met jamais de token dans un body).
        mutator: { path: "src/lib/api/mutator.ts", name: "customFetch" },
      },
    },
    // Reformate les fichiers générés pour que le diff committé reste stable
    // d'une génération à l'autre (et passe le lint sans retouche manuelle).
    hooks: { afterAllFilesWrite: "prettier --write" },
  },
});
