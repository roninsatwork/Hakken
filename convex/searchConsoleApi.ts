import type { SearchConsoleList, SearchType } from "./searchConsoleSchema";
import { callGoogle, type GoogleFailure } from "./googleApi";

/**
 * Google Search Console's API, as Hakken calls it
 * (docs/plans/active/search-console-plan.md §2): the account's properties,
 * which of them are a given website, and a site's figures. No database here —
 * `searchConsoleConnect.ts` and `searchConsoleSync.ts` decide what an answer
 * means for a connection. Free to call; Google's limits are per site and per
 * user a minute, and a busy answer is tried again.
 */

export const SEARCH_CONSOLE_READ_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

/** Asked on consent: Search Console, read-only, and which account said yes. */
export const SEARCH_CONSOLE_SCOPES = [SEARCH_CONSOLE_READ_SCOPE, "openid", "https://www.googleapis.com/auth/userinfo.email"];

const API = "https://searchconsole.googleapis.com/webmasters/v3";

/** Rows Google gives in one answer; more are paged with `startRow`. */
export const GOOGLE_PAGE_ROWS = 25_000;

/** Google gives at most 50,000 rows a day for each kind of result; asking past this finds nothing more. */
const MOST_ROWS = 50_000;
/** The most rows Google gives one ask (`MOST_ROWS`): a list this long may be cut, and its screens say so (18 November 2026). */
export const GOOGLE_MOST_ROWS = MOST_ROWS;

/** The permission levels that can read a property's figures. An unverified user cannot. */
const READERS = new Set(["siteOwner", "siteFullUser", "siteRestrictedUser"]);

/** Google's refusals, read the same way for Search Console and Analytics (`googleApi.ts`). */
export type { GoogleFailure };

const call = callGoogle;

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

export type Property = { property: string; permission: string };

/** Every property the account can see in Search Console, readable or not. */
export async function listProperties(accessToken: string): Promise<{ ok: true; properties: Property[] } | GoogleFailure> {
  const answer = await call(`${API}/sites`, accessToken);
  if (!answer.ok) return answer;
  const entries = (answer.json as { siteEntry?: { siteUrl?: string; permissionLevel?: string }[] }).siteEntry ?? [];
  return {
    ok: true,
    properties: entries.flatMap((entry) => entry.siteUrl
      ? [{ property: entry.siteUrl, permission: entry.permissionLevel ?? "siteUnverifiedUser" }]
      : []),
  };
}

