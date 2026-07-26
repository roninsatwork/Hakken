#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const args = new Set(process.argv.slice(2));
const profileArg = process.argv.find((arg) => arg.startsWith("--profile="));
const profile = profileArg?.slice("--profile=".length) || "local";
const strict = args.has("--strict");

if (!["local", "production"].includes(profile)) {
  console.error("Unknown profile. Use --profile=local or --profile=production.");
  process.exit(1);
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const entries = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key) entries[key] = value;
  }

  return entries;
}

const env = {
  ...parseEnvFile(path.join(repoRoot, ".env")),
  ...parseEnvFile(path.join(repoRoot, ".env.local")),
  ...process.env,
};

const failures = [];
const warnings = [];
const passes = [];

function hasValue(key) {
  return typeof env[key] === "string" && env[key].trim().length > 0;
}

function requireValue(key, reason) {
  if (hasValue(key)) {
    passes.push(`${key}: configured`);
  } else {
    failures.push(`${key}: missing. ${reason}`);
  }
}

function warnValue(key, reason) {
  if (hasValue(key)) {
    passes.push(`${key}: configured`);
  } else {
    warnings.push(`${key}: not configured. ${reason}`);
  }
}

function validateUrl(key, options = {}) {
  if (!hasValue(key)) return;
  try {
    const url = new URL(env[key]);
    if (!["http:", "https:"].includes(url.protocol)) {
      failures.push(`${key}: must use http or https.`);
    }
    if (profile === "production" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
      failures.push(`${key}: production profile cannot point at localhost.`);
    }
    if (options.expectedHostSuffix && !url.hostname.endsWith(options.expectedHostSuffix)) {
      warnings.push(`${key}: expected host ending in ${options.expectedHostSuffix}.`);
    }
  } catch {
    failures.push(`${key}: must be a valid URL.`);
  }
}

function validateProviderGroup(name, keys) {
  const configured = keys.filter(hasValue);
  if (configured.length === 0) return false;
  if (configured.length !== keys.length) {
    failures.push(`${name}: partial configuration. Missing ${keys.filter((key) => !hasValue(key)).join(", ")}.`);
    return false;
  }
  passes.push(`${name}: configured`);
  return true;
}

requireValue("NEXT_PUBLIC_CONVEX_URL", "Run `npm run convex:dev` or set the target Convex deployment URL.");
requireValue("CONVEX_DEPLOYMENT", "Run `npm run convex:dev` or set the Convex deployment name.");
validateUrl("NEXT_PUBLIC_CONVEX_URL", { expectedHostSuffix: profile === "production" ? ".convex.cloud" : undefined });

if (profile === "production") {
  requireValue("NEXT_PUBLIC_APP_URL", "Set the public app URL used in links, auth callbacks, and deployment checks.");
  requireValue("INITIAL_SUPER_ADMIN_EMAIL", "Set the bootstrap super-admin fallback email.");
  validateUrl("NEXT_PUBLIC_APP_URL");

  if (hasValue("CONVEX_DEPLOYMENT") && env.CONVEX_DEPLOYMENT.startsWith("anonymous:")) {
    failures.push("CONVEX_DEPLOYMENT: production profile cannot use anonymous local deployment.");
  }
} else {
  warnValue("INITIAL_SUPER_ADMIN_EMAIL", "Useful for local bootstrap and platform alert fallback.");
}

const hasGoogleAuth = validateProviderGroup("Google auth", ["AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"]);
const hasResendAuth = hasValue("RESEND_API_KEY");
if (profile === "production") {
  if (!hasGoogleAuth && !hasResendAuth) {
    failures.push("Auth provider: configure either AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET or RESEND_API_KEY.");
  }
} else if (!hasGoogleAuth && !hasResendAuth) {
  warnings.push("Auth provider: no Google OAuth or Resend key found. Local test auth can still work when explicitly enabled.");
}

// Sending mail without a configured sender is not a soft failure: magic-link
// sign-in, invites, scheduled reports and workflow emails all use it. With
// nothing set the sender falls back to a deliberately undeliverable
// `.invalid` address (see convex/emailBrandingService.ts) rather than
// impersonating a domain this deployment does not own — so the mail is simply
// never delivered. Catch it here rather than when someone cannot sign in.
const hasSenderAddress = ["RESEND_FROM_EMAIL", "AUTH_EMAIL"].some(hasValue);
if (hasResendAuth && !hasSenderAddress) {
  const message =
    "Email sender is not set. Email sending is configured (RESEND_API_KEY present) but no sender address is. " +
    "Set AUTH_EMAIL or RESEND_FROM_EMAIL to an address on a domain verified with your mail provider, or set the sender in Settings. " +
    "Until then magic-link sign-in and invite emails will not be delivered.";

  if (profile === "production") {
    failures.push(message);
  } else {
    warnings.push(message);
  }
}

const hasGoogleVertex = validateProviderGroup("Google Vertex AI", ["GOOGLE_CLIENT_EMAIL", "GOOGLE_PRIVATE_KEY"]);
const hasOpenAI = ["OPENAI_API_KEY", "OPEN_AI_API_KEY", "OPENAI_KEY"].some(hasValue);
const hasAnthropic = hasValue("ANTHROPIC_API_KEY");
const hasOpenRouter = hasValue("OPENROUTER_API_KEY");

if (hasValue("GOOGLE_PRIVATE_KEY") && !env.GOOGLE_PRIVATE_KEY.includes("\\n") && !env.GOOGLE_PRIVATE_KEY.includes("BEGIN PRIVATE KEY")) {
  warnings.push("GOOGLE_PRIVATE_KEY: value does not look like a service-account private key.");
}

if (hasOpenAI) passes.push("OpenAI: configured");
if (hasAnthropic) passes.push("Anthropic: configured");
if (hasOpenRouter) passes.push("OpenRouter: configured");

if (profile === "production") {
  if (!hasGoogleVertex && !hasOpenAI && !hasAnthropic && !hasOpenRouter) {
    failures.push("AI provider: configure at least one runtime provider credential group.");
  }
} else if (!hasGoogleVertex && !hasOpenAI && !hasAnthropic && !hasOpenRouter) {
  warnings.push("AI provider: no runtime provider credentials found. Contract tests and local demo seeding can still run without live model calls.");
}

warnValue("FIRECRAWL_API_KEY", "Required only for live website knowledge ingestion.");
warnValue("APIFY_API_TOKEN", "Required only for live Apify property/search ingestion.");
if (hasValue("APIFY_API_TOKEN")) {
  requireValue("APIFY_WEBHOOK_SECRET", "Required when Apify callbacks are enabled.");
}

const effectiveFailures = strict ? [...failures, ...warnings.map((warning) => `Strict warning: ${warning}`)] : failures;

console.log(`Sonae setup validation (${profile}${strict ? ", strict" : ""})`);
for (const pass of passes) console.log(`✓ ${pass}`);
for (const warning of warnings) console.warn(`⚠ ${warning}`);
for (const failure of failures) console.error(`✗ ${failure}`);

if (effectiveFailures.length > 0) {
  console.error("");
  console.error("Setup validation failed. Fix the items above, then rerun `npm run setup:validate`.");
  process.exit(1);
}

console.log("");
console.log("Setup validation passed.");
