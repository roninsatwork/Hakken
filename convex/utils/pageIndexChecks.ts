import { isIndexed } from "./indexingReasons";

/**
 * Search Console's page checks, the plain parts (search-console-indexing-v1-plan-2026-11-18.md, "Reads, and the new
 * collector"): Google's URL inspection answer read into the row kept for a page, its limits, Google's day, and what a
 * refusal means. No database here, so the collector and its tests read Google's answers the same way.
 *
 * Google gives apps no Page indexing totals: its URL inspection answers about one page at a time, 2,000 a day for each
 * website and 600 a minute. So the checks keep a fifth of the day in hand and ask four at once.
 */

/** Page checks a day for each website: Google's 2,000, with a fifth kept in hand. */
export const DAILY_CHECKS = 1_600;
/** Google's own allowance a day for each website. */
export const GOOGLE_DAILY_CHECKS = 2_000;
/** Pages asked of Google at once. */
export const CHECKS_AT_ONCE = 4;
/** Pages a step of the checks asks before handing on to the next, and between saves. */
export const CHECKS_A_STEP = 400;
export const CHECKS_SAVED_EVERY = 40;
/** Days of counts kept for each website (`pageIndexDays`): the trend reads a week of them, and Indexing's chart spans them all. */
export const DAYS_KEPT = 90;

/** Google's URL inspection. */
export const INSPECT_URL = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";

/** What is kept from Google's answer for a page. */
export type CheckFound = {
  reason: string | null;
  verdict: string | null;
  indexed: boolean;
  crawled: string | null;
  googleCanonical: string | null;
  userCanonical: string | null;
  inSitemap: boolean;
  linkedOwn: boolean;
};

/** A host without its `www.`, in lower case: the website's own, whichever twin a link names. */
export const bareHost = (host: string) => host.trim().toLowerCase().replace(/^www\./, "");

/** A link's host, without its `www.`; null for one that isn't a link. */
export function hostOf(address: string): string | null {
  const found = /^[a-z][a-z0-9+.-]*:\/\/([^/?#:]+)/i.exec(address.trim());
  return found ? bareHost(found[1]) : null;
}

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);

/**
 * Google's URL inspection answer for one page, as kept (`inspectionResult.indexStatusResult`): its words for where the
 * page stands, its verdict, the day it last visited, the page it chose and the website's own choice, whether a sitemap
 * lists it, and whether one of the website's own pages links to it. Null when Google's answer holds none of it.
 */
export function checkFrom(json: unknown, ownHost: string): CheckFound | null {
  const result = (json as { inspectionResult?: { indexStatusResult?: Record<string, unknown> } } | null)?.inspectionResult?.indexStatusResult;
  if (!result || typeof result !== "object") return null;
  const reason = text(result.coverageState);
  const verdict = text(result.verdict);
  const crawledAt = text(result.lastCrawlTime);
  const own = bareHost(ownHost);
  const referring = Array.isArray(result.referringUrls) ? result.referringUrls.filter((url): url is string => typeof url === "string") : [];
  return {
    reason,
    verdict,
    indexed: isIndexed(verdict, reason),
    crawled: crawledAt && /^\d{4}-\d{2}-\d{2}/.test(crawledAt) ? crawledAt.slice(0, 10) : null,
    googleCanonical: text(result.googleCanonical),
    userCanonical: text(result.userCanonical),
    inSitemap: Array.isArray(result.sitemap) && result.sitemap.length > 0,
    linkedOwn: referring.some((url) => hostOf(url) === own),
  };
}

/**
 * What Google's refusal of a page means for the day's checks (`callGoogle`'s failure): its allowance is used up — the
 * day stops, and starts again when it comes back; the sign-in is no good — the checks stop, saying so; Google failed
 * for this page alone — it waits its turn; or Google refused to answer for it — it waits its turn too.
 */
export function refusalOf(failure: { reason: string; status: number; detail: string }): "ALLOWANCE" | "SIGN_IN" | "GOOGLE_ERROR" | "REFUSED" {
  if (failure.status === 429 || (failure.status === 403 && /quota|rate ?limit|exhausted/i.test(failure.detail))) return "ALLOWANCE";
  if (failure.reason === "EXPIRED" || failure.reason === "ACCESS") return "SIGN_IN";
  if (failure.reason === "BUSY" || failure.reason === "UNREACHABLE") return "GOOGLE_ERROR";
  return "REFUSED";
}

/** Google's own day (Pacific time), when its allowance of page checks comes back. */
export function googleDay(now: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
}

/** When Google's day began, as a time: a check before it is a day old or more. */
export function googleDayStart(now: number): number {
  const day = googleDay(now);
  // Pacific time is 7 or 8 hours behind: the first of those two times still in Google's day is when it began.
  for (const hours of [7, 8]) {
    const start = Date.parse(`${day}T${String(hours).padStart(2, "0")}:00:00Z`);
    if (googleDay(start) === day && googleDay(start - 1) !== day) return start;
  }
  return Date.parse(`${day}T08:00:00Z`);
}

/** A day so many days on. */
export function dayAfter(day: string, days: number): string {
  const at = new Date(`${day}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** About when every page has an answer: today, and a day for each day's checks the rest still need. */
export function restDoneBy(today: string, rest: number, perDay: number = DAILY_CHECKS): string {
  return dayAfter(today, Math.max(0, Math.ceil(rest / perDay)));
}

/** How many pages Google gave each reason, moved for one page's answer replaced: its old answer out, its new one in. */
export function countsMoved(
  counts: { reasons: ReadonlyArray<{ reason: string; pages: number }>; indexed: number },
  before: { reason: string | null; indexed: boolean; problem?: string } | null,
  after: { reason: string | null; indexed: boolean; problem?: string } | null,
): { reasons: Array<{ reason: string; pages: number }>; indexed: number } {
  const reasons = new Map(counts.reasons.map((one) => [one.reason, one.pages]));
  let indexed = counts.indexed;
  const move = (answer: typeof before, by: number) => {
    if (!answer || answer.problem) return;
    if (answer.indexed) indexed += by;
    else if (answer.reason !== null) reasons.set(answer.reason, (reasons.get(answer.reason) ?? 0) + by);
  };
  move(before, -1);
  move(after, 1);
  return {
    reasons: [...reasons].filter(([, pages]) => pages > 0).map(([reason, pages]) => ({ reason, pages })).sort((left, right) => right.pages - left.pages || left.reason.localeCompare(right.reason)),
    indexed: Math.max(0, indexed),
  };
}
