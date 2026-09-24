import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import type { AiEngine } from "./seoAiEngines";
import { normaliseKeyword } from "./seoJudgments";
import { DEFAULT_LOCATION_CODE } from "./utils/seoLocations";
import { isTrackedHold, pairedOwnedHold } from "./utils/websitePairing";
import { bandForPosition, kdBandFor, pagePath, statusFor, type RankIntent } from "./utils/siteShapes";

/**
 * Keeping the Sites tables current as results are filed.
 *
 * The parser files what DataForSEO sent into its own tables, as it always has;
 * these helpers are called from the same mutations to keep `siteKeywordRanks`
 * — the latest ranking of every search a site ranks for — in step, and to ask
 * for the summaries built from it to be refreshed. See
 * docs/plans/active/user-sites-plan.md, "Speed".
 *
 * **Only what was seen moves a row.** A ranking is filed when a check found
 * the site; a check that did not find it says nothing about positions it never
 * looked at (a page-one check cannot see position 45). A search is marked lost
 * only by a ranked-keywords pull that covered everything the site ranks for,
 * which the rebuild decides (`siteSummaries.ts`).
 */

/** How long a rebuild waits for more filings to arrive before it runs. */
const REBUILD_DELAY_MS = 20_000;

/** Rankings patched in one mutation when a search's meaning is judged. */
const INTENT_PATCH_LIMIT = 500;

/** Holds read to find the places a website is watched from. */
const HOLDS_READ = 200;

/**
 * What a ranked-keywords pull says about a search and the page ranking for it
 * (docs/plans/active/user-sites-plan.md, Phase 2). A page-one check says none
 * of it, so a sighting without them keeps the ones already held.
 */
export type RankExtras = Partial<Pick<Doc<"siteKeywordRanks">,
  | "cpc" | "difficulty" | "trend" | "serpFeatures" | "traffic" | "trafficValue"
  | "pageRank" | "pageReferringDomains" | "pageBacklinks"
  | "competition" | "competitionLevel" | "searchIntent" | "resultsCount"
  | "previousPositionDfs" | "movementDfs">>;

/** The facts about the search itself, which do not depend on who ranks or where. */
const SEARCH_FACTS = ["cpc", "difficulty", "trend", "serpFeatures", "competition", "competitionLevel", "searchIntent", "resultsCount"] as const;

/**
 * The facts about the ranking page, which belong to that page and no other —
 * and DataForSEO's own previous place and move for it, which are about this
 * ranking of this page.
 */
const PAGE_FACTS = ["pageRank", "pageReferringDomains", "pageBacklinks", "previousPositionDfs", "movementDfs"] as const;

/**
 * The extras a row should hold after a sighting: the sighting's own where it
 * has them, and otherwise what the row held — except that a page's facts are
 * dropped when the ranking page changed, because they were about the old one.
 */
function mergeExtras(existing: Doc<"siteKeywordRanks"> | null, extras: RankExtras, samePage: boolean): RankExtras {
  const merged: RankExtras = {};
  const keep = (key: keyof RankExtras, carry: boolean) => {
    const value = extras[key] ?? (carry ? existing?.[key] : undefined);
    if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
  };
  for (const key of SEARCH_FACTS) keep(key, true);
  keep("traffic", samePage);
  keep("trafficValue", samePage);
  for (const key of PAGE_FACTS) keep(key, samePage);
  return merged;
}

/**
 * File one sighting of a website on Google's results.
 *
 * Idempotent for a re-parse: the same keyword, site, place and day is one
 * fact, so filing it again updates the row rather than moving its history on.
 * A sighting older than the row's is ignored — a re-parse of last month's pull
 * must not wind a ranking back.
 */
