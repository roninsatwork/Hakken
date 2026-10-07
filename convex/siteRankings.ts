import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { aiEngineValidator, type AiEngine } from "./seoAiEngines";
import { normaliseKeyword } from "./seoJudgments";
import { DEFAULT_LOCATION_CODE } from "./utils/seoLocations";
import { isTrackedHold, pairedOwnedHold } from "./utils/websitePairing";
import { bandForPosition, kdBandFor, pagePath, rankIntentValidator, statusFor, type RankIntent } from "./utils/siteShapes";

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
  | "competitionLevel" | "searchIntent" | "resultsCount">>;

/** The facts about the search itself, which do not depend on who ranks or where. */
const SEARCH_FACTS = ["cpc", "difficulty", "trend", "serpFeatures", "competitionLevel", "searchIntent", "resultsCount"] as const;

/**
 * The facts about the ranking page, which belong to that page and no other.
 * DataForSEO's own previous place and move, and the advert competition as a
 * figure, are no longer kept: no screen read them (keep-less-history-plan.md, 5.6).
 */
const PAGE_FACTS = ["pageRank", "pageReferringDomains", "pageBacklinks"] as const;

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
    /** Its place on the whole page, when `position` is among the normal results (G2). */
    pagePosition?: number;
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
  // Counted the same way as the row it follows: both among the normal
  // results, or both on the whole page. The day the counting changed
  // (sites-data-completeness-plan.md, G2) is no move — 5th on the page and
  // 3rd of the normal results is the same place.
  const sameCounting = existing?.position === undefined || (existing.pagePosition !== undefined) === (entry.pagePosition !== undefined);
  // Two checks on one day — the ranked-keywords pull and the page-one check —
  // are one day's facts, and the better place is the one the site holds.
  const better = sameDay && existing?.position !== undefined && sameCounting && existing.position < entry.position;
  const position = better ? existing.position! : entry.position;
  const pagePosition = better ? existing.pagePosition : entry.pagePosition;
  // The place it moved from, counted as the row it came with was: a second
  // filing the same day counted the other way — the morning's run the old
  // way, the afternoon's the new — cannot move from it either.
  const previousPosition = !sameCounting ? undefined : sameDay ? existing?.previousPosition : existing?.position;
  const previousDay = sameDay ? existing?.previousDay : existing?.day;
  // Ranking before and counted another way: held, not moved — and still so
  // when a second check that day files again.
  const switched = sameDay
    ? previousDay !== undefined && (!sameCounting || (existing?.status === "SAME" && existing.previousPosition === undefined))
    : !sameCounting;
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
    ...(pagePosition !== undefined ? { pagePosition } : {}),
    band: bandForPosition(position),
    ...(url ? { url } : {}),
    page,
    volume,
    volumeKnown,
    intent,
    status: switched ? "SAME" as const : statusFor(position, previousPosition, previousDay !== undefined),
    change: previousPosition !== undefined ? previousPosition - position : 0,
    ...(previousPosition !== undefined ? { previousPosition } : {}),
    ...(previousDay !== undefined ? { previousDay } : {}),
    ...(previousPage ? { previousPage } : {}),
    day: entry.day,
    ...extras,
    ...(kdBand ? { kdBand } : {}),
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
 * Carry a search's meaning onto every ranking that holds the search — and so
 * onto the keyword copies a content gap is worked out from.
 *
 * The meaning is judged after the rankings are filed, so a new ranking arrives
 * `UNJUDGED` and is brought up to date here when the judgment lands. The first
 * `INTENT_PATCH_LIMIT` of each here; the rest by `carryKeywordIntent`, a page
 * at a time — rows past the first five hundred were left unjudged for good,
 * the meaning being judged once (reliability plan 3.6).
 */
export async function patchKeywordIntent(ctx: MutationCtx, keyword: string, intent: RankIntent): Promise<void> {
  const ranks = await ctx.db
    .query("siteKeywordRanks")
    .withIndex("by_keyword", (q) => q.eq("keyword", keyword))
    .take(INTENT_PATCH_LIMIT);
  const patchedRanks = ranks.filter((row) => row.intent !== intent);
  for (const row of patchedRanks) await ctx.db.patch(row._id, { intent });
  await recountAfterIntents(ctx, patchedRanks);

  if (ranks.length === INTENT_PATCH_LIMIT) {
    await ctx.scheduler.runAfter(0, internal.siteRankings.carryKeywordIntent, { table: "siteKeywordRanks", keyword, intent, cursor: null });
  }
}

