import { normalisePage } from "./pageClassification";

/**
 * Reading a website's sitemap (docs/plans/active/page-groups-plan.md, "the
 * sitemap is read at each collection"): the website's own list of its pages,
 * set against what was crawled, shown by Google and ranking on Your pages.
 *
 * Nothing here fetches. The reading is handed a `fetchText` that does
 * (`sitemapFetch.ts`, in the Node runtime, through the platform's guard
 * against private and internal addresses), so the rules — where to look,
 * which addresses may be read, how deep to follow, where to stop — are plain
 * code a test can drive with a faked web.
 *
 * - **Where it is found.** robots.txt's `Sitemap:` lines first. With none
 *   there, the usual addresses in turn: `/sitemap_index.xml`, `/sitemap.xml`,
 *   `/wp-sitemap.xml`.
 * - **What may be read.** Only the website's own host and its www or bare
 *   twin, over https: a robots.txt pointing at a file on another website is
 *   noted, never fetched. An http address on the website itself is read over
 *   https.
 * - **How deep.** A sitemap index is followed to the files it lists, and an
 *   index listed in an index once more — two levels — and no further.
 * - **Where it stops.** At the `sitemapPagesRead` limit, saying so (`cut`);
 *   at `MAX_FILES_READ` files; and when `READING_BUDGET_MS` has passed.
 *
 * Problems are kept as codes (`SitemapProblem`), so the screens say them in
 * the reader's language.
 */

/** The usual addresses tried, in this order, when robots.txt names no sitemap. */
export const USUAL_SITEMAP_PATHS = ["/sitemap_index.xml", "/sitemap.xml", "/wp-sitemap.xml"] as const;

/** Indexes followed below the first file: an index, an index it lists, then only page files. */
export const MAX_INDEX_DEPTH = 2;

/** Files fetched in one reading at most, robots.txt and the usual addresses tried aside. */
export const MAX_FILES_READ = 100;

/** How long one reading may run, well inside an action's ten minutes: what is left is noted, not read. */
export const READING_BUDGET_MS = 5 * 60 * 1000;

/** Files and problems kept on the reading at most, so its record stays small however long an index is. */
export const MAX_FILES_LISTED = 200;

/**
 * Why a file was not read, or why nothing was, as a code the screens put into
 * words: `MISSING:404`, `ANSWERED:500` (another answer), `TIMEOUT`,
 * `TOO_LARGE`, `REFUSED` (an address the platform will not reach),
 * `OTHER_WEBSITE`, `NOT_A_SITEMAP`, `TOO_DEEP`, `UNREAD` (the reading ran out
 * of time or files before it), `FAILED` (the connection broke); and for the
 * reading as a whole, `NONE_FOUND` or `UNREACHABLE`.
 */
export type SitemapProblem = string;

/** What fetching one address brought back: its text, or why not. `missing` is a plain "not here" (404 or 410). */
export type FetchedText =
  | { ok: true; url: string; text: string }
  | { ok: false; problem: SitemapProblem; missing: boolean };

/** Fetch one address as text, for robots.txt or a sitemap file (which may arrive gzipped). */
export type FetchText = (url: string, purpose: "robots" | "sitemap") => Promise<FetchedText>;

export type SitemapFile = { url: string; pages: number; problem?: SitemapProblem };
export type SitemapPage = { page: string; file: string; lastmod?: string };

export type SitemapReading = {
  source: "ROBOTS" | "USUAL_ADDRESS" | "NONE";
  /** The page files read, with their pages, and every file that could not be. Indexes read fine are not listed. */
  files: SitemapFile[];
  /** Every page once, in the order read, each with the file that first listed it. */
  pages: SitemapPage[];
  cut: boolean;
  /** For a reading that found nothing: `NONE_FOUND`, or `UNREACHABLE` when nothing answered at all. */
  problem?: SitemapProblem;
};

/** A website's own hosts: itself and its www or bare twin. Hosts are kept without `www.` (`websiteIdentity.ts`). */
export function siteHosts(host: string): string[] {
  const bare = host.toLowerCase().replace(/^www\./, "");
  return [bare, `www.${bare}`];
}

