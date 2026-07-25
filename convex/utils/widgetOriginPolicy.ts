/**
 * Shared widget embedding policy.
 *
 * The widget is delivered as an iframe pointing at our own origin
 * (`public/embed.js` sets `iframe.src = <host>/w/<widgetId>`). Code running
 * inside that iframe therefore has OUR origin, so a request's `Origin` header
 * says nothing about which site embedded the widget, and any page URL reported
 * by that code is attacker-controlled.
 *
 * The only enforcement the browser will do on our behalf is
 * `Content-Security-Policy: frame-ancestors`, evaluated against the real
 * embedding page. These helpers are shared by the Next middleware that emits
 * that header and by the Convex widget mutations, so the header and the
 * server-side checks can never drift apart.
 */

export const WILDCARD_DOMAIN = "*";

/**
 * Reduce a configured entry to a bare lowercase host.
 *
 * Entries are author-supplied and inconsistent in practice: "acmecorp.com",
 * "https://acmecorp.com", "https://acmecorp.com/" and "ACMECORP.com" all mean
 * the same site.
 */
export function normalizeAllowedDomain(domain: string) {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
}

/** Extract a comparable lowercase host from an absolute URL. */
export function parseHostFromUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) return null;

  try {
    const parsed = new URL(trimmed);
    // Embedded credentials are a classic way to make a URL read as one host
    // while resolving to another.
    if (parsed.username || parsed.password) return null;
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function allowsAnyDomain(allowedDomains: string[] | undefined) {
  return Boolean(allowedDomains?.some((domain) => normalizeAllowedDomain(domain) === WILDCARD_DOMAIN));
}

/** Whether `host` is an allowed domain or a subdomain of one. */
export function isHostAllowed(host: string, allowedDomains: string[] | undefined) {
  if (!allowedDomains?.length) return false;
  if (allowsAnyDomain(allowedDomains)) return true;

  const normalizedHost = host.trim().toLowerCase();
  if (!normalizedHost) return false;

  return allowedDomains.some((domain) => {
    const normalized = normalizeAllowedDomain(domain);
    if (!normalized || normalized === WILDCARD_DOMAIN) return false;
    return normalizedHost === normalized || normalizedHost.endsWith(`.${normalized}`);
  });
}

/**
 * Build the `frame-ancestors` directive value for a widget.
 *
 * Emits both the apex and a wildcard subdomain source per entry so the header
 * matches `isHostAllowed`, which accepts subdomains. An empty or fully invalid
 * list yields `'none'` — a widget with nothing configured is embeddable
 * nowhere, matching the mutation's existing deny-by-default behaviour.
 */
export function buildFrameAncestors(allowedDomains: string[] | undefined) {
  if (allowsAnyDomain(allowedDomains)) return WILDCARD_DOMAIN;

  const sources = (allowedDomains ?? [])
    .map(normalizeAllowedDomain)
    .filter((domain) => domain && domain !== WILDCARD_DOMAIN)
    // A bare host is required; anything carrying a path, port-less colon or
    // whitespace is malformed configuration rather than a usable source.
    .filter((domain) => /^[a-z0-9.-]+(:\d+)?$/.test(domain))
    .flatMap((domain) => [`https://${domain}`, `https://*.${domain}`]);

  const unique = Array.from(new Set(sources));
  return unique.length > 0 ? unique.join(" ") : "'none'";
}
