/**
 * What counts as one website.
 *
 * A website exists exactly once in Hakken: two clients watching the same
 * competitor read one record and we pull its data from DataForSEO once. That
 * promise is only as good as this file, because the moment two spellings of the
 * same site produce two keys, there are two records and the saving is gone —
 * silently, because both records look perfectly correct on screen.
 *
 * So everything anyone might paste has to land on one string:
 *
 *     https://www.example.com/uk?ref=1#top
 *     HTTP://EXAMPLE.COM
 *     example.com.
 *     example.com:443
 *                                    all of these  ->  example.com
 *
 * And one thing that looks similar must *not*:
 *
 *     shop.example.com               ->  shop.example.com
 *
 * A subdomain has its own rankings and its own backlinks, and DataForSEO
 * targets work the same way, so folding it into the parent would merge two
 * different sets of numbers into one.
 *
 * No database here on purpose. This is the piece most likely to be wrong and
 * the piece cheapest to test, so it is a pure function with a test per rule.
 */

/** DNS caps a hostname at 253 characters. */
const MAX_HOST_LENGTH = 253;

/** Anything longer than this was not a URL a person typed. */
const MAX_INPUT_LENGTH = 2000;

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
/** Letters, digits, hyphens and dots, plus anything above ASCII for IDNs. */
const ALLOWED_HOST_CHARS = /^[a-z0-9.\-¡-￿]+$/;

export type WebsiteIdentityProblem =
  /** Nothing was typed. */
  | "EMPTY"
  /** Not a host at all — spaces, illegal characters, nothing parseable. */
  | "UNPARSEABLE"
  /** A single word with no dot: "example", "intranet". */
  | "NO_DOT"
  /** An IP address rather than a name. */
  | "IP_ADDRESS"
  /** `localhost`, or a name that only resolves on someone's own machine. */
  | "LOCAL"
  /** Longer than DNS allows, or longer than any person types. */
  | "TOO_LONG";

export type WebsiteIdentity = {
  /**
   * The key. ASCII, punycode for internationalised names, and the only thing
   * a lookup ever compares.
   */
  host: string;
  /**
   * The same host as a person reads it. Identical to `host` for ordinary
   * domains, and the readable form for an internationalised one — `münchen.de`
   * rather than `xn--mnchen-3ya.de`, which is the whole reason this field
   * exists.
   */
  displayHost: string;
};

export type WebsiteIdentityResult =
  | ({ ok: true } & WebsiteIdentity)
  | { ok: false; problem: WebsiteIdentityProblem };

/** Hosts that only mean something on the machine that typed them. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
const LOCAL_SUFFIXES = [".localhost", ".local", ".internal", ".test", ".localdomain"];

/**
 * Take whatever someone pasted and return the one host it means.
 *
 * Deliberately forgiving about the wrapping — scheme, `www.`, path, query,
 * fragment, port, credentials and a trailing dot are all noise around the same
 * site — and deliberately strict about what is left, because a bad key is worse
 * than a refusal: a refusal is visible.
 */
export function readWebsiteHost(raw: string): WebsiteIdentityResult {
  if (typeof raw !== "string") return { ok: false, problem: "UNPARSEABLE" };

  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, problem: "EMPTY" };
  if (trimmed.length > MAX_INPUT_LENGTH) return { ok: false, problem: "TOO_LONG" };

  // Scheme, then protocol-relative "//example.com".
  let rest = trimmed.replace(SCHEME, "");
  if (rest.startsWith("//")) rest = rest.slice(2);

  // The authority is everything before the first path, query or fragment.
  const authority = rest.split(/[/?#]/)[0] ?? "";
  if (authority.length === 0) return { ok: false, problem: "EMPTY" };

  // Credentials, if someone pasted a URL carrying them. Split on the last `@`
  // because a password may legitimately contain one.
  const withoutCredentials = authority.includes("@")
    ? authority.slice(authority.lastIndexOf("@") + 1)
    : authority;

  // An IPv6 literal arrives in brackets. Rejected below with the v4 case, but
  // caught here because the port strip would mangle it first.
  if (withoutCredentials.startsWith("[")) return { ok: false, problem: "IP_ADDRESS" };

  // Port. Only the last colon, and only when what follows is digits — anything
  // else is malformed rather than a port.
  const colon = withoutCredentials.lastIndexOf(":");
  const withoutPort = colon === -1
    ? withoutCredentials
    : /^\d*$/.test(withoutCredentials.slice(colon + 1))
      ? withoutCredentials.slice(0, colon)
      : withoutCredentials;

  // A fully qualified name may end in a dot, and means the same thing.
  const withoutTrailingDots = withoutPort.replace(/\.+$/, "");
  const lowered = withoutTrailingDots.toLowerCase();
  if (lowered.length === 0) return { ok: false, problem: "EMPTY" };

  // `www.` is the one subdomain that is not a different site. Kept when
  // removing it would leave something that is not a domain at all, so the real
  // `www.com` survives.
  const withoutWww = lowered.startsWith("www.") && lowered.slice(4).includes(".")
    ? lowered.slice(4)
    : lowered;

  if (withoutWww.length > MAX_HOST_LENGTH) return { ok: false, problem: "TOO_LONG" };
  if (!ALLOWED_HOST_CHARS.test(withoutWww)) return { ok: false, problem: "UNPARSEABLE" };
  // No empty labels: "example..com", ".example.com", "example.com" is fine.
  if (withoutWww.startsWith(".") || withoutWww.includes("..")) {
    return { ok: false, problem: "UNPARSEABLE" };
  }
  if (IPV4.test(withoutWww)) return { ok: false, problem: "IP_ADDRESS" };
  if (isLocalHost(withoutWww)) return { ok: false, problem: "LOCAL" };
  if (!withoutWww.includes(".")) return { ok: false, problem: "NO_DOT" };

  // `URL` does the punycode conversion, and refuses anything it cannot make a
  // hostname of — which is the last check, not the first, because its error
  // says nothing a person could act on.
  const host = toAsciiHost(withoutWww);
  if (!host) return { ok: false, problem: "UNPARSEABLE" };
  if (host.length > MAX_HOST_LENGTH) return { ok: false, problem: "TOO_LONG" };

  return { ok: true, host, displayHost: withoutWww };
}

function isLocalHost(host: string): boolean {
  if (LOCAL_HOSTS.has(host)) return true;
  return LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/**
 * The ASCII form, via the one punycode implementation already in the runtime.
 *
 * Returns null when `URL` will not accept it, which is the signal that whatever
 * survived the cleaning above is still not a hostname.
 */
function toAsciiHost(host: string): string | null {
  try {
    const parsed = new URL(`https://${host}`);
    const hostname = parsed.hostname.replace(/\.+$/, "");
    // `URL` accepts some things by rewriting them. If what comes back is not
    // recognisably the same host, treat it as a refusal rather than silently
    // keying on something the person did not type.
    if (hostname.length === 0 || !hostname.includes(".")) return null;
    return hostname;
  } catch {
    return null;
  }
}

/** The sentence to show for each refusal. Kept beside the rules that produce them. */
export const WEBSITE_IDENTITY_MESSAGES: Record<WebsiteIdentityProblem, string> = {
  EMPTY: "Enter a website address.",
  UNPARSEABLE: "That does not look like a website address.",
  NO_DOT: "That is missing a domain ending, like .com or .co.uk.",
  IP_ADDRESS: "Enter a domain name rather than an IP address.",
  LOCAL: "That address only works on your own machine.",
  TOO_LONG: "That address is too long to be a website.",
};
