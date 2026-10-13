import { propertyFit } from "./searchConsoleApi";

/**
 * Bing Webmaster Tools' API (docs/plans/active/bing-webmaster-plan.md §2):
 * the calls Hakken makes with a website's Bing sign-in, and what their
 * answers mean. No database here.
 *
 * Bing answers in WCF's JSON: the result under `d`, dates as
 * `/Date(1316156400000-0700)/`. Every call is a GET with the site's address
 * as `siteUrl`, the access token as a Bearer header.
 */

export const BING_API = "https://www.bing.com/webmaster/api.svc/json";

/**
 * What Hakken asks Bing for at sign-in: read only (BW5). The answer to §10,
 * Q2 decides whether this becomes `webmaster.manage`, the read-and-change
 * permission asking Bing to read a page again needs.
 */
export const BING_SCOPE = "webmaster.read";

/**
 * Why Bing said no, in the same words as Google's (`googleApi.ts`): the token
 * is no good (`EXPIRED`), the account cannot read the site (`ACCESS`), Bing is
 * busy or failing (`BUSY`), the question was refused (`REFUSED`), or Bing
 * could not be reached.
 */
export type BingFailure = {
  ok: false;
  reason: "EXPIRED" | "ACCESS" | "BUSY" | "REFUSED" | "UNREACHABLE";
  status: number;
  detail: string;
};

async function failureOf(response: Response): Promise<BingFailure> {
  const detail = (await response.text().catch(() => "")).slice(0, 300);
  const status = response.status;
  if (status === 401) return { ok: false, reason: "EXPIRED", status, detail };
  if (status === 429 || status >= 500 || /throttl|quota/i.test(detail)) return { ok: false, reason: "BUSY", status, detail };
  // Bing names a site the account cannot read in a 400 or 403: "NotAuthorized", "UserNotAuthorized".
  if (status === 403 || /notauthori[sz]ed|unauthori[sz]ed/i.test(detail)) return { ok: false, reason: "ACCESS", status, detail };
  return { ok: false, reason: "REFUSED", status, detail };
}