export async function fileKeywordRank(
  ctx: MutationCtx,
  entry: {
    websiteId: Id<"websites">;
    locationCode: number;
    keyword: string;
    day: string;
    position: number;
    url?: string;
    volume?: number;
    extras?: RankExtras;
  },
): Promise<void> {
  const keyword = normaliseKeyword(entry.keyword);
  if (!keyword) return;

  const existing = await ctx.db
    .query("siteKeywordRanks")
    .withIndex("by_site_keyword", (q) =>
      q.eq("websiteId", entry.websiteId).eq("locationCode", entry.locationCode).eq("keyword", keyword))
    .unique();
  if (existing && existing.day > entry.day) return;

  const sameDay = existing?.day === entry.day;
  // Two checks on one day — the ranked-keywords pull and the page-one check —
  // are one day's facts, and the better place is the one the site holds.
  const position = sameDay && existing?.position !== undefined
    ? Math.min(existing.position, entry.position)
    : entry.position;
  const previousPosition = sameDay ? existing?.previousPosition : existing?.position;
  const previousDay = sameDay ? existing?.previousDay : existing?.day;
  const previousPage = sameDay ? existing?.previousPage : existing?.page || undefined;
  const url = entry.url ?? existing?.url;
  const page = pagePath(url);
  const extras = mergeExtras(existing, entry.extras ?? {}, page === (existing?.page ?? page));
  const kdBand = kdBandFor(extras.difficulty);
  const volumeKnown = entry.volume !== undefined || Boolean(existing?.volumeKnown);
  const volume = entry.volume ?? existing?.volume ?? 0;

  const judged = existing
    ? existing.intent
    : (await ctx.db
      .query("seoKeywordIntents")
      .withIndex("by_keyword", (q) => q.eq("keyword", keyword))
      .unique())?.intent;
  const intent: RankIntent = judged ?? "UNJUDGED";

  const fields = {
    position,
    band: bandForPosition(position),
    ...(url ? { url } : {}),
    page,
    volume,
    volumeKnown,
    intent,
    status: statusFor(position, previousPosition, previousDay !== undefined),
    change: previousPosition !== undefined ? previousPosition - position : 0,
    ...(previousPosition !== undefined ? { previousPosition } : {}),
    ...(previousDay !== undefined ? { previousDay } : {}),
    ...(previousPage ? { previousPage } : {}),
    day: entry.day,
    searchText: `${keyword} ${page}`.trim(),
    ...extras,
    ...(kdBand ? { kdBand } : {}),
    updatedAt: Date.now(),
  };

  if (existing) {
    // `replace` rather than `patch`, so a field the new sighting leaves out
    // (a previous position there was none of) cannot survive from the old row.
    await ctx.db.replace(existing._id, {
      websiteId: entry.websiteId,
      locationCode: entry.locationCode,
      keyword,
      firstSeenDay: existing.firstSeenDay,
      ...fields,
    });
  } else {
    await ctx.db.insert("siteKeywordRanks", {
      websiteId: entry.websiteId,
      locationCode: entry.locationCode,
      keyword,
      firstSeenDay: entry.day,
      ...fields,
    });
  }
}

/**
 * Carry a search's meaning onto every ranking and gap that holds the search.
 *
 * The meaning is judged after the rankings are filed, so a new ranking arrives
 * `UNJUDGED` and is brought up to date here when the judgment lands.
 */
export async function patchKeywordIntent(ctx: MutationCtx, keyword: string, intent: RankIntent): Promise<void> {
  const ranks = await ctx.db
    .query("siteKeywordRanks")
    .withIndex("by_keyword", (q) => q.eq("keyword", keyword))
    .take(INTENT_PATCH_LIMIT);
  for (const row of ranks) if (row.intent !== intent) await ctx.db.patch(row._id, { intent });

  const gaps = await ctx.db
    .query("siteContentGaps")
    .withIndex("by_keyword", (q) => q.eq("keyword", keyword))
    .take(INTENT_PATCH_LIMIT);
  for (const row of gaps) if (row.intent !== intent) await ctx.db.patch(row._id, { intent });
}

/** Citations of one page read when recounting it. */
const CITATIONS_READ = 2_000;

/**
 * Recount how often AI answers linked to each of these pages of a website —
 * per question, engine and place, because a count across every question would
 * carry other companies' questions onto this one's screen (D17).
 *
 * Recounted from `aiCitations` rather than added to, because a re-parse
 * replaces a pull's citations: a count kept by adding would double every time
 * a corrected parser ran over stored answers.
 */
