const DEFAULT_AUTH_REDIRECT = "/app";
const AUTH_REDIRECT_BASE = "https://hakken.local";
const ALLOWED_AUTH_REDIRECT_PREFIXES = ["/admin", "/app", "/demos"] as const;

export function sanitizeAuthRedirect(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_AUTH_REDIRECT;
  }

  try {
    const destination = new URL(value, AUTH_REDIRECT_BASE);
    const allowedPath = ALLOWED_AUTH_REDIRECT_PREFIXES.some((prefix) => (
      destination.pathname === prefix || destination.pathname.startsWith(`${prefix}/`)
    ));
    if (destination.origin !== AUTH_REDIRECT_BASE || !allowedPath) {
      return DEFAULT_AUTH_REDIRECT;
    }
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return DEFAULT_AUTH_REDIRECT;
  }
}
