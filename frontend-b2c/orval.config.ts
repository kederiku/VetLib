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
      override: {
        mutator: { path: "src/lib/api/mutator.ts", name: "customFetch" },
        query: { useQuery: true, useMutation: true },
      },
    },
    hooks: { afterAllFilesWrite: "prettier --write" },
  },
});
