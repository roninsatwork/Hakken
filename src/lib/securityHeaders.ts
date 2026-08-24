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
    // Textures inside a 3D model are unpacked into `blob:` URLs by the loader
    // and then fetched back. Without this the model's shape loads and the
    // pictures painted on it do not, so a character renders as a white
    // silhouette with correct outlines — which is exactly how this was found,
    // in Safari, on 2026-08-24. Chrome did not enforce it and the fault was
    // invisible there.
    //
    // A `blob:` URL is minted by this page and readable only by it, so allowing
    // it grants nothing an attacker could reach.
    "blob:",
    // The pose, face and hand tracking engine: its WebAssembly loader, and the
    // three model files it downloads. Both were being refused, which is why the
    // studio could not start tracking.
    "https://cdn.jsdelivr.net",
    "https://storage.googleapis.com",
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
        // WebAssembly will not compile without an explicit allowance, and
        // production deliberately does not grant `'unsafe-eval'`. Locally it
        // worked only because development does — which is why movement tracking
        // ran on a laptop and refused on live, saying only "camera unavailable"
        // while the console explained itself to nobody.
        //
        // This permits compiling WebAssembly and nothing else. It does not
        // reopen `eval` for ordinary JavaScript, which is what `'unsafe-eval'`
        // would do and is exactly why production withholds it.
        "'wasm-unsafe-eval'",
        "https://www.googletagmanager.com",
        "https://www.google-analytics.com",
        // The tracking engine loads its own WebAssembly bootstrap script from
        // here, pinned to an exact version in `mediaPipeConfig.ts`.
        "https://cdn.jsdelivr.net",
      ],
      // The same engine runs its work off the main thread, from a worker it
      // creates itself as a `blob:`. Without this the studio has no tracking at
      // all, and says so only in the console.
      workerSrc: ["'self'", "blob:"],
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
