/**
 * Auto Setup's plain text helpers (docs/plans/active/auto-setup-plan.md, AS6,
 * AS9): which of a home page's links are a business's main pages, and the
 * model's JSON answer read leniently. Plain code, free of any Convex function.
 */

/** Addresses that are never a business's main pages: posts, carts, sign-ins, policies, files. */
const NOT_MAIN = /\/(blog|news|tag|tags|category|categories|author|wp-|cart|basket|checkout|login|log-in|signin|sign-in|account|my-account|privacy|cookie|cookies|terms|legal|sitemap|feed)(\/|$)|\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?)$/i;

/** Words that mark the pages saying what a business sells, who it is and what it costs. */
const MAIN_WORDS = /(about|who-we-are|what-we-do|course|subject|qualification|service|product|shop|price|pricing|fee|study|learn|contact|how-it-works)/i;

const sameSite = (host: string, url: URL) => url.hostname.replace(/^www\./, "") === host.replace(/^www\./, "");

/** The main pages a home page links to, the likeliest first: at most `most`, each once. */
export function mainPagesOf(host: string, links: readonly string[], most: number): string[] {
  const seen = new Set<string>(["/"]);
  const found: Array<{ url: string; path: string; score: number }> = [];
  for (const link of links) {
    let url: URL;
    try {
      url = new URL(link, `https://${host}/`);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(url.protocol) || !sameSite(host, url)) continue;
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (seen.has(path) || NOT_MAIN.test(path)) continue;
    const depth = path.split("/").filter(Boolean).length;
    if (depth === 0 || depth > 2) continue;
    seen.add(path);
    found.push({ url: `${url.origin}${url.pathname}`, path, score: (MAIN_WORDS.test(path) ? 0 : 10) + depth });
  }
  return found.sort((left, right) => left.score - right.score || left.path.length - right.path.length).slice(0, most).map((entry) => entry.url);
}

/** The model's answer as JSON, read leniently: a reply in a code fence or with words around it is still read. */
export function readJson<T>(text: string): T | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
