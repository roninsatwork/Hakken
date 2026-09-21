#!/usr/bin/env node
import fs from "node:fs";
import { readBilling } from "./billing-config.mjs";
import path from "node:path";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import { isEmail, readProduct } from "./product-config.mjs";
import { BACKEND_REQUIRED_KEYS, evaluateProviderRequirements } from "./provider-requirements.mjs";

export function loadSetupEnv(root, overrides = process.env) {
  const entries = {};
  for (const name of [".env", ".env.local"]) {
    const filename = path.join(root, name);
    if (fs.existsSync(filename)) Object.assign(entries, parseEnv(fs.readFileSync(filename, "utf8")));
  }
  return { ...entries, ...overrides };
}

export function evaluateSetup(env, config, { profile = "local", strict = false, billing } = {}) {
  if (!["local", "production"].includes(profile)) throw new Error("Use --profile=local or --profile=production.");
  const names = Object.keys(env).filter(key => typeof env[key] === "string" && env[key].trim());
  const result = evaluateProviderRequirements(config, names, { profile, billing });
  const { failures, warnings, passes } = result;
  const present = new Set(names);
  const requireKey = (key, required = true) => {
    if (present.has(key)) passes.push(key + ": configured");
    else (required ? failures : warnings).push(key + ": missing.");
  };
  for (const key of ["NEXT_PUBLIC_CONVEX_URL", "CONVEX_DEPLOYMENT"]) requireKey(key);
  for (const key of ["NEXT_PUBLIC_APP_URL", ...BACKEND_REQUIRED_KEYS]) requireKey(key, profile === "production");
  for (const key of ["NEXT_PUBLIC_CONVEX_URL", "NEXT_PUBLIC_APP_URL", "SITE_URL", "CONVEX_SITE_URL"]) {
    if (!present.has(key)) continue;
    try {
      const url = new URL(env[key]);
      const localHost = url.hostname === "localhost" || url.hostname.endsWith(".localhost") || url.hostname === "[::1]" || /^127\./.test(url.hostname) || url.hostname === "0.0.0.0";
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || (profile === "production" && (url.protocol !== "https:" || localHost))) {
        failures.push(key + ": use a valid " + (profile === "production" ? "public HTTPS" : "HTTP(S)") + " URL without credentials.");
      }
      if (profile === "production" && config.deployment.appUrl && ["NEXT_PUBLIC_APP_URL", "SITE_URL"].includes(key) && url.origin !== new URL(config.deployment.appUrl).origin) {
        failures.push(key + ": does not match deployment.appUrl in hakken.product.json.");
      }
    } catch { failures.push(key + ": must be a valid URL."); }
  }
  if (profile === "production" && env.CONVEX_DEPLOYMENT?.startsWith("anonymous:")) failures.push("CONVEX_DEPLOYMENT: production cannot use an anonymous local deployment.");
  if (present.has("INITIAL_SUPER_ADMIN_EMAIL") && !isEmail(env.INITIAL_SUPER_ADMIN_EMAIL)) failures.push("INITIAL_SUPER_ADMIN_EMAIL: use a bare email address.");
  if (present.has("RESEND_API_KEY")) {
    const sender = ["RESEND_FROM_EMAIL", "AUTH_EMAIL"].map(key => env[key]).find(value => value?.trim());
    if (sender && (!isEmail(/<([^>]+)>$/.exec(sender)?.[1] ?? sender) || /[\r\n]/.test(sender))) failures.push("Email sender: use a valid address or Name <address>; .invalid placeholders cannot send mail.");
  }
  if (billing?.enabled) {
    if (config.deployment.appUrl && billing.appOrigin !== config.deployment.appUrl) failures.push("Billing appOrigin must match deployment.appUrl.");
    if (env.STRIPE_SECRET_KEY && !new RegExp("^(sk|rk)_" + billing.mode + "_").test(env.STRIPE_SECRET_KEY)) failures.push("STRIPE_SECRET_KEY: wrong billing mode.");
  }
  return { ...result, ok: failures.length === 0 && (!strict || warnings.length === 0) };
}

export function setupMain(argv = process.argv.slice(2)) {
  let profile = "local";
  let configPath = "hakken.product.json";
  let strict = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--strict") strict = true;
    else if (arg.startsWith("--profile=")) profile = arg.slice(10);
    else if (arg === "--profile" && argv[i + 1]) profile = argv[++i];
    else if (arg === "--config" && argv[i + 1]) configPath = argv[++i];
    else throw new Error("Unknown or incomplete option. Use --profile local|production, --config <file>, --strict.");
  }
  const config = readProduct(process.cwd(), configPath);
  const result = evaluateSetup(loadSetupEnv(process.cwd()), config, { profile, strict, billing: readBilling(process.cwd()) });
  console.log("Product setup validation (" + profile + (strict ? ", strict" : "") + ")");
  for (const pass of result.passes) console.log("✓ " + pass);
  for (const warning of result.warnings) console.warn("⚠ " + warning);
  for (const failure of result.failures) console.error("✗ " + failure);
  console.log(result.ok ? "Setup validation passed. Credentials have not been contacted or authenticated." : "Setup validation failed. Check the named settings and rerun npm run setup:validate.");
  return result.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = setupMain(); }
  catch { console.error("Cannot validate setup. Check the options and product/environment file formats; values are not printed."); process.exitCode = 1; }
}
