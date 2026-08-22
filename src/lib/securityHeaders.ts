export type SecurityHeaderEnvironment = {
  NODE_ENV?: string;
  NEXT_PUBLIC_CONVEX_URL?: string;
  NEXT_PUBLIC_CONVEX_SITE_URL?: string;
  CONVEX_SITE_URL?: string;
};

function addConfiguredOrigin(sources: Set<string>, value: string | undefined) {
  if (!value?.trim()) return;

  try {
    const url = new URL(value);
    if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol)) return;

    sources.add(url.origin);
    if (url.protocol === "https:") sources.add(`wss://${url.host}`);
    if (url.protocol === "http:") sources.add(`ws://${url.host}`);
  } catch {
    // An invalid deployment URL must not widen the policy.
  }
}

export function buildAppContentSecurityPolicy(env: SecurityHeaderEnvironment) {
  const development = env.NODE_ENV !== "production";
  const connectSources = new Set([
    "'self'",
    "https://api.openai.com",
    "https://ipapi.co",
    "https://www.google-analytics.com",
    "https://*.google-analytics.com",
    "https://www.googletagmanager.com",
    "https://*.ingest.sentry.io",
    "https://*.ingest.us.sentry.io",
    // The voice relay is configured inside Convex and returned at runtime, so
    // its host is not available to the Next.js build. Keep secure WebSockets
    // open without also allowing arbitrary HTTPS requests.
    "wss:",
  ]);

  addConfiguredOrigin(connectSources, env.NEXT_PUBLIC_CONVEX_URL);
  addConfiguredOrigin(connectSources, env.NEXT_PUBLIC_CONVEX_SITE_URL);
  addConfiguredOrigin(connectSources, env.CONVEX_SITE_URL);
  if (development) connectSources.add("ws:");

  return {
    reportOnly: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        ...(development ? ["'unsafe-eval'"] : []),
        "https://www.googletagmanager.com",
        "https://www.google-analytics.com",
      ],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: [...connectSources],
      frameSrc: ["'self'", "https://www.googletagmanager.com"],
      frameAncestors: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  };
}
