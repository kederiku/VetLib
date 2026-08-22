import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    // ESLint 10 a supprimé context.getFilename(), utilisé par la détection
    // automatique ("detect") d'eslint-plugin-react 7.37 (embarqué par
    // eslint-config-next). On fixe la version de React explicitement pour
    // court-circuiter la détection.
    settings: { react: { version: "19.2" } },
  },
  globalIgnores([
    "src/lib/api/generated/**",
    ".next/**",
    "node_modules/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
