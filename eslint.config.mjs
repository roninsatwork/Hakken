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
      // Cleaned 2026-08-16 (121 warnings, mostly imports left behind when the
      // Convex wrappers replaced the raw query/mutation builders) and ratcheted
      // here so they cannot drift back. An underscore prefix still means "this
      // one is deliberately not used" — the idiom for dropping a field with a
      // rest spread, or for a signature a caller dictates.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    // Browser code must not import a Convex module that defines functions.
    //
    // Importing one value from such a module pulls the whole module — every
    // query and mutation in it, plus everything it imports — into the client
    // bundle. Convex logs "Convex functions should not be imported in the
    // browser" for each one and has said it will throw in a future version, so
    // the cost of letting this through is a page that stops loading on an
    // upgrade. It happened once already: two skills screens borrowed their
    // "max 2" cap from agentSkills.ts and companySkills.ts and put 48 errors a
    // reload into the dev log.
    //
    // Shared values belong in a module that defines no Convex functions:
    // `convex/utils/*` (see utils/skillLimits.ts) or a `convex/*Service.ts`.
    // Both are allowed below. Type-only imports are allowed everywhere because
    // they are erased before the bundle is built.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              // Anything directly under convex/ except the two shared homes
              // (utils/, _generated/) and the *Service helpers. Written as a
              // regex rather than a glob group because glob negation follows
              // gitignore rules, where excluding `@/convex/*` also excludes the
              // `utils` directory and nothing can re-include inside it.
              regex: "^@/convex/(?!utils/|_generated/)(?!.*Service$).*",
              allowTypeImports: true,
              message:
                "This Convex module defines queries/mutations, so importing it ships the backend to the browser. Move the shared value into convex/utils/ and import it from there.",
            },
          ],
        },
      ],
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
    // Gitignored local scratch (movement proof runs, generated bundles).
    // Linting it produced warnings nobody can act on and forced Babel to
    // deoptimise on >500KB generated bundles.
    "tmp/**",
    // Git worktrees are a second checkout of this same repo. Linting them
    // reports every existing problem a second time, against a path nobody
    // edits, and buries the real output — one worktree turned 103 warnings
    // into 19,459 problems.
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
