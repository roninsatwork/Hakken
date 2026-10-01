/**
 * Reading a News source's feed (docs/plans/active/knowledge-news-and-digest-
 * plan.md, phase 5): RSS 2.0 and Atom, which between them cover blogs, news
 * sites and every YouTube channel (`/feeds/videos.xml?channel_id=…`), and
 * finding a site's or channel's feed from its page. Plain text in, plain
 * values out, so it is tested without the network; the News Collector
 * fetches (`newsCollectorActions.ts`).
 *
 * Written by hand rather than with an XML library: a feed is a small, flat
 * document, the fields read are few, and a feed that is not quite valid XML —
 * common in the wild — still gives up its items.
 */

export type FeedEntry = {
  title: string;
  /** The item's own page, absolute. */
  url: string;
  /** What makes it the same item again: its link, or its id when it has no link. */
  key: string;
  /** When the source published it, or null when the feed does not say. */
  publishedAt: number | null;
  /** The item's words as plain text — its description, summary or content — cut to a length worth summarising. */
  text: string;
};

/** Enough of an item to summarise; the rest is left on its own page. */
export const ENTRY_TEXT_LIMIT = 6_000;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", copy: "©", reg: "®", trade: "™",
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** A field's value with its CDATA unwrapped and entities decoded, before any tags are stripped. */
function unwrap(value: string): string {
  const cdata = value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  return cdata === value ? decodeEntities(value) : cdata;
}

/** HTML as the words a reader sees: tags, scripts and styles gone, entities decoded, spaces collapsed. */
export function textOf(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v\r]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** The first `<name>…</name>` inside `block`, unwrapped, or "" — a prefixed name ("media:description") too. */
function field(block: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)</${escaped}>`, "i"));
  return match ? unwrap(match[1]).trim() : "";
}

function attribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return match ? decodeEntities(match[2] ?? match[3] ?? "") : null;
}

function absolute(href: string, base: string): string | null {
  try {
    const url = new URL(href.trim(), base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function dateOf(value: string): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function blocks(xml: string, name: string): string[] {
  return [...xml.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "gi"))].map((match) => match[1]);
}

/** An Atom entry's page: its `alternate` link, or the first link with no `rel`. */
function atomLink(entry: string, base: string): string | null {
  const links = [...entry.matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]);
  const chosen = links.find((tag) => (attribute(tag, "rel") ?? "alternate") === "alternate") ?? links[0];
  const href = chosen ? attribute(chosen, "href") : null;
  return href ? absolute(href, base) : null;
}

/**
 * The items in an RSS 2.0 or Atom feed, in the feed's order. An item with no
 * page to link to is left out: a News item always leads to the original.
 */
export function parseFeed(xml: string, base: string): FeedEntry[] {
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const entries: FeedEntry[] = [];
  for (const block of blocks(xml, isAtom ? "entry" : "item")) {
    const linked = isAtom ? null : field(block, "link") || field(block, "guid");
    const url = isAtom ? atomLink(block, base) : linked ? absolute(linked, base) : null;
    if (!url) continue;
    const id = isAtom ? field(block, "id") : field(block, "guid");
    const body = isAtom
      ? field(block, "media:description") || field(block, "content") || field(block, "summary")
      : field(block, "content:encoded") || field(block, "description");
    entries.push({
      title: textOf(field(block, "title")),
      url,
      key: url || id,
      publishedAt: dateOf(isAtom ? field(block, "published") || field(block, "updated") : field(block, "pubDate") || field(block, "dc:date")),
      text: textOf(body).slice(0, ENTRY_TEXT_LIMIT),
    });
  }
  return entries;
}

/** Whether a body is a feed rather than a page. */
export function looksLikeFeed(body: string): boolean {
  const head = body.slice(0, 2_000);
  return /<rss[\s>]/i.test(head) || /<feed[\s>]/i.test(head) || /<rdf:RDF[\s>]/i.test(head);
}

/** The feeds a page announces in its `<head>` — RSS first, then Atom — absolute. */
export function feedLinksIn(html: string, base: string): string[] {
  const found: Array<{ url: string; rss: boolean }> = [];
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = (attribute(tag, "rel") ?? "").toLowerCase().split(/\s+/);
    const type = (attribute(tag, "type") ?? "").toLowerCase();
    if (!rel.includes("alternate") || !/application\/(rss|atom)\+xml/.test(type)) continue;
    const href = attribute(tag, "href");
    const url = href ? absolute(href, base) : null;
    if (url && !found.some((entry) => entry.url === url)) found.push({ url, rss: type.includes("rss") });
  }
  return [...found.filter((entry) => entry.rss), ...found.filter((entry) => !entry.rss)].map((entry) => entry.url);
}

/** A channel's feed address, when its own address already names the channel. */
export function youtubeFeedFromAddress(address: string): string | null {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return null;
  }
  if (!/(^|\.)youtube\.com$/i.test(url.hostname)) return null;
  if (url.pathname === "/feeds/videos.xml" && url.searchParams.get("channel_id")) return url.toString();
  const channel = url.pathname.match(/^\/channel\/(UC[\w-]{20,})/);
  return channel ? `https://www.youtube.com/feeds/videos.xml?channel_id=${channel[1]}` : null;
}