/** Whether an address is on the website — a path, or a full address on one of its hosts — over http or https. */
export function onWebsite(address: string, host: string): boolean {
  const text = address.trim();
  if (text.startsWith("/") && !text.startsWith("//")) return true;
  try {
    const parsed = new URL(text.startsWith("//") ? `https:${text}` : text);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") && siteHosts(host).includes(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * The https address a listed sitemap is read from, or null when it may not
 * be read: on another website, or not a web address at all. A path is the
 * website's own; an http address on the website is read over https.
 */
export function sitemapAddress(address: string, host: string): string | null {
  const text = decodeXml(address.trim());
  if (!text) return null;
  try {
    const parsed = new URL(text, `https://${siteHosts(host)[0]}/`);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (!siteHosts(host).includes(parsed.hostname.toLowerCase())) return null;
    parsed.protocol = "https:";
    parsed.port = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

/** The sitemaps robots.txt names, in its order: every `Sitemap:` line, whatever its case. */
export function robotsSitemaps(text: string): string[] {
  const found: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*sitemap\s*:\s*(\S+)/i.exec(line.split("#")[0] ?? "");
    if (match && !found.includes(match[1])) found.push(match[1]);
  }
  return found;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };

/** Text inside an XML element: its CDATA unwrapped and its entities read. */
function decodeXml(text: string): string {
  const unwrapped = text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  return unwrapped.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  }).trim();
}

/** Namespaces whose `loc` is not the page's own: an image's, a video's, a news item's. */
const OTHER_LOCS = new Set(["image", "video", "news", "xhtml"]);

/** The first `loc` of a block that is the entry's own, not an image's or a video's. */
function ownLoc(block: string): string | null {
  for (const match of block.matchAll(/<(?:([\w-]+):)?loc\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?loc\s*>/gi)) {
    if (match[1] && OTHER_LOCS.has(match[1].toLowerCase())) continue;
    const loc = decodeXml(match[2]);
    if (loc) return loc;
  }
  return null;
}

function ownLastmod(block: string): string | undefined {
  const match = /<(?:[\w-]+:)?lastmod\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?lastmod\s*>/i.exec(block);
  const value = match ? decodeXml(match[1]) : "";
  return value ? value.slice(0, 40) : undefined;
}

export type ParsedSitemap =
  | { kind: "index"; locs: string[] }
  | { kind: "urlset"; entries: Array<{ loc: string; lastmod?: string }> }
  | { kind: "other" };

/**
 * A sitemap file read: an index of other sitemaps, a list of pages (XML, or
 * the plain-text form of one address a line), or something else — an HTML
 * page a missing address answered with, most often. Read with patterns
 * rather than an XML library: the format is a handful of elements, and a
 * file cut short still gives every entry it holds whole.
 */
export function parseSitemap(text: string): ParsedSitemap {
  const body = text.replace(/<!--[\s\S]*?-->/g, "");
  if (/<(?:[\w-]+:)?sitemapindex\b/i.test(body)) {
    const locs: string[] = [];
    for (const match of body.matchAll(/<(?:[\w-]+:)?sitemap\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?sitemap\s*>/gi)) {
      const loc = ownLoc(match[1]);
      if (loc) locs.push(loc);
    }
    return { kind: "index", locs };
  }
  if (/<(?:[\w-]+:)?urlset\b/i.test(body)) {
    const entries: Array<{ loc: string; lastmod?: string }> = [];
    for (const match of body.matchAll(/<(?:[\w-]+:)?url\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?url\s*>/gi)) {
      const loc = ownLoc(match[1]);
      if (!loc) continue;
      const lastmod = ownLastmod(match[1]);
      entries.push(lastmod ? { loc, lastmod } : { loc });
    }
    return { kind: "urlset", entries };
  }
  // The plain-text form: one address a line, and nothing else.
  const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length > 0 && !body.includes("<") && lines.every((line) => /^https?:\/\/\S+$/i.test(line))) {
    return { kind: "urlset", entries: lines.map((loc) => ({ loc })) };
  }
  return { kind: "other" };
}

/** A file's own name as a person reads it — `post-sitemap.xml`, `sitemap.xml?page=2` — from its address. */
export function fileNameOf(url: string): string {
  try {
    const parsed = new URL(url);
    const name = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).at(-1) ?? "") || parsed.hostname;
    return `${name}${parsed.search}`;
  } catch {
    return url;
  }
}

