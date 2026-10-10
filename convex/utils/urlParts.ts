/**
 * The parts of a page's address the Discovery screens compare: its website
 * (lowercase, without "www.") and its path. Shared by Brand radar, Your
 * assets and the detail screens, which each held a copy.
 */

/** A page's website, lowercase and without "www."; the address itself when it is not one. */
export function hostOfUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/** A page's path, "/" for a website's front page; the address itself when it is not one. */
export function pathOfUrl(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
}

/** Whether a website is this one or one of its subdomains. */
export function isOnHost(host: string, own: string): boolean {
  return host === own || host.endsWith(`.${own}`);
}

/** Whether a page is on this website or one of its subdomains. */
export function urlIsOnHost(url: string, own: string): boolean {
  return isOnHost(hostOfUrl(url), own);
}
