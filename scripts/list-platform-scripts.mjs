import fs from "node:fs";
import path from "node:path";

/**
 * Prints the platform npm scripts.
 *
 * `npm run` lists all 132 scripts, of which 101 belong to the movement demo, so
 * the handful a developer actually needs day to day are buried. This shows only
 * those, grouped, and points at the demo prefix for the rest.
 */

const packageJson = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
);
const scripts = packageJson.scripts ?? {};

const GROUPS = [
  {
    title: "Develop",
    entries: ["dev", "convex:dev", "verify:env", "setup:validate"],
  },
  {
    title: "Verify (run these before asking for review)",
    entries: ["check", "lint", "typecheck", "test:run", "build"],
  },
  {
    title: "Coverage and end-to-end",
    entries: ["test:coverage", "coverage:check", "test:e2e", "gate"],
  },
  {
    title: "Local data and auth",
    entries: ["auth:local:seed", "auth:local:state", "demo:local:seed"],
  },
  {
    title: "Template",
    entries: ["template:build", "template:verify", "product:init", "feature:generate", "product:recipe", "framework:update"],
  },
];

const DESCRIPTIONS = {
  "product:recipe": "Preview a product recipe; --list shows the catalog",
  "framework:update": "Compare a fresh framework export and prepare an explicit review",
  "feature:generate": "Preview a complete tenant feature; --apply writes it locally",
  "product:init": "Preview product configuration; --apply updates a clone",
  dev: "Start the Next.js dev server",
  "convex:dev": "Start the Convex backend and keep types in sync",
  "verify:env": "Check local environment variables",
  "setup:validate": "Validate setup and provider readiness (no secrets printed)",
  check: "verify:env + lint + typecheck + tests — the usual pre-review gate",
  lint: "ESLint (warnings shown, errors fail)",
  typecheck: "TypeScript, no emit",
  "test:run": "Vitest once",
  build: "Production build",
  "test:coverage": "Vitest with coverage",
  "coverage:check": "Enforce platform coverage thresholds (demo reported, not gated)",
  "test:e2e": "Playwright browser tests",
  gate: "Everything, including browser tests and coverage",
  "auth:local:seed": "Seed local test auth users",
  "auth:local:state": "Show local test auth state",
  "demo:local:seed": "Seed a local demo tenant",
  "template:build": "Write a framework + Arcade copy to --out <new-dir>; --dry-run previews it",
  "template:verify": "Install and verify isolated framework/optional-module copies",
};

const all = Object.keys(scripts);
const movement = all.filter((name) => name.startsWith("movement:"));

console.log("\nHakken platform scripts\n");

for (const group of GROUPS) {
  const available = group.entries.filter((name) => name in scripts);
  if (available.length === 0) continue;

  console.log(`  ${group.title}`);
  for (const name of available) {
    console.log(`    npm run ${name.padEnd(16)} ${DESCRIPTIONS[name] ?? ""}`.trimEnd());
  }
  console.log("");
}

const listed = new Set(GROUPS.flatMap((group) => group.entries));
const other = all.filter(
  (name) =>
    !listed.has(name) &&
    !name.startsWith("movement:") &&
    !name.startsWith("pre") &&
    !name.startsWith("eval:movement"),
);

if (other.length > 0) {
  console.log("  Other");
  for (const name of other) console.log(`    npm run ${name}`);
  console.log("");
}

if (movement.length > 0) console.log(
  `  ${movement.length} movement demo scripts are prefixed "movement:" — run \`npm run movement\` for a grouped index of them.\n`,
);
