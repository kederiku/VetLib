/**
 * Configuration Orval : génération du client API typé du portail B2C.
 *
 * Chaîne complète : FastAPI publie son schéma OpenAPI sur
 * http://localhost:8000/openapi.json -> `npm run generate:api` (alias de
 * `orval --config orval.config.ts`) lit ce schéma et génère dans
 * src/lib/api/generated des hooks TanStack Query typés (un par endpoint).
 * Le backend doit donc tourner (docker compose up -d) au moment de générer.
 *
 * Le nom de chaque hook vient de l'`operation_id` déclaré côté FastAPI :
 * c'est pour cela que la convention backend impose un operation_id explicite
 * sur chaque route. Le dossier generated/ est committé mais JAMAIS édité à la
 * main : toute modification serait écrasée à la prochaine génération. Après
 * tout changement d'endpoint, relancer `npm run generate:api` dans les DEUX
 * frontends (b2c et b2b ont chacun leur copie du client).
 */
import { defineConfig } from "orval";

export default defineConfig({
  vetolib: {
    input: { target: "http://localhost:8000/openapi.json" },
    output: {
      target: "src/lib/api/generated",
      // "tags-split" : un sous-dossier par tag OpenAPI (auth, clinics...),
      // ce qui reflète le découpage en bounded contexts du backend.
      mode: "tags-split",
      // client "react-query" : Orval génère des hooks useQuery/useMutation
      // prêts à l'emploi (cache, invalidation, états loading/error) plutôt
      // que de simples fonctions fetch à orchestrer soi-même.
      client: "react-query",
      // httpClient "fetch" : le code généré s'appuie sur fetch natif (pas
      // d'axios), via notre mutator custom ci-dessous.
      httpClient: "fetch",
      // clean : vide generated/ avant chaque génération, pour que les
      // endpoints supprimés côté backend disparaissent aussi du client.
      clean: true,
      // Pas d'override.query : les défauts Orval sont corrects
      // (GET -> useQuery, non-GET -> useMutation). Forcer les deux à true
      // génèrerait des hooks useQuery sur les POST.
      override: {
        // Mutator custom : chaque appel généré passe par customFetch, qui
        // préfixe l'URL de l'API et surtout envoie credentials: "include"
        // pour joindre les cookies JWT HttpOnly (voir src/lib/api/mutator.ts).
        // Sans lui, fetch n'enverrait pas les cookies vers l'API (cross-origin
        // localhost:3000 -> localhost:8000) et toute route protégée
        // répondrait 401.
        mutator: { path: "src/lib/api/mutator.ts", name: "customFetch" },
      },
    },
    // Post-traitement : reformate les fichiers générés avec Prettier pour que
    // le dossier committé reste stable (diffs lisibles en revue).
    hooks: { afterAllFilesWrite: "prettier --write" },
  },
});
