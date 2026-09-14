import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildTemplate, checkCombinations, loadKnownVerticals } from "./strip-verticals.mjs";

/** Explicit, local verification. Never deploys, commits, pushes or uses copied secrets. */
const root = process.cwd();
const args = process.argv.slice(2);
let selectedCase;
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--case") {
    selectedCase = args[++index];
    if (!selectedCase || selectedCase.startsWith("--")) throw new Error("--case requires a module name");
  } else if (!["--matrix", "--browser"].includes(args[index])) {
    throw new Error("Usage: npm run template:verify -- [--matrix | --case <module>] [--browser]");
  }
}
const availableCases = ["base", ...[...loadKnownVerticals(root)].filter(name => name !== "arcade")];
if (selectedCase && !availableCases.includes(selectedCase)) throw new Error(`Unknown verification case: ${selectedCase}`);
if (selectedCase && args.includes("--matrix")) throw new Error("Choose --matrix or --case, not both");
if (selectedCase && selectedCase !== "base" && args.includes("--browser")) {
  throw new Error("Browser checks cover the base copy; use --case base or --matrix with --browser");
}
const boundaries = checkCombinations(root);
if (boundaries.errors.length) throw new Error(boundaries.errors.join("\n"));
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sonae-template-verify-"));
const cases = args.includes("--matrix") ? availableCases : [selectedCase ?? "base"];
console.log(`Verification copies and logs: ${workspace}`);
const environment = {
  ...process.env,
  NEXT_PUBLIC_CONVEX_URL: "https://e2e-placeholder.convex.cloud",
  CONVEX_SITE_URL: "https://e2e-placeholder.convex.site",
};
// A verification build cannot inherit the caller's auth bypass or upload source maps.
for (const name of ["E2E_AUTH_ENABLED", "NEXT_PUBLIC_E2E_AUTH_ENABLED", "SENTRY_AUTH_TOKEN", "CONVEX_DEPLOY_KEY"]) delete environment[name];

function run(directory, label, command, commandArgs) {
  console.log(`${path.basename(directory)}: ${label}`);
  const log = path.join(workspace, `${path.basename(directory)}-${label}.log`);
  const output = fs.openSync(log, "w");
  let result;
  try {
    result = spawnSync(command, commandArgs, {
      cwd: directory, env: environment, stdio: ["ignore", output, output],
    });
  } finally { fs.closeSync(output); }
  if (result.status !== 0) throw new Error(`${label} failed: ${log}${result.error ? ` (${result.error.message})` : ""}`);
}

for (const name of cases) {
  const directory = path.join(workspace, name);
  const result = buildTemplate(root, [name], directory);
  if (result.errors.length) throw new Error(result.errors.join("\n"));
  run(directory, "install", "npm", ["ci", "--no-audit", "--no-fund"]);
  run(directory, "check", "npm", ["run", "check"]);
  run(directory, "build", "npm", ["run", "build"]);
  if (name === "base" && args.includes("--browser")) {
    run(directory, "browser", "npm", ["run", "test:e2e:smoke", "--", "--reporter=line"]);
    run(directory, "arcade", "npx", ["playwright", "test", "--config", "playwright.arcade.config.ts",
      "--grep", "art review|touch viewport", "--reporter=line"]);
  }
  // Copies and logs remain inspectable, without accumulating gigabytes of dependencies.
  fs.rmSync(path.join(directory, "node_modules"), { recursive: true, force: true });
}
console.log(`Passed ${cases.length} generated application${cases.length === 1 ? "" : "s"}. Arcade retained in every case. Evidence: ${workspace}`);
