import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { readBilling } from "./billing-config.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { frameworkRoot, readProduct } from "./product-config.mjs";
import {
  BACKEND_REQUIRED_KEYS, CLASSIFIED_KEYS, PROVIDER_GROUPS,
  evaluateProviderRequirements, requiredEnvironmentKeys,
} from "./provider-requirements.mjs";
export { IGNORED_KEYS } from "./provider-requirements.mjs";

// Compatibility exports for callers; requirements are evaluated per product below.
export const REQUIRED_KEYS = requiredEnvironmentKeys(readProduct(), readBilling());
export const FEATURE_KEYS = Object.fromEntries(Object.values(PROVIDER_GROUPS).map(group => [group.label, group.keys.flat()]));

/** Direct backend env reads, excluding tests and generated code. SDK-owned keys
 * such as JWT_PRIVATE_KEY and JWKS are classified in provider-requirements.mjs. */
export function collectBackendEnvKeys(root = frameworkRoot) {
  const keys = new Set();
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) { if (entry.name !== "_generated") walk(path.join(dir, entry.name)); continue; }
      if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) continue;
      const source = fs.readFileSync(path.join(dir, entry.name), "utf8");
      for (const match of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) keys.add(match[1]);
    }
  };
  walk(path.join(root, "convex"));
  return [...keys].sort();
}

export function evaluateDeployment(backendKeys, setNames, config = readProduct(), billing) {
  const present = new Set(setNames);
  const result = evaluateProviderRequirements(config, present, { billing });
  return {
    ...result,
    missingRequired: [...BACKEND_REQUIRED_KEYS.filter(key => !present.has(key)), ...result.missingRequired],
    unclassified: backendKeys.filter(key => !CLASSIFIED_KEYS.has(key)),
  };
}

/** Keep names only, and do not treat blank/whitespace values as configured. */
export function parseEnvListOutput(output) {
  return output.split("\n").flatMap(line => {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    return match && match[2].trim() && !/^(?:"\s*"|'\s*')$/.test(match[2].trim()) ? [match[1]] : [];
  });
}

export function deploymentMain(argv = process.argv.slice(2), run = execFileSync) {
  const prod = argv.includes("--prod");
  let configPath = "hakken.product.json";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prod") continue;
    if (argv[i] === "--config" && argv[i + 1]) configPath = argv[++i];
    else throw new Error("Use --prod and/or --config <file>.");
  }
  const config = readProduct(frameworkRoot, configPath);
  const billing = readBilling(frameworkRoot);
  let output;
  try {
    output = run("npx", ["--no-install", "convex", "env", "list", ...(prod ? ["--prod"] : [])],
      { cwd: frameworkRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 });
  } catch {
    // CLI error output can contain environment values. Never relay it.
    console.error("Could not read deployment environment. Check Convex authentication and deployment selection. No environment values are printed.");
    return 1;
  }
  const result = evaluateDeployment(collectBackendEnvKeys(), parseEnvListOutput(output), config, billing);
  if (result.unclassified.length) console.error("Unclassified backend environment keys: " + result.unclassified.join(", ") + ". Add their requirements to scripts/provider-requirements.mjs.");
  for (const missing of result.missingRequired) console.error("Missing required setting: " + missing);
  for (const { feature } of result.missingFeatures) console.log(feature + ": not required by this product; credentials absent.");
  if (result.missingRequired.length || result.unclassified.length) return 1;
  console.log("Deployment environment (" + (prod ? "production" : "dev") + "): required settings present. Values, provider connectivity, and frontend configuration are not verified by this check.");
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = deploymentMain(); }
  catch { console.error("Cannot validate deployment. Check the options and hakken.product.json; values are not printed."); process.exitCode = 1; }
}