/** A host as `websites.host` stores it: lowercase, punycode, no `www.`. */
function bareHost(host: string): string | null {
  try {
    return new URL(`http://${host}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * How a property covers a site, best first: 0 a domain property that is the
 * site, 1 the site's own address from its root, 2 part of the site (an
 * address with a path), 3 a domain property the site is a subdomain of —
 * its figures would be the whole domain's. Null when it is not this site.
 */
export function propertyFit(property: string, siteHost: string): 0 | 1 | 2 | 3 | null {
  const site = bareHost(siteHost);
  if (!site) return null;
  if (property.startsWith("sc-domain:")) {
    const domain = bareHost(property.slice("sc-domain:".length));
    if (!domain) return null;
    if (domain === site) return 0;
    return site.endsWith(`.${domain}`) ? 3 : null;
  }
  let url: URL;
  try {
    url = new URL(property);
  } catch {
    return null;
  }
  if (bareHost(url.hostname) !== site) return null;
  return url.pathname === "/" ? 1 : 2;
}

/**
 * The account's properties that are this website, best first, split into
 * the ones it can read and the ones it is not verified for. A property that
 * is the whole site and the only one readable is `only`: chosen without
 * asking.
 */
export function propertiesForHost(properties: Property[], siteHost: string): {
  readable: Property[];
  unverified: Property[];
  only: Property | null;
} {
  const fitting = properties
    .map((entry) => ({ entry, fit: propertyFit(entry.property, siteHost) }))
    .filter((row): row is { entry: Property; fit: 0 | 1 | 2 | 3 } => row.fit !== null)
    // https before http, then as Google spells them, so the order is the same every time.
    .sort((left, right) => left.fit - right.fit
      || Number(right.entry.property.startsWith("https:")) - Number(left.entry.property.startsWith("https:"))
      || left.entry.property.localeCompare(right.entry.property));
  const readable = fitting.filter((row) => READERS.has(row.entry.permission));
  const whole = readable.filter((row) => row.fit <= 1);
  return {
    readable: readable.map((row) => row.entry),
    unverified: fitting.filter((row) => !READERS.has(row.entry.permission)).map((row) => row.entry),
    only: readable.length === 1 && whole.length === 1 ? whole[0].entry : null,
  };
}

// ---------------------------------------------------------------------------
// Figures
// ---------------------------------------------------------------------------

export type AnalyticsRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };

/**
 * What Hakken asks Google for each list it keeps (plan §14.3): a pair is a
 * search with the page it brought people to, asked together; the rest one
 * split each.
 */
export const GOOGLE_DIMENSIONS: Record<SearchConsoleList, readonly string[]> = {
  pair: ["query", "page"],
  // Each search once, as Google counts it: the search's own figures (fix 1, 21 November 2026).
  query: ["query"],
  page: ["page"],
  country: ["country"],
  device: ["device"],
  appearance: ["searchAppearance"],
};

/**
 * The lists asked of every country, never with a home country's filter.
 * The country list, so Countries and devices shows where the clicks come
 * from (search-console-home-countries-plan.md, decision 4); and the pages
 * (Anthony, 2026-11-17: "Every country's pages"). Google leaves the searches
 * it keeps private out of a page's figures whenever a country is named,
 * filtered or split by. Tested on morehandles.co.uk's 15 October 2026: its
 * pages added up to 68 of the 266 clicks in the United Kingdom, to 80 of 315
 * split by country, and to 317 of 315 asked of no country. So a page's
 * figures — the page list, one page's days and devices — are every
 * country's, while its searches, the website's totals and the other lists
 * stay the home country's.
 */
export const EVERY_COUNTRY_LISTS: ReadonlySet<SearchConsoleList> = new Set(["country", "page"]);

/**
 * The lists each kind of result has. Discover and Google News have no
 * searches — people did not type anything — so no pairs, and no search
 * appearance. Google Images keeps its totals and pages but not its searches
 * (finish-off plan, store less round two, A — agreed 2026-10-05): its
 * search-and-page lines were a fifth of a busy website's storage. A kind
 * with searches keeps each search alone as well (`query`, fix 1).
 */
export const LISTS_OF: Record<SearchType, readonly SearchConsoleList[]> = {
  web: ["pair", "query", "page", "country", "device", "appearance"],
  image: ["page", "country", "device", "appearance"],
  video: ["pair", "query", "page", "country", "device", "appearance"],
  news: ["pair", "query", "page", "country", "device", "appearance"],
  discover: ["page", "country", "device"],
  googleNews: ["page", "country", "device"],
};

type Ask = {
  startDate: string;
  endDate: string;
  type: SearchType;
  dimensions: string[];
  /** Only the rows for one search or one page, when a screen asks what was shown with it. */
  dimensionFilterGroups?: Array<{ filters: Array<{ dimension: string; operator: string; expression: string }> }>;
};

/**
 * Every row Google has for one ask, paged by 25,000 up to its 50,000 a day.
 * Fresh figures included (`dataState: "all"`): the last days are fetched
 * again each day until they settle. `together` asks for the two pages at
 * once, for an answer a person waits on that is often longer than one page:
 * a month of More Handles' keywords and pages was 50,000 rows, two asks of
 * 2.7 seconds one after the other (speed fixes, 18 November 2026). The second
 * is one request more when the first holds every row, and the answer is the
 * same either way.
 */
export async function queryAnalytics(
  accessToken: string,
  property: string,
  ask: Ask,
  how: { together?: boolean } = {},
): Promise<{ ok: true; rows: AnalyticsRow[]; requests: number } | GoogleFailure> {
  const url = `${API}/sites/${encodeURIComponent(property)}/searchAnalytics/query`;
  const askPage = async (startRow: number) => await call(url, accessToken, { ...ask, dataState: "all", rowLimit: GOOGLE_PAGE_ROWS, startRow });
  const rowsOf = (json: unknown) => ((json as { rows?: AnalyticsRow[] }).rows ?? []).map((row) => ({
    keys: row.keys ?? [],
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0,
  }));
  const rows: AnalyticsRow[] = [];
  let requests = 0;
  for (let startRow = 0; startRow < MOST_ROWS; startRow += GOOGLE_PAGE_ROWS) {
    const both = how.together && startRow + GOOGLE_PAGE_ROWS < MOST_ROWS;
    const [answer, next] = await Promise.all([askPage(startRow), both ? askPage(startRow + GOOGLE_PAGE_ROWS) : null]);
    requests += both ? 2 : 1;
    if (!answer.ok) return answer;
    const page = rowsOf(answer.json);
    rows.push(...page);
    if (page.length < GOOGLE_PAGE_ROWS) break;
    if (!next) continue;
    if (!next.ok) return next;
    const after = rowsOf(next.json);
    rows.push(...after);
    startRow += GOOGLE_PAGE_ROWS;
    if (after.length < GOOGLE_PAGE_ROWS) break;
  }
  return { ok: true, rows, requests };
}