export async function recountCitedPages(
  ctx: MutationCtx,
  cited: ReadonlyArray<{ websiteId: Id<"websites">; url: string }>,
): Promise<void> {
  const seen = new Set<string>();
  for (const { websiteId, url } of cited) {
    const key = `${websiteId} ${url}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const rows = (await ctx.db
      .query("aiCitations")
      .withIndex("by_website_url", (q) => q.eq("mentionedWebsiteId", websiteId).eq("url", url))
      .take(CITATIONS_READ))
      .filter((row) => row.kind === "SOURCE");
    const groups = new Map<string, { prompt: string; engine: AiEngine; locationCode: number; days: string[] }>();
    for (const row of rows) {
      // Where the engine answered from, as the answers are kept: an engine
      // asked no place answered from the default one.
      const locationCode = row.locationCode ?? DEFAULT_LOCATION_CODE;
      const group = citedGroupKey(row.prompt, row.engine, locationCode);
      const held = groups.get(group) ?? { prompt: row.prompt, engine: row.engine, locationCode, days: [] };
      held.days.push(row.day);
      groups.set(group, held);
    }

    const standing = await ctx.db
      .query("siteCitedPages")
      .withIndex("by_site_url", (q) => q.eq("websiteId", websiteId).eq("url", url))
      .take(CITED_GROUPS_READ);
    const unclaimed = new Map(standing.map((row) => [citedGroupKey(row.prompt, row.engine, row.locationCode), row]));
    for (const [group, held] of groups) {
      const days = held.days.sort();
      const fields = {
        websiteId,
        url,
        page: pagePath(url),
        prompt: held.prompt,
        engine: held.engine,
        locationCode: held.locationCode,
        times: days.length,
        firstDay: days[0],
        lastDay: days[days.length - 1],
        updatedAt: Date.now(),
      };
      const row = unclaimed.get(group);
      unclaimed.delete(group);
      if (row) await ctx.db.replace(row._id, fields);
      else await ctx.db.insert("siteCitedPages", fields);
    }
    // A question that no longer cites the page — and a row counted the old
    // way, across every question — goes.
    for (const row of unclaimed.values()) await ctx.db.delete(row._id);
  }
}

/** The questions, engines and places one page address was cited under, read to recount it. */
const CITED_GROUPS_READ = 1_000;

function citedGroupKey(prompt: string | undefined, engine: string | undefined, locationCode: number | undefined): string {
  return `${prompt ?? ""}\u0000${engine ?? ""}\u0000${locationCode ?? ""}`;
}

/** The key a site's summary rebuild is requested under. */
export function siteRebuildKey(websiteId: Id<"websites">, locationCode: number): string {
  return `site:${websiteId}:${locationCode}`;
}

/** The key a hold's content-gap rebuild is requested under. */
export function gapRebuildKey(companyWebsiteId: Id<"companyWebsites">): string {
  return `gap:${companyWebsiteId}`;
}

/**
 * Mark a request pending and schedule it, unless one is already waiting.
 * Returns whether this call scheduled the work.
 */
async function claimSchedule(ctx: MutationCtx, key: string): Promise<boolean> {
  const existing = await ctx.db
    .query("siteSummaryRequests")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (existing?.pending) return false;
  if (existing) await ctx.db.patch(existing._id, { pending: true, requestedAt: Date.now() });
  else await ctx.db.insert("siteSummaryRequests", { key, pending: true, requestedAt: Date.now() });
  return true;
}

/** Ask for a site's summaries to be rebuilt from one place, once, shortly. */
export async function requestSiteRebuild(
  ctx: MutationCtx,
  websiteId: Id<"websites">,
  locationCode: number,
): Promise<void> {
  if (!(await claimSchedule(ctx, siteRebuildKey(websiteId, locationCode)))) return;
  await ctx.scheduler.runAfter(REBUILD_DELAY_MS, internal.siteSummaries.rebuildSite, { websiteId, locationCode });
}

/** Ask for a hold's content gap to be rebuilt, once, shortly. */
export async function requestGapRebuild(ctx: MutationCtx, companyWebsiteId: Id<"companyWebsites">): Promise<void> {
  if (!(await claimSchedule(ctx, gapRebuildKey(companyWebsiteId)))) return;
  await ctx.scheduler.runAfter(REBUILD_DELAY_MS, internal.siteContentGap.rebuildGap, { companyWebsiteId });
}

/** Ask for the gap of every hold in an owned site's group: the site and its competitors. */
export async function requestGroupGapRebuilds(ctx: MutationCtx, owner: Doc<"companyWebsites">): Promise<void> {
  const competitors = (await ctx.db
    .query("companyWebsites")
    .withIndex("by_company_against", (q) => q.eq("companyId", owner.companyId).eq("againstWebsiteId", owner.websiteId))
    .take(HOLDS_READ))
    .filter(isTrackedHold);
  for (const member of [owner, ...competitors]) await requestGapRebuild(ctx, member._id);
}

/**
 * Every place a website is watched from, by anyone.
 *
 * A figure that is the website's alone — its backlinks, an answer from an
 * engine that takes no location — belongs in the summary of every place it is
 * watched from, because each watcher reads its own place's summary.
 */
export async function placesWatching(ctx: MutationCtx, websiteId: Id<"websites">): Promise<number[]> {
  const holds = await ctx.db
    .query("companyWebsites")
    .withIndex("by_website", (q) => q.eq("websiteId", websiteId))
    .take(HOLDS_READ);
  const places = new Set<number>();
  for (const hold of holds) {
    const pair = isTrackedHold(hold) ? await pairedOwnedHold(ctx, hold) : null;
    places.add((pair ?? hold).locationCode ?? DEFAULT_LOCATION_CODE);
  }
  return [...places];
}

/** Rebuild a website's summaries for every place it is watched from. */
export async function requestRebuildEverywhere(ctx: MutationCtx, websiteId: Id<"websites">): Promise<void> {
  for (const place of await placesWatching(ctx, websiteId)) await requestSiteRebuild(ctx, websiteId, place);
}