type Queued = { url: string; depth: number; read?: { url: string; parsed: ParsedSitemap } };

/**
 * Read a website's sitemap, up to `limit` pages: find it, follow its indexes,
 * read its page files, and keep each page once.
 */
export async function readSitemap(options: {
  host: string;
  limit: number;
  fetchText: FetchText;
  now?: () => number;
  budgetMs?: number;
  maxFiles?: number;
}): Promise<SitemapReading> {
  const { host, fetchText } = options;
  const limit = Math.max(1, Math.floor(options.limit));
  const now = options.now ?? Date.now;
  const started = now();
  const budget = options.budgetMs ?? READING_BUDGET_MS;
  const maxFiles = options.maxFiles ?? MAX_FILES_READ;
  const files: SitemapFile[] = [];
  const pages: SitemapPage[] = [];
  const seen = new Set<string>();
  const queued = new Set<string>();
  const queue: Queued[] = [];
  let answered = false;
  let cut = false;

  const note = (file: SitemapFile) => {
    if (files.length < MAX_FILES_LISTED) files.push(file);
  };
  const enqueue = (address: string, depth: number) => {
    const url = sitemapAddress(address, host);
    if (!url) {
      note({ url: address.trim(), pages: 0, problem: "OTHER_WEBSITE" });
      return;
    }
    if (queued.has(url)) return;
    queued.add(url);
    queue.push({ url, depth });
  };

  const robots = await fetchText(`https://${siteHosts(host)[0]}/robots.txt`, "robots");
  answered = robots.ok || robots.missing;
  for (const address of robots.ok ? robotsSitemaps(robots.text) : []) enqueue(address, 0);

  let source: SitemapReading["source"] = "ROBOTS";
  if (queue.length === 0) {
    source = "USUAL_ADDRESS";
    for (const path of USUAL_SITEMAP_PATHS) {
      const url = `https://${siteHosts(host)[0]}${path}`;
      const got = await fetchText(url, "sitemap");
      if (got.ok || got.missing) answered = true;
      if (!got.ok) continue;
      const parsed = parseSitemap(got.text);
      if (parsed.kind === "other") continue;
      queued.add(url);
      queue.push({ url, depth: 0, read: { url: got.url, parsed } });
      break;
    }
    if (queue.length === 0) return { source: "NONE", files, pages: [], cut: false, problem: answered ? "NONE_FOUND" : "UNREACHABLE" };
  }

  let read = 0;
  while (queue.length > 0) {
    if (pages.length >= limit) {
      cut = true;
      break;
    }
    if (read >= maxFiles || now() - started > budget) {
      // What is left is noted once, not file by file: an index can list thousands.
      note({ url: queue[0].url, pages: 0, problem: `UNREAD:${queue.length}` });
      break;
    }
    const next = queue.shift()!;
    read += 1;
    let parsed = next.read?.parsed;
    if (!parsed) {
      const got = await fetchText(next.url, "sitemap");
      if (!got.ok) {
        note({ url: next.url, pages: 0, problem: got.problem });
        continue;
      }
      parsed = parseSitemap(got.text);
    }
    if (parsed.kind === "other") {
      note({ url: next.url, pages: 0, problem: "NOT_A_SITEMAP" });
      continue;
    }
    if (parsed.kind === "index") {
      if (next.depth >= MAX_INDEX_DEPTH) {
        note({ url: next.url, pages: 0, problem: "TOO_DEEP" });
        continue;
      }
      for (const loc of parsed.locs) enqueue(loc, next.depth + 1);
      continue;
    }
    const file = fileNameOf(next.url);
    let kept = 0;
    for (const entry of parsed.entries) {
      if (!onWebsite(entry.loc, host)) continue;
      const page = normalisePage(entry.loc);
      if (seen.has(page)) continue;
      if (pages.length >= limit) {
        cut = true;
        break;
      }
      seen.add(page);
      pages.push(entry.lastmod ? { page, file, lastmod: entry.lastmod } : { page, file });
      kept += 1;
    }
    note({ url: next.url, pages: kept });
    if (cut) break;
  }
  return { source, files, pages, cut };
}
