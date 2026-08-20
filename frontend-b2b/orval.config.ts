import { defineConfig } from "orval";

export default defineConfig({
  vetolib: {
    input: { target: "http://localhost:8000/openapi.json" },
    output: {
      target: "src/lib/api/generated",
      mode: "tags-split",
      client: "react-query",
      httpClient: "fetch",
      clean: true,
      // Pas d'override.query : les défauts Orval sont corrects
      // (GET -> useQuery, non-GET -> useMutation). Forcer les deux à true
      // génèrerait des hooks useQuery sur les POST.
      override: {
        mutator: { path: "src/lib/api/mutator.ts", name: "customFetch" },
      },
    },
    hooks: { afterAllFilesWrite: "prettier --write" },
  },
});
