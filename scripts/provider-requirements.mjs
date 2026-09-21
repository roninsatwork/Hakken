import { validateProduct } from "./product-config.mjs";

// Each inner array is one requirement; any listed alias satisfies it.
export const PROVIDER_GROUPS = {
  stripe: { label: "Stripe billing", keys: [["STRIPE_SECRET_KEY"], ["STRIPE_WEBHOOK_SECRET"]] },
  google: { label: "Google sign-in", keys: [["AUTH_GOOGLE_ID"], ["AUTH_GOOGLE_SECRET"]] },
  resend: { label: "Email", keys: [["RESEND_API_KEY"], ["RESEND_FROM_EMAIL", "AUTH_EMAIL"]] },
  vertex: { label: "Vertex AI / knowledge embeddings", keys: [["GOOGLE_CLOUD_PROJECT"], ["GOOGLE_CLOUD_LOCATION"], ["GOOGLE_CLIENT_EMAIL"], ["GOOGLE_PRIVATE_KEY"]] },
  openai: { label: "OpenAI", keys: [["OPENAI_API_KEY", "OPEN_AI_API_KEY", "OPENAI_KEY"]] },
  anthropic: { label: "Anthropic", keys: [["ANTHROPIC_API_KEY"]] },
  openrouter: { label: "OpenRouter", keys: [["OPENROUTER_API_KEY"]] },
  typesafe: { label: "TypeSafe decisions", keys: [["TYPESAFE_API_KEY"]] },
  webIngestion: { label: "Website ingestion", keys: [["FIRECRAWL_API_KEY"]] },
  apify: { label: "Apify callbacks", keys: [["APIFY_API_TOKEN"], ["APIFY_WEBHOOK_SECRET"]] },
  gmail: { label: "Gmail OAuth", keys: [["CONNECTOR_GOOGLE_CLIENT_ID"], ["CONNECTOR_GOOGLE_CLIENT_SECRET"], ["CONNECTOR_TOKEN_ENCRYPTION_KEY"]] },
  voice: { label: "Voice sessions", keys: [["VOICE_RELAY_URL"], ["VOICE_RELAY_SECRET"]] },
  telephony: { label: "Telephone agent", keys: [["TWILIO_ACCOUNT_SID"], ["TWILIO_AUTH_TOKEN"], ["TELEPHONY_NUMBER_OWNERS"], ["TELEPHONY_PUBLIC_URL"], ["TELEPHONY_STATUS_PUBLIC_URL"], ["TELEPHONY_STREAM_URL"]] },
  widget: { label: "Embedded widget", keys: [["WIDGET_EMBED_SIGNING_SECRET"]] },
};

// Convex Auth reads JWT keys inside its package, so source scanning alone misses them.
export const BACKEND_REQUIRED_KEYS = ["SITE_URL", "INITIAL_SUPER_ADMIN_EMAIL", "JWT_PRIVATE_KEY", "JWKS"];

/**
 * Read by the backend, but never settable — so never missing.
 *
 * Convex supplies CONVEX_SITE_URL to functions itself and rejects any attempt
 * to set it ("EnvVarNameForbidden"), so it cannot appear in `convex env list`,
 * which is the only thing this check reads. Listing it as required made every
 * deployment report one permanent missing setting no matter how correctly it
 * was configured. It stays classified because the backend genuinely reads it
 * and the drift test is right to insist every such key is accounted for.
 */
export const PLATFORM_PROVIDED_KEYS = ["CONVEX_SITE_URL"];
export const OPTIONAL_KEYS = ["TELEPHONY_MAX_CONCURRENT_CALLS", "TELEPHONY_MAX_CALLS_PER_NUMBER_PER_HOUR", "PLATFORM_ALERT_EMAIL", "PLATFORM_ALERT_EMAILS", "ANALYTICS_ALERT_EMAIL", "ANALYTICS_ALERT_EMAILS"];
export const IGNORED_KEYS = new Set([
  "NODE_ENV", "VITEST", "IS_TEST", "NEXT_PUBLIC_APP_URL",
  "LOCAL_TEST_AUTH_ENABLED", "LOCAL_TEST_AUTH_ENVIRONMENT", "LOCAL_TEST_AUTH_SECRET",
  "LOCAL_DEMO_SEED_ENABLED", "LOCAL_DEMO_SEED_ENVIRONMENT", "LOCAL_DEMO_SEED_SECRET",
]);
export const CLASSIFIED_KEYS = new Set([
  ...BACKEND_REQUIRED_KEYS, ...PLATFORM_PROVIDED_KEYS, ...OPTIONAL_KEYS, ...IGNORED_KEYS,
  ...Object.values(PROVIDER_GROUPS).flatMap(group => group.keys.flat()),
]);

export function selectedGroups(config, billing) {
  validateProduct(config);
  const selected = new Set([
    ...config.providers.auth.map(provider => provider === "google" ? "google" : "resend"),
    ...config.providers.ai,
    ...Object.entries(config.features).filter(([, enabled]) => enabled).map(([key]) => ({ email: "resend", knowledge: "vertex" })[key] ?? key),
  ]);
  // The live voice and telephone agents use Vertex independently of text models.
  if (selected.has("voice") || selected.has("telephony")) selected.add("vertex");
  if (billing?.enabled) selected.add("stripe");
  return selected;
}

export function evaluateProviderRequirements(config, names, { profile = "production", billing } = {}) {
  const present = new Set(names);
  const selected = selectedGroups(config, billing);
  const failures = [];
  const warnings = [];
  const passes = [];
  const missingRequired = [];
  const missingFeatures = [];
  for (const [id, { label, keys }] of Object.entries(PROVIDER_GROUPS)) {
    const missing = keys.filter(aliases => !aliases.some(key => present.has(key))).map(aliases => aliases.join(" or "));
    const partial = missing.length > 0 && keys.some(aliases => aliases.some(key => present.has(key)));
    if (!missing.length) { passes.push(label + ": credentials present (not contacted)"); continue; }
    if (partial || (selected.has(id) && profile === "production")) {
      failures.push(label + ": missing " + missing.join(", ") + ".");
      missingRequired.push(...missing);
    } else if (selected.has(id)) {
      warnings.push(label + ": not configured for local development (" + missing.join(", ") + ").");
    } else {
      missingFeatures.push({ feature: label, missing });
    }
  }
  return { failures, warnings, passes, missingRequired, missingFeatures };
}

export function requiredEnvironmentKeys(config, billing) {
  return [...new Set([...BACKEND_REQUIRED_KEYS, ...[...selectedGroups(config, billing)].flatMap(id => PROVIDER_GROUPS[id].keys.map(aliases => aliases[0]))])];
}
