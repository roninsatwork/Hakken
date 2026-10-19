/**
 * The Auto Setup agent's definition and its limits (docs/plans/active/
 * auto-setup-plan.md, AS1–AS12): the built-in agent that writes a company's
 * empty setup boxes — its own websites' names and profile, the company's
 * description, starting Google searches and AI questions, and its rivals'
 * names — from the websites themselves, a web search and what the rivals rank
 * for. It runs only when someone presses Auto Setup on the company's Websites
 * tab (AS3); nothing starts it by itself, and it never switches collection on
 * (AS10). Plain code, free of any Convex function.
 */
export const AUTO_SETUP = {
  systemKey: "AUTO_SETUP",
  name: "Auto Setup",
  description:
    "Writes what a company's websites need before they are collected: names, profiles, Google searches and AI questions, from the websites themselves, a web search and what the rivals rank for. Only the empty boxes, and only when someone presses Auto Setup.",
  systemPrompt:
    "You set up a company's websites so the platform can collect them. Read the pages you are given, search the web where the pages do not say, and write plain, customer-worded names, profiles, searches and questions.",
  standingObjective: "Fill a company's empty setup boxes for its own websites and its rivals, never changing what a person wrote.",
} as const;

/** The spend a run may reach before it stops, when its agent has none of its own (AS1). */
export const DEFAULT_RUN_CAP_USD = 2;

/** The spend Auto Setup's runs may reach in a day, together, when its agent has none of its own (AS2). */
export const DEFAULT_DAY_CAP_USD = 10;

/** Pages read from each of the company's own websites: its home page and up to five more of its main pages (AS6). */
export const OWN_PAGES_READ = 6;

/** Pages read from each rival: its home page (AS6). */
export const RIVAL_PAGES_READ = 1;

/** Web searches one run may make, together (AS7). */
export const WEB_SEARCHES_PER_RUN = 10;

/** Google searches written for each of the company's own websites, at most (AS5 and its limits table). */
export const SEARCHES_WRITTEN = 25;

/** A rival's ranked searches read, the ones bringing it the most visits (AS8). */
export const RIVAL_RANKINGS_READ = 100;

/** Rivals named in one step: each is one home page read, and their names are written in one call. */
export const RIVALS_PER_STEP = 8;

/** A page's words passed to the writer, at most: enough for what it sells, not the whole site. */
export const PAGE_WORDS = 1_800;

/** A run whose last step is older than this has lost it: the watch carries it on from where it was. */
export const AUTO_SETUP_STALL_MS = 10 * 60 * 1000;

/** The most steps one run takes: one per own website, one per eight rivals and its end, with room to spare. */
export const MOST_STEPS = 60;

/**
 * What a page read costs, in US dollars, at Firecrawl's price for this
 * deployment: one scrape is one credit. Set FIRECRAWL_COST_PER_PAGE_USD to the
 * plan's price per credit; until then a credit is costed at the Standard
 * plan's $0.001, so a page read is never recorded as free (AS12).
 */
export function pageReadCostUsd(): number {
  const set = Number(process.env.FIRECRAWL_COST_PER_PAGE_USD);
  return Number.isFinite(set) && set >= 0 ? set : 0.001;
}

/**
 * What one web search costs, in US dollars. Set WEB_SEARCH_COST_USD to the
 * model provider's price; until then a search is costed at $0.035, the
 * dearest of the providers' published prices, so the cap is never reached
 * later than it should be (AS12).
 */
export function webSearchCostUsd(): number {
  const set = Number(process.env.WEB_SEARCH_COST_USD);
  return Number.isFinite(set) && set >= 0 ? set : 0.035;
}

/**
 * What Auto Setup wrote a box from, kept as a short code so each screen says
 * it in its own language (AS5): the website's pages, its pages and a web
 * search, its home page, a web search alone, what the rivals rank for (with
 * the rivals), or its own name. "PAGES:nec.ac.uk", "RIVALS:a.com,b.com".
 */
export type SourceKind = "PAGES" | "PAGES_WEB" | "HOME" | "WEB" | "RIVALS" | "OWN_NAME";

const SOURCE_KINDS: readonly SourceKind[] = ["PAGES", "PAGES_WEB", "HOME", "WEB", "RIVALS", "OWN_NAME"];

export function sourceCode(kind: SourceKind, hosts: readonly string[] = []): string {
  return hosts.length > 0 ? `${kind}:${hosts.join(",")}` : kind;
}

export function readSource(code: string | null | undefined): { kind: SourceKind; hosts: string[] } | null {
  if (!code) return null;
  const [kind, rest] = code.split(":", 2);
  if (!SOURCE_KINDS.includes(kind as SourceKind)) return null;
  return { kind: kind as SourceKind, hosts: rest ? rest.split(",").filter(Boolean) : [] };
}

/**
 * What a run is doing now, said under the bar on the Auto Setup page (asked
 * for on 2026-10-19 after a run's bar sat empty for two minutes): reading a
 * website's pages, searching the web for how people name it or what its
 * customers ask, writing its names and profile, looking up a rival's
 * rankings, writing its searches and questions, reading the rivals' home
 * pages, naming the rivals.
 */
export const DOING = ["READ_PAGES", "SEARCH_NAMES", "SEARCH_ASKS", "WRITE_PROFILE", "RANKINGS", "WRITE_LISTS", "READ_RIVALS", "NAME_RIVALS"] as const;
export type Doing = (typeof DOING)[number];

type Gaps = readonly ("names" | "profile" | "searches" | "questions" | "countries")[];

/** The web searches setting up one of the company's own websites makes: how people name it, and what its customers ask. */
export function webSearchTopics(gaps: Gaps): number {
  return (gaps.includes("names") ? 1 : 0) + (gaps.includes("searches") || gaps.includes("questions") ? 1 : 0);
}

/**
 * The pieces of work setting up one of the company's own websites takes, each
 * moving the page's bar on: its pages read, each web search, its names and
 * profile written, each rival's rankings looked up, and its searches and
 * questions written. A piece found unneeded on the way — rankings already
 * held — is counted done when the website is.
 */
export function ownPieces(site: { gaps: Gaps; companyEmpty: boolean; rivals: number; webSearchesLeft: number }): number {
  const { gaps } = site;
  const profile = gaps.includes("names") || gaps.includes("profile") || gaps.includes("countries") || site.companyEmpty;
  const lists = gaps.includes("searches") || gaps.includes("questions");
  return 1 + Math.min(webSearchTopics(gaps), site.webSearchesLeft) + (profile ? 1 : 0) + (gaps.includes("searches") ? site.rivals : 0) + (lists ? 1 : 0);
}

/** The pieces of work naming rivals takes: for each eight, their home pages read and their names written. */
export function rivalPieces(rivals: number): number {
  return 2 * Math.ceil(rivals / RIVALS_PER_STEP);
}