/** One call to Bing's API: the answer's `d`, or why it failed. */
export async function callBing(
  method: string,
  accessToken: string,
  params: Record<string, string>,
): Promise<{ ok: true; json: unknown } | BingFailure> {
  let response: Response;
  try {
    response = await fetch(`${BING_API}/${method}?${new URLSearchParams(params)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
  } catch {
    return { ok: false, reason: "UNREACHABLE", status: 0, detail: "Bing could not be reached." };
  }
  if (!response.ok) return await failureOf(response);
  const json = (await response.json().catch(() => null)) as { d?: unknown } | null;
  return { ok: true, json: json && typeof json === "object" && "d" in json ? json.d : json };
}

// ---------------------------------------------------------------------------
// Bing's own shapes
// ---------------------------------------------------------------------------

/**
 * A day from Bing's WCF date: the day it names where it was written — the
 * offset Bing gives, else UTC — as "2026-10-11". Null when it is not a date.
 */
export function dayOfBingDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const wcf = /^\/Date\((-?\d+)([+-]\d{4})?\)\/$/.exec(value);
  if (wcf) {
    const offset = wcf[2] ? (wcf[2][0] === "-" ? -1 : 1) * (Number(wcf[2].slice(1, 3)) * 60 + Number(wcf[2].slice(3))) : 0;
    const local = new Date(Number(wcf[1]) + offset * 60_000);
    return Number.isNaN(local.getTime()) ? null : local.toISOString().slice(0, 10);
  }
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return iso ? iso[1] : null;
}

const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0);

/** Bing's average position, or null where it has none (Bing writes -1 for no clicks). */
export function positionOf(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

const listOf = (json: unknown): Record<string, unknown>[] =>
  Array.isArray(json) ? json.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object") : [];

// ---------------------------------------------------------------------------
// The sites an account can see
// ---------------------------------------------------------------------------

export type BingSite = { site: string; verified: boolean };

/** The sites the signed-in account has in Bing Webmaster Tools. */
export async function listUserSites(accessToken: string): Promise<{ ok: true; sites: BingSite[] } | BingFailure> {
  const answer = await callBing("GetUserSites", accessToken, {});
  if (!answer.ok) return answer;
  return {
    ok: true,
    sites: listOf(answer.json).flatMap((entry) => typeof entry.Url === "string" && entry.Url
      ? [{ site: entry.Url, verified: entry.IsVerified === true }]
      : []),
  };
}

/**
 * The account's sites that are this website, best first (the whole site
 * before a part of it, https before http), split into the verified ones Bing
 * lets it read and the ones it has not verified. One verified site that is
 * the whole website is `only`: chosen without asking (§3, step 3).
 */
export function sitesForHost(sites: BingSite[], siteHost: string): { readable: BingSite[]; unverified: BingSite[]; only: BingSite | null } {
  const fitting = sites
    .map((entry) => ({ entry, fit: propertyFit(entry.site, siteHost) }))
    .filter((row): row is { entry: BingSite; fit: 0 | 1 | 2 | 3 } => row.fit !== null)
    .sort((left, right) => left.fit - right.fit
      || Number(right.entry.site.startsWith("https:")) - Number(left.entry.site.startsWith("https:"))
      || left.entry.site.localeCompare(right.entry.site));
  const readable = fitting.filter((row) => row.entry.verified);
  const whole = readable.filter((row) => row.fit <= 1);
  return {
    readable: readable.map((row) => row.entry),
    unverified: fitting.filter((row) => !row.entry.verified).map((row) => row.entry),
    only: readable.length === 1 && whole.length === 1 ? whole[0].entry : null,
  };
}

// ---------------------------------------------------------------------------
// Figures
// ---------------------------------------------------------------------------

export type BingTrafficDay = { day: string; clicks: number; impressions: number };

/** The whole site's clicks and impressions, a day at a time (`GetRankAndTrafficStats`). */
export async function trafficDays(accessToken: string, site: string): Promise<{ ok: true; days: BingTrafficDay[] } | BingFailure> {
  const answer = await callBing("GetRankAndTrafficStats", accessToken, { siteUrl: site });
  if (!answer.ok) return answer;
  const byDay = new Map<string, BingTrafficDay>();
  for (const entry of listOf(answer.json)) {
    const day = dayOfBingDate(entry.Date);
    if (day) byDay.set(day, { day, clicks: count(entry.Clicks), impressions: count(entry.Impressions) });
  }
  return { ok: true, days: [...byDay.values()].sort((left, right) => left.day.localeCompare(right.day)) };
}

/**
 * A keyword's or a page's figures for one of Bing's weeks: `key` is the
 * keyword (`GetQueryStats`) or the page's address (`GetPageStats`), `day` the
 * date Bing gives the week. The position is Bing's average place when shown
 * (`AvgImpressionPosition`), the one Google's position is compared with.
 */
export type BingStatRow = { key: string; day: string; clicks: number; impressions: number; position: number | null };

function statRows(json: unknown): BingStatRow[] {
  return listOf(json).flatMap((entry) => {
    const day = dayOfBingDate(entry.Date);
    const key = typeof entry.Query === "string" ? entry.Query.trim() : "";
    if (!day || !key) return [];
    return [{ key, day, clicks: count(entry.Clicks), impressions: count(entry.Impressions), position: positionOf(entry.AvgImpressionPosition) }];
  });
}

/** Every keyword Bing has for the site, week by week (`GetQueryStats`): Bing chooses the dates. */
export async function queryStats(accessToken: string, site: string): Promise<{ ok: true; rows: BingStatRow[] } | BingFailure> {
  const answer = await callBing("GetQueryStats", accessToken, { siteUrl: site });
  return answer.ok ? { ok: true, rows: statRows(answer.json) } : answer;
}

/** Every page Bing has for the site, week by week (`GetPageStats`). */
export async function pageStats(accessToken: string, site: string): Promise<{ ok: true; rows: BingStatRow[] } | BingFailure> {
  const answer = await callBing("GetPageStats", accessToken, { siteUrl: site });
  return answer.ok ? { ok: true, rows: statRows(answer.json) } : answer;
}

/** The pages Bing showed for one keyword (`GetQueryPageStats`), for its own screen. */
export async function keywordPages(accessToken: string, site: string, keyword: string): Promise<{ ok: true; rows: BingStatRow[] } | BingFailure> {
  const answer = await callBing("GetQueryPageStats", accessToken, { siteUrl: site, query: keyword });
  return answer.ok ? { ok: true, rows: statRows(answer.json) } : answer;
}

/** The keywords Bing showed one page for (`GetPageQueryStats`), for its own screen. */
export async function pageKeywords(accessToken: string, site: string, page: string): Promise<{ ok: true; rows: BingStatRow[] } | BingFailure> {
  const answer = await callBing("GetPageQueryStats", accessToken, { siteUrl: site, page });
  return answer.ok ? { ok: true, rows: statRows(answer.json) } : answer;
}

/** How Bing read the site on one day (`GetCrawlStats`). */
export type BingCrawlDay = {
  day: string;
  crawled: number;
  errors: number;
  inIndex: number;
  inLinks: number;
  blockedByRobots: number;
  malware: number;
  code2xx: number;
  code301: number;
  code302: number;
  code4xx: number;
  code5xx: number;
  otherCodes: number;
  dnsFailures: number;
  timeouts: number;
};

export async function crawlDays(accessToken: string, site: string): Promise<{ ok: true; days: BingCrawlDay[] } | BingFailure> {
  const answer = await callBing("GetCrawlStats", accessToken, { siteUrl: site });
  if (!answer.ok) return answer;
  const byDay = new Map<string, BingCrawlDay>();
  for (const entry of listOf(answer.json)) {
    const day = dayOfBingDate(entry.Date);
    if (!day) continue;
    byDay.set(day, {
      day,
      crawled: count(entry.CrawledPages),
      errors: count(entry.CrawlErrors),
      inIndex: count(entry.InIndex),
      inLinks: count(entry.InLinks),
      blockedByRobots: count(entry.BlockedByRobotsTxt),
      malware: count(entry.ContainsMalware),
      code2xx: count(entry.Code2xx),
      code301: count(entry.Code301),
      code302: count(entry.Code302),
      code4xx: count(entry.Code4xx),
      code5xx: count(entry.Code5xx),
      otherCodes: count(entry.AllOtherCodes),
      dnsFailures: count(entry.DnsFailures),
      timeouts: count(entry.ConnectionTimeout),
    });
  }
  return { ok: true, days: [...byDay.values()].sort((left, right) => left.day.localeCompare(right.day)) };
}

/**
 * One page in Bing's index (`GetUrlInfo`): when Bing last read it and what
 * the page answered. A page Bing does not hold answers with no date.
 */
export type BingPageInfo = { inIndex: boolean; lastRead: string | null; status: number | null };

export async function pageInfo(accessToken: string, site: string, page: string): Promise<{ ok: true; info: BingPageInfo } | BingFailure> {
  const answer = await callBing("GetUrlInfo", accessToken, { siteUrl: site, url: page });
  if (!answer.ok) {
    // Bing refuses a page it does not hold: not in its index, not a failure.
    if (answer.reason === "REFUSED" && answer.status === 400) return { ok: true, info: { inIndex: false, lastRead: null, status: null } };
    return answer;
  }
  const info = answer.json && typeof answer.json === "object" ? answer.json as Record<string, unknown> : {};
  const lastRead = dayOfBingDate(info.LastCrawledDate);
  return {
    ok: true,
    info: {
      inIndex: lastRead !== null && lastRead > "1990-01-01",
      lastRead: lastRead !== null && lastRead > "1990-01-01" ? lastRead : null,
      status: typeof info.HttpStatus === "number" ? info.HttpStatus : null,
    },
  };
}