/** A channel's feed address from its page — an `@handle` page names its channel there. */
export function youtubeFeedFromPage(html: string): string | null {
  const announced = feedLinksIn(html, "https://www.youtube.com/").find((url) => url.includes("/feeds/videos.xml"));
  if (announced) return announced;
  const id = html.match(/"(?:channelId|externalId)"\s*:\s*"(UC[\w-]{20,})"/)?.[1]
    ?? html.match(/<meta[^>]+itemprop="(?:channelId|identifier)"[^>]+content="(UC[\w-]{20,})"/i)?.[1];
  return id ? `https://www.youtube.com/feeds/videos.xml?channel_id=${id}` : null;
}

/** What a website's feed is usually called. */
const COMMON_FEED_NAMES = ["feed", "rss.xml", "feed.xml", "atom.xml", "rss", "index.xml"] as const;

/**
 * Where a website's feed usually lives, tried in turn when its page announces
 * none: under the page's own path first — Google's blog keeps its feed at
 * `/search/blog/feed.xml` — then at the site's root.
 */
export function feedGuesses(address: string): string[] {
  let page: URL;
  try {
    page = new URL(address);
  } catch {
    return [];
  }
  const folder = new URL(page.pathname.endsWith("/") ? page.pathname : `${page.pathname}/`, page.origin);
  const guesses = [
    ...COMMON_FEED_NAMES.map((name) => new URL(name, folder).toString()),
    ...COMMON_FEED_NAMES.map((name) => new URL(`/${name}`, page.origin).toString()),
  ];
  return [...new Set(guesses)];
}

/** Paths that list articles rather than being one. */
const NOT_AN_ARTICLE = /\/(tag|tags|category|categories|author|authors|page|search|topics?|archive|about|contact|privacy|terms|login|signup|cart|account)(\/|$)|\.(jpe?g|png|gif|webp|svg|pdf|zip|mp4|mp3|css|js|xml)$/i;

/**
 * The links on a website's news or blog page that look like its articles,
 * for a site with no feed, read through Firecrawl: on the same site, under
 * the page's own path when it has one, and named like an article — a slug
 * with hyphens, or a date — rather than a listing, a tag or a file.
 */
export function articleLinks(links: readonly string[], page: string): string[] {
  let base: URL;
  try {
    base = new URL(page);
  } catch {
    return [];
  }
  const under = base.pathname.replace(/\/+$/, "");
  // One per article, however it is written: with or without "www.", a fragment or a query.
  const found = new Map<string, string>();
  for (const link of links) {
    let url: URL;
    try {
      url = new URL(link, base);
    } catch {
      continue;
    }
    if (url.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "")) continue;
    url.hash = "";
    url.search = "";
    const path = url.pathname.replace(/\/+$/, "");
    if (!path || path === under || (under && !path.startsWith(`${under}/`))) continue;
    if (NOT_AN_ARTICLE.test(path)) continue;
    const last = path.split("/").pop() ?? "";
    if (!/-.*-/.test(last) && !/\/\d{4}\/\d{1,2}\//.test(`${path}/`)) continue;
    const same = `${url.hostname.replace(/^www\./, "")}${path}`;
    if (!found.has(same)) found.set(same, url.toString());
  }
  return [...found.values()];
}
