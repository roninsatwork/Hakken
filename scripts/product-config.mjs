import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PRODUCT_FILE = "hakken.product.json";
export const frameworkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const AUTH_PROVIDERS = ["google", "resend"];
export const AI_PROVIDERS = ["vertex", "openai", "anthropic", "openrouter", "typesafe"];
export const FEATURES = ["email", "knowledge", "webIngestion", "apify", "gmail", "voice", "telephony", "widget"];

function object(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(label + " must be an object.");
  if (Object.keys(value).some(key => !keys.includes(key))) {
    // Do not echo unknown fields or their values: someone may have pasted a secret.
    throw new Error(label + " contains an unknown field. Credentials belong in environment variables.");
  }
  for (const key of keys) if (!(key in value)) throw new Error(label + "." + key + " is required.");
}

function string(value, label, { optional = false, max = 500 } = {}) {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u001f\u007f]/.test(value) || value !== value.trim() || (!optional && !value)) {
    throw new Error(label + " must be " + (optional ? "an optional" : "a non-empty") + " single-line string (maximum " + max + " characters).");
  }
}

export function isEmail(value) {
  return typeof value === "string" && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value) && !value.endsWith(".invalid");
}

function httpsUrl(value, label, { optional = true, origin = false } = {}) {
  string(value, label, { optional, max: 2000 });
  if (!value && optional) return;
  let url;
  try { url = new URL(value); } catch { throw new Error(label + " must be an HTTPS URL."); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || /[\s`<>]/.test(value) ||
      (origin && url.pathname !== "/")) throw new Error(label + " must be an HTTPS " + (origin ? "origin" : "URL") + " without credentials, query or fragment.");
}

export function validateProduct(config) {
  object(config, ["schemaVersion", "identity", "deployment", "bootstrap", "email", "providers", "features"], PRODUCT_FILE);
  if (config.schemaVersion !== 1) throw new Error("Unsupported product configuration schemaVersion.");
  object(config.identity, ["name", "slug", "title", "description", "tagline", "brandColorHex", "logoUrlLight", "logoUrlDark"], "identity");
  for (const key of ["name", "slug", "title", "description", "tagline", "brandColorHex"]) string(config.identity[key], "identity." + key);
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(config.identity.slug) || config.identity.slug.length > 63) throw new Error("identity.slug must be a lowercase package slug (maximum 63 characters).");
  if (!/^#[0-9a-f]{6}$/i.test(config.identity.brandColorHex)) throw new Error("identity.brandColorHex must be a six-digit hex colour.");
  for (const key of ["logoUrlLight", "logoUrlDark"]) httpsUrl(config.identity[key], "identity." + key);
  object(config.deployment, ["repositoryUrl", "appUrl", "region", "service", "artifactRepository"], "deployment");
  httpsUrl(config.deployment.repositoryUrl, "deployment.repositoryUrl", { optional: false });
  httpsUrl(config.deployment.appUrl, "deployment.appUrl", { origin: true });
  for (const key of ["region", "service", "artifactRepository"]) {
    string(config.deployment[key], "deployment." + key);
    if (!/^[a-z][a-z0-9-]{0,61}[a-z0-9]$/.test(config.deployment[key])) throw new Error("deployment." + key + " must be a lowercase resource name (2–63 characters).");
  }
  object(config.bootstrap, ["adminEmail"], "bootstrap");
  object(config.email, ["senderName", "senderAddress"], "email");
  string(config.email.senderName, "email.senderName", { optional: true });
  if (/[<>]/.test(config.email.senderName)) throw new Error("email.senderName cannot contain angle brackets.");
  for (const [label, value] of [["bootstrap.adminEmail", config.bootstrap.adminEmail], ["email.senderAddress", config.email.senderAddress]]) {
    string(value, label, { optional: true });
    if (value && !isEmail(value)) throw new Error(label + " must be a bare email address.");
  }
  object(config.providers, ["auth", "ai"], "providers");
  for (const [key, allowed] of [["auth", AUTH_PROVIDERS], ["ai", AI_PROVIDERS]]) {
    const values = config.providers[key];
    if (!Array.isArray(values) || values.some(value => !allowed.includes(value)) || new Set(values).size !== values.length || (key === "auth" && !values.length)) {
      throw new Error("providers." + key + " must contain unique supported providers: " + allowed.join(", ") + ".");
    }
  }
  object(config.features, FEATURES, "features");
  if (FEATURES.some(key => typeof config.features[key] !== "boolean")) throw new Error("Every feature requirement must be true or false.");
  return config;
}

export function readProduct(root = frameworkRoot, configPath = PRODUCT_FILE) {
  let config;
  try { config = JSON.parse(fs.readFileSync(path.resolve(root, configPath), "utf8")); }
  catch { throw new Error("Cannot read product configuration. Supply a valid JSON file; never put credentials in it."); }
  return validateProduct(config);
}