/**
 * A judged intent changes what the counts by intent and the Sites lists'
 * copies hold, so each site whose keywords it changed is rebuilt — once,
 * shortly, however many judgments land (docs/plans/active/
 * sites-table-pages-plan.md §5.2). Before this, the counts by intent trailed
 * the rows until the next filing.
 */
async function recountAfterIntents(
  ctx: MutationCtx,
  ranks: ReadonlyArray<Pick<Doc<"siteKeywordRanks">, "websiteId" | "locationCode">>,
): Promise<void> {
  const sites = new Map(ranks.map((row) => [siteRebuildKey(row.websiteId, row.locationCode), row]));
  for (const row of sites.values()) await requestSiteRebuild(ctx, row.websiteId, row.locationCode);
}

/** A page of the rankings holding a search, given its meaning; the next page carries on. */
export const carryKeywordIntent = internalMutation({
  args: {
    /** Only the rankings since 2026-10-06; a step asked of the stored gaps before then does nothing. */
    table: v.union(v.literal("siteKeywordRanks"), v.literal("siteContentGaps")),
    keyword: v.string(),
    intent: rankIntentValidator,
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.table !== "siteKeywordRanks") return null;
    const page = await ctx.db
      .query("siteKeywordRanks")
      .withIndex("by_keyword", (q) => q.eq("keyword", args.keyword))
      .paginate({ cursor: args.cursor, numItems: INTENT_PATCH_LIMIT });
    const patched = page.page.filter((row) => row.intent !== args.intent);
    for (const row of patched) await ctx.db.patch(row._id, { intent: args.intent });
    await recountAfterIntents(ctx, patched);
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.siteRankings.carryKeywordIntent, { ...args, cursor: page.continueCursor });
    }
    return null;
  },
});

/** Citations of one page under one question read when recounting it: a day each, years of them. */
const CITATIONS_READ = 2_000;

/** A page of a website an AI answer cited, and the question, engine and place it was cited under. */
export type CitedPage = { websiteId: Id<"websites">; url: string; prompt: string; engine: AiEngine; locationCode: number };

/** A citation row as the page, question, engine and place a recount counts it under. */
export function citedPageOf(row: Doc<"aiCitations">): CitedPage | null {
  if (row.kind !== "SOURCE" || !row.mentionedWebsiteId || !row.url) return null;
  return {
    websiteId: row.mentionedWebsiteId,
    url: row.url,
    prompt: row.prompt,
    engine: row.engine,
    // An engine asked no place answered from the default one.
    locationCode: row.locationCode ?? DEFAULT_LOCATION_CODE,
  };
}

/**
 * Ask for cited pages to be recounted — each under its own question, engine
 * and place, one small job a page. Recounted inside the filing, every
 * question's citations of every page came with it, and an answer citing
 * forty well-cited pages read past what one transaction may (reliability plan
 * 3.4). At most a few hundred a call: a transaction schedules a thousand jobs.
 */
