import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Checks a Convex deployment's environment variables against what the backend
 * actually reads (maintenance plan M2.2).
 *
 * The old setup script provisioned 10 of the 44 keys the code consumes, and a
 * missing key fails as a feature that silently does nothing — no error, no
 * log, just an agent that never researches or a phone line that never rings.
 * This script derives the key list from the source itself (a hand-kept list
 * would rot the same way `.env.example` did), classifies each key, and
 * reports what a deployment is missing in terms of what stops working.
 *
 * Usage:
 *   npm run verify:deployment            # checks the dev deployment
 *   npm run verify:deployment -- --prod  # checks production
 *
 * Exit is non-zero when a REQUIRED key is unset or when the backend reads a
 * key this script has never heard of — the classification below must grow
 * with the code, never drift behind it.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Unset means broken: no sign-in, no email, no admin, or no AI at all. */
export const REQUIRED_KEYS = [
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "SITE_URL",
  "CONVEX_SITE_URL",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "INITIAL_SUPER_ADMIN_EMAIL",
  "GOOGLE_CLOUD_PROJECT",
  "GOOGLE_CLOUD_LOCATION",
  "GOOGLE_CLIENT_EMAIL",
  "GOOGLE_PRIVATE_KEY",
];

/** Unset means the named feature stays off. Reported, not fatal. */
export const FEATURE_KEYS = {
  "AI providers beyond Vertex": ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY"],
  "Web research agents": ["APIFY_API_TOKEN", "APIFY_WEBHOOK_SECRET", "FIRECRAWL_API_KEY"],
  "Telephone agent": [
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TELEPHONY_NUMBER_OWNERS",
    "TELEPHONY_PUBLIC_URL",
    "TELEPHONY_STATUS_PUBLIC_URL",
    "TELEPHONY_STREAM_URL",
    "TELEPHONY_MAX_CONCURRENT_CALLS",
    "TELEPHONY_MAX_CALLS_PER_NUMBER_PER_HOUR",
  ],
  "Voice sessions": ["VOICE_RELAY_URL", "VOICE_RELAY_SECRET"],
  "Embedded widget": ["WIDGET_EMBED_SIGNING_SECRET"],
  "Alert emails": [
    "PLATFORM_ALERT_EMAIL",
    "PLATFORM_ALERT_EMAILS",
    "ANALYTICS_ALERT_EMAIL",
    "ANALYTICS_ALERT_EMAILS",
  ],
};

/**
 * Read by the backend but never expected on a client deployment: local dev
 * and test switches, runtime-provided values, and the two legacy OpenAI key
 * aliases kept only for old deployments (see openaiProviderService.ts).
 */
export const IGNORED_KEYS = new Set([
  "NODE_ENV",
  "VITEST",
  "IS_TEST",
  "NEXT_PUBLIC_APP_URL",
  "LOCAL_TEST_AUTH_ENABLED",
  "LOCAL_TEST_AUTH_ENVIRONMENT",
  "LOCAL_TEST_AUTH_SECRET",
  "LOCAL_DEMO_SEED_ENABLED",
  "LOCAL_DEMO_SEED_ENVIRONMENT",
  "LOCAL_DEMO_SEED_SECRET",
  "OPEN_AI_API_KEY",
  "OPENAI_KEY",
]);

/** Every process.env.X the backend source (tests excluded) reads. */
export function collectBackendEnvKeys(root = repoRoot) {
  const keys = new Set();
  const convexDir = path.join(root, "convex");
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "_generated") continue;
        walk(full);
        continue;
      }
      if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) continue;
      const source = fs.readFileSync(full, "utf8");
      for (const match of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
        keys.add(match[1]);
      }
    }
  };
  walk(convexDir);
  return [...keys].sort();
}

/**
 * Compares what the code reads against what the deployment has set.
 * `unclassified` failing the run is the point: a new env key must be filed
 * as required, feature-scoped, or ignored before it can ship.
 */
export function evaluateDeployment(backendKeys, setNames) {
  const set = new Set(setNames);
  const classified = new Set([
    ...REQUIRED_KEYS,
    ...Object.values(FEATURE_KEYS).flat(),
    ...IGNORED_KEYS,
  ]);

  const missingRequired = REQUIRED_KEYS.filter((key) => !set.has(key));
  const missingFeatures = Object.entries(FEATURE_KEYS)
    .map(([feature, keys]) => ({ feature, missing: keys.filter((key) => !set.has(key)) }))
    .filter((entry) => entry.missing.length > 0);
  const unclassified = backendKeys.filter((key) => !classified.has(key));

  return { missingRequired, missingFeatures, unclassified };
}

/** Names out of `npx convex env list` output (NAME=value per line). */
export function parseEnvListOutput(output) {
  return output
    .split("\n")
    .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1])
    .filter(Boolean);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const prod = process.argv.includes("--prod");
  const listArgs = ["convex", "env", "list", ...(prod ? ["--prod"] : [])];

  let output;
  try {
    output = execFileSync("npx", listArgs, { cwd: repoRoot, encoding: "utf8" });
  } catch (error) {
    console.error(`Could not read the deployment's environment (npx ${listArgs.join(" ")}):`);
    console.error(error.stderr?.toString() || error.message);
    process.exit(1);
  }

  const backendKeys = collectBackendEnvKeys();
  const setNames = parseEnvListOutput(output);
  const { missingRequired, missingFeatures, unclassified } = evaluateDeployment(backendKeys, setNames);

  const target = prod ? "production" : "dev";

  if (unclassified.length > 0) {
    console.error(`The backend reads keys this checker has not classified: ${unclassified.join(", ")}.`);
    console.error("File each one in scripts/verify-deployment-environment.mjs as required, feature-scoped, or ignored.");
  }
  if (missingRequired.length > 0) {
    console.error(`Missing REQUIRED keys on ${target}:`);
    for (const key of missingRequired) console.error(`- ${key}`);
  }
  for (const { feature, missing } of missingFeatures) {
    console.log(`${feature}: not set (${missing.join(", ")}) — this feature stays off.`);
  }

  if (missingRequired.length > 0 || unclassified.length > 0) {
    process.exit(1);
  }

  console.log(
    `Deployment environment (${target}): all ${REQUIRED_KEYS.length} required keys set; ` +
      `${missingFeatures.length} optional feature group${missingFeatures.length === 1 ? "" : "s"} unset.`
  );
}
