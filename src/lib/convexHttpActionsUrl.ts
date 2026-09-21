/**
 * Where this deployment's HTTP actions live — webhooks, OAuth callbacks, and
 * anything else routed through `convex/http.ts`.
 *
 * Convex serves two separate origins: the API origin, which carries queries,
 * mutations and the WebSocket, and the HTTP actions origin. On a stock
 * deployment they are the same name with a different suffix, so the origin
 * could be derived by swapping `.cloud` for `.site`. That derivation is what
 * this replaces.
 *
 * It stops working the moment a deployment maps its own domains. Ours are
 * `sonae-db` for the API and `hakken-auth` for HTTP actions — two unrelated
 * names, with no `.cloud` in either. The swap left the string untouched and
 * handed people a webhook URL pointing at the API origin, which does not route
 * `/api/webhooks/*` and answers "No matching routes found". Silently wrong, and
 * only at the point someone tried to use the URL.
 *
 * So the origin comes from the existing `CONVEX_SITE_URL` setting rather than
 * being guessed. The swap survives as the
 * fallback because most deployments of this template never map a custom domain,
 * and it is still correct for them.
 */
export function convexHttpActionsUrl(env: {
  CONVEX_SITE_URL?: string;
  NEXT_PUBLIC_CONVEX_URL?: string;
}): string | null {
  const configured = env.CONVEX_SITE_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const apiUrl = env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (!apiUrl) {
    return null;
  }

  // Only a stock `*.convex.cloud` name can be derived. A custom domain that
  // happens to be set here is not a name we can turn into the other origin, and
  // guessing would put us back where we started.
  if (!apiUrl.includes(".convex.cloud")) {
    return null;
  }

  return apiUrl.replace(".convex.cloud", ".convex.site").replace(/\/+$/, "");
}