export async function recountCitedPages(ctx: MutationCtx, cited: ReadonlyArray<CitedPage>): Promise<void> {
  const seen = new Set<string>();
  for (const page of cited) {
    const key = `${page.websiteId} ${page.url} ${citedGroupKey(page.prompt, page.engine, page.locationCode)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await ctx.scheduler.runAfter(0, internal.siteRankings.recountCitedPage, page);
  }
}

/**
 * Recount how often AI answers to one question, on one engine, from one
 * place, linked to one page of a website — per question, because a count
 * across every question would carry other companies' questions onto this
 * one's screen (D17).
 *
 * Recounted from `aiCitations` rather than added to, because a re-parse
 * replaces a pull's citations: a count kept by adding would double every time
 * a corrected parser ran over stored answers.
 */
export const recountCitedPage = internalMutation({
  args: {
    websiteId: v.id("websites"),
    url: v.string(),
    prompt: v.string(),
    engine: aiEngineValidator,
    locationCode: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const days = (await ctx.db
      .query("aiCitations")
      .withIndex("by_website_url_question", (q) => q.eq("mentionedWebsiteId", args.websiteId).eq("url", args.url)
        .eq("prompt", args.prompt).eq("engine", args.engine))
      .take(CITATIONS_READ))
      // Where the engine answered from, as the answers are kept: an engine
      // asked no place answered from the default one.
      .filter((row) => row.kind === "SOURCE" && (row.locationCode ?? DEFAULT_LOCATION_CODE) === args.locationCode)
      .map((row) => row.day)
      .sort();

    const standing = (await ctx.db
      .query("siteCitedPages")
      .withIndex("by_site_url", (q) => q.eq("websiteId", args.websiteId).eq("url", args.url))
      .take(CITED_GROUPS_READ))
      .filter((row) => citedGroupKey(row.prompt, row.engine, row.locationCode)
        === citedGroupKey(args.prompt, args.engine, args.locationCode));
    const [row, ...extra] = standing;
    for (const duplicate of extra) await ctx.db.delete(duplicate._id);
    // A question that no longer cites the page goes.
    if (days.length === 0) {
      if (row) await ctx.db.delete(row._id);
      return null;
    }
    const fields = {
      websiteId: args.websiteId,
      url: args.url,
      page: pagePath(args.url),
      prompt: args.prompt,
      engine: args.engine,
      locationCode: args.locationCode,
      times: days.length,
      firstDay: days[0],
      lastDay: days[days.length - 1],
      updatedAt: Date.now(),
    };
    if (row) await ctx.db.replace(row._id, fields);
    else await ctx.db.insert("siteCitedPages", fields);
    return null;
  },
});

/** The questions, engines and places one page address was cited under, read to recount it. */
const CITED_GROUPS_READ = 1_000;

function citedGroupKey(prompt: string | undefined, engine: string | undefined, locationCode: number | undefined): string {
  return `${prompt ?? ""}\u0000${engine ?? ""}\u0000${locationCode ?? ""}`;
}

/** The key a site's summary rebuild is requested under. */
export function siteRebuildKey(websiteId: Id<"websites">, locationCode: number): string {
  return `site:${websiteId}:${locationCode}`;
}


/** The key a hold's Your pages rebuild is asked for and takes its turn under (`holdPages.ts`). */
export function holdPagesKey(holdId: Id<"companyWebsites">): string {
  return `holdPages:${holdId}`;
}

/**
 * Mark a request pending and schedule it, unless one is already waiting.
 * Returns whether this call scheduled the work.
 */
export async function claimSchedule(ctx: MutationCtx, key: string): Promise<boolean> {
  const existing = await ctx.db
    .query("siteSummaryRequests")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  // Already waiting: the rebuild has not begun, so it reads this change too.
  if (existing?.pending) return false;
  const now = Date.now();
  // A rebuild asked for is data changed: noted for the nightly refresh (`refreshListCopies`).
  if (existing) await ctx.db.patch(existing._id, { pending: true, requestedAt: now, changedAt: now });
  else await ctx.db.insert("siteSummaryRequests", { key, pending: true, requestedAt: now, changedAt: now });
  return true;
}

/**
 * Note that the data behind a rebuild key changed, without asking for the
 * rebuild now: a source that changes rarely and asked for none before — a
 * Search Console disconnected, a limit changed, a page's kind judged — is
 * rebuilt by the nightly refresh (`refreshListCopies`), as it was when that
 * refresh rebuilt every copy (docs/plans/active/dataforseo-cost-plan.md, A1).
 * Written only when the key is not already marked changed since its last
 * rebuild began.
 */
export async function noteDataChanged(ctx: MutationCtx, key: string): Promise<void> {
  const existing = await ctx.db
    .query("siteSummaryRequests")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  const now = Date.now();
  if (!existing) {
    await ctx.db.insert("siteSummaryRequests", { key, pending: false, requestedAt: now, changedAt: now });
    return;
  }
  // Marked after the last rebuild began, or the one running now: that mark stands.
  const lastBuild = Math.max(existing.builtFrom ?? 0, existing.runningSince ?? 0);
  if ((existing.changedAt ?? existing.requestedAt) > lastBuild) return;
  await ctx.db.patch(existing._id, { changedAt: now });
}

/**
 * Whether what a key's last rebuild built is out of date with its data: its
 * data changed after that rebuild began, or none has finished — never built,
 * or the last one failed. What the nightly refresh rebuilds.
 */
export function outOfDate(row: Pick<Doc<"siteSummaryRequests">, "requestedAt" | "changedAt" | "builtFrom"> | null): boolean {
  if (!row || row.builtFrom === undefined) return true;
  return (row.changedAt ?? row.requestedAt) > row.builtFrom;
}

/** Ask for a site's summaries to be rebuilt from one place, once, shortly — or at the end of its running collection. */
export async function requestSiteRebuild(
  ctx: MutationCtx,
  websiteId: Id<"websites">,
  locationCode: number,
): Promise<void> {
  await requestWebsiteWork(ctx, "site", websiteId, locationCode);
}

/**
 * A website's rebuilds: the whole site rebuild (`site`), or the part an AI
 * answer changes (`aiLines`) or a site-wide figure changes (`days`) — each
 * keyed `<work>:<websiteId>:<locationCode>`.
 */
type WebsiteWork = "site" | "aiLines" | "days";

function websiteWorkKey(work: WebsiteWork, websiteId: Id<"websites">, locationCode: number): string {
  return work === "site" ? siteRebuildKey(websiteId, locationCode)
    : work === "aiLines" ? aiLinesKey(websiteId, locationCode)
      : dayFiguresKey(websiteId, locationCode);
}

async function scheduleWebsiteWork(ctx: MutationCtx, work: WebsiteWork, websiteId: Id<"websites">, locationCode: number): Promise<void> {
  const args = { websiteId, locationCode };
  if (work === "site") await ctx.scheduler.runAfter(REBUILD_DELAY_MS, internal.siteSummaries.rebuildSite, args);
  else if (work === "aiLines") await ctx.scheduler.runAfter(REBUILD_DELAY_MS, internal.siteDayFigures.syncSiteAiLines, args);
  else await ctx.scheduler.runAfter(REBUILD_DELAY_MS, internal.siteDayFigures.syncSiteDays, args);
}

/**
 * Ask for a website's rebuild, or a part of it, once, shortly — unless the
 * website's collection is running, when it waits for the collection's end
 * (`holdForCollection`).
 */
async function requestWebsiteWork(ctx: MutationCtx, work: WebsiteWork, websiteId: Id<"websites">, locationCode: number): Promise<void> {
  const key = websiteWorkKey(work, websiteId, locationCode);
  if (!(await claimSchedule(ctx, key))) return;
  if (await holdForCollection(ctx, key, websiteId)) return;
  await scheduleWebsiteWork(ctx, work, websiteId, locationCode);
}

/**
 * How often a website held by a collection that runs long is rebuilt all the
 * same: a few hours (Anthony's plan, B4), counted from the collection's start
 * or the website's last rebuild, whichever is later.
 */
export const COLLECTION_REBUILD_EVERY_MS = 3 * 60 * 60 * 1000;

/** A website's newest requests read to find the collection collecting it: one collection's lines for it, and a few more. */
const CYCLE_PULLS_READ = 20;

/** The collection statuses that mean it is still running. */
const RUNNING_CYCLE = new Set<Doc<"seoCollectionCycles">["status"]>(["EXPANDING", "SENDING", "COLLECTING"]);

/** The collection collecting a website now, found from its newest requests, or null when none is. */
async function runningCycleOf(ctx: MutationCtx, websiteId: Id<"websites">): Promise<Doc<"seoCollectionCycles"> | null> {
  const pulls = await ctx.db
    .query("seoDataPulls")
    .withIndex("by_website_submitted", (q) => q.eq("websiteId", websiteId))
    .order("desc")
    .take(CYCLE_PULLS_READ);
  const seen = new Set<Id<"seoCollectionCycles">>();
  for (const pull of pulls) {
    if (!pull.cycleId || seen.has(pull.cycleId)) continue;
    seen.add(pull.cycleId);
    const cycle = await ctx.db.get(pull.cycleId);
    if (cycle && RUNNING_CYCLE.has(cycle.status)) return cycle;
  }
  return null;
}

/**
 * One rebuild at the end of each collection, not during it
 * (docs/plans/active/dataforseo-cost-plan.md, B4). A website rebuild asked
 * for while the website's collection runs waits — its request held for the
 * collection, still pending, so later asks add nothing — until the
 * collection finishes (`releaseHeldRebuilds`), or until a few hours after
 * the collection began or the website was last rebuilt, so one that runs
 * long still rebuilds every few hours (`releaseHeldRequest`). Answers
 * whether it was held; outside a collection, nothing changes.
 */
async function holdForCollection(ctx: MutationCtx, key: string, websiteId: Id<"websites">): Promise<boolean> {
  const cycle = await runningCycleOf(ctx, websiteId);
  if (!cycle) return false;
  const row = await ctx.db
    .query("siteSummaryRequests")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (!row) return false;
  const now = Date.now();
  const due = Math.max(cycle.startedAt, row.builtFrom ?? 0) + COLLECTION_REBUILD_EVERY_MS;
  if (now >= due) return false;
  await ctx.db.patch(row._id, { heldFor: cycle._id });
  await ctx.scheduler.runAfter(due - now, internal.siteRankings.releaseHeldRequest, { key, cycleId: cycle._id });
  return true;
}

/** Run a held request's rebuild now, if it is still held for that collection. */
async function releaseHeld(ctx: MutationCtx, row: Doc<"siteSummaryRequests">, cycleId: Id<"seoCollectionCycles">): Promise<void> {
  if (row.heldFor !== cycleId) return;
  await ctx.db.patch(row._id, { heldFor: undefined });
  const [work, id, place] = row.key.split(":");
  const websiteId = ctx.db.normalizeId("websites", id);
  if (!websiteId || (work !== "site" && work !== "aiLines" && work !== "days")) return;
  await scheduleWebsiteWork(ctx, work, websiteId, Number(place));
}

/** A held request's few hours are up, its collection still running: rebuilt now. */
export const releaseHeldRequest = internalMutation({
  args: { key: v.string(), cycleId: v.id("seoCollectionCycles") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("siteSummaryRequests")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (row) await releaseHeld(ctx, row, args.cycleId);
    return null;
  },
});

/** Held requests released per step when a collection finishes: each schedules one job. */
const RELEASED_PER_STEP = 100;

/** A collection finished (`finishSeoCycle`): every rebuild held for it runs, a step at a time. */
export const releaseHeldRebuilds = internalMutation({
  args: { cycleId: v.id("seoCollectionCycles") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("siteSummaryRequests")
      .withIndex("by_held", (q) => q.eq("heldFor", args.cycleId))
      .take(RELEASED_PER_STEP);
    for (const row of rows) await releaseHeld(ctx, row, args.cycleId);
    if (rows.length === RELEASED_PER_STEP) await ctx.scheduler.runAfter(0, internal.siteRankings.releaseHeldRebuilds, args);
    return null;
  },
});

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

/** The key the AI lines of a website's company lists are synced under, from one place. */
export function aiLinesKey(websiteId: Id<"websites">, locationCode: number): string {
  return `aiLines:${websiteId}:${locationCode}`;
}

/** The key a website's day figures are synced under, from one place. */
export function dayFiguresKey(websiteId: Id<"websites">, locationCode: number): string {
  return `days:${websiteId}:${locationCode}`;
}

/**
 * Ask for the part of a site rebuild an AI answer changes — the AI lines of
 * the company lists about the website (`syncListAiLines`) — for every place
 * it is watched from, each once, shortly. An answer moves nothing else a
 * rebuild writes: until 2026-10-05 it asked for the whole rebuild, every
 * keyword read again (docs/plans/active/dataforseo-cost-plan.md, A2).
 */
export async function requestAiLinesEverywhere(ctx: MutationCtx, websiteId: Id<"websites">): Promise<void> {
  for (const place of await placesWatching(ctx, websiteId)) await requestWebsiteWork(ctx, "aiLines", websiteId, place);
}

/**
 * Ask for the part of a site rebuild a site-wide figure changes — its day
 * figures (`syncDays`), a backlinks summary's say — for every place it is
 * watched from, each once, shortly (dataforseo-cost-plan.md, A2).
 */
export async function requestDayFiguresEverywhere(ctx: MutationCtx, websiteId: Id<"websites">): Promise<void> {
  for (const place of await placesWatching(ctx, websiteId)) await requestWebsiteWork(ctx, "days", websiteId, place);
}
