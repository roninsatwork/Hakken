import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Keep previously cleaned warning categories as hard failures.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": "error",
      "prefer-const": "error",
      "react/no-unescaped-entities": "error",
      "react-hooks/purity": "error",
      "react-hooks/refs": "error",
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/static-components": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "node_modules/**",
    "coverage/**",
    "playwright-report/**",
    "next-env.d.ts",
    "tsconfig.tsbuildinfo",
    "convex/_generated/**",
    "adk-python/**",
    // Gitignored local scratch (movement proof runs, generated bundles).
    // Linting it produced warnings nobody can act on and forced Babel to
    // deoptimise on >500KB generated bundles.
    "tmp/**",
  ]),
]);

export default eslintConfig;
