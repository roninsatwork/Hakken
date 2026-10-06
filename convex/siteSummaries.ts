import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type ActionCtx, type MutationCtx } from "./_generated/server";
import { siteRebuildKey } from "./siteRankings";
import { syncListAiLines } from "./siteListAiDays";
import { KEYWORD_LIST_OPERATION_ID } from "./dataForSeoKeywordListOperations";
import { KEYWORD_COPY_FIELDS, keywordCopyTuple } from "./siteKeywordCopy";
import { LIST_PAGE_STUCK_MS, dropCopyOf, keywordsCopyKey, pagesCopyKey, writeListCopy } from "./siteListCopies";
import { isThisPlace, shiftDay, syncDayFigures, syncWindows } from "./siteDayFigures";
import { bandCountsValidator, emptyBandCounts, pageTypeByAddress, sectionOf, intentSplitValidator, type IntentSplit } from "./utils/siteShapes";

/**
 * Rebuilding a site's summaries from its latest rankings.
 *
 * `siteKeywordRanks` holds the latest ranking of every search; this turns it
 * into what the screens read without counting — the pages it ranks with
 * (`sitePageRanks`), its folders (`siteSections`) and one row per day of
 * headline figures (`siteDaySummaries`). It runs a little after a filing
 * (`siteRankings.requestSiteRebuild`), reading in pages so a site with fifty
 * thousand keywords is fifty-odd small reads rather than one that fails.
 *
 * Rebuilt, never incremented: every figure is recounted from the rows it
 * describes, so running it twice changes nothing and a missed run is repaired
 * by the next.
 */

/** Rankings read per page of a rebuild. */
const KEYWORD_PAGE = 2_000;

/** Rows written or removed per mutation. */
const WRITE_BATCH = 400;

const pageRowValidator = v.object({
  page: v.string(),
  url: v.string(),
  section: v.string(),
  keywords: v.number(),
  bestPosition: v.number(),
  top3: v.number(),
  volumeSum: v.number(),
  topKeyword: v.string(),
  topKeywordVolume: v.number(),
  firstSeenDay: v.string(),
  day: v.string(),
  // Phase 2: summed from the page's keywords, or carried from the best-placed
  // keyword that has them (page rank and links are the page's own).
  traffic: v.optional(v.number()),
  trafficValue: v.optional(v.number()),
  pageRank: v.optional(v.number()),
  referringDomains: v.optional(v.number()),
  backlinks: v.optional(v.number()),
});
type PageAggregate = Infer<typeof pageRowValidator>;

const sectionRowValidator = v.object({
  section: v.string(),
  pages: v.number(),
  keywords: v.number(),
  top3: v.number(),
  volumeSum: v.number(),
  traffic: v.optional(v.number()),
  day: v.optional(v.string()),
});

/** Add a keyword's page facts to its page's aggregate. */
function addPageFacts(held: PageAggregate, row: Doc<"siteKeywordRanks">): void {
  if (row.traffic !== undefined) held.traffic = (held.traffic ?? 0) + row.traffic;
  if (row.trafficValue !== undefined) held.trafficValue = (held.trafficValue ?? 0) + row.trafficValue;
  // Every keyword on one page reports the same page figures, give or take the
  // day each was read; the largest is the freshest reading of a growing page.
  if (row.pageRank !== undefined) held.pageRank = Math.max(held.pageRank ?? 0, row.pageRank);
  if (row.pageReferringDomains !== undefined) held.referringDomains = Math.max(held.referringDomains ?? 0, row.pageReferringDomains);
  if (row.pageBacklinks !== undefined) held.backlinks = Math.max(held.backlinks ?? 0, row.pageBacklinks);
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let start = 0; start < items.length; start += size) out.push(items.slice(start, start + size));
  return out;
}

export const rebuildSite = internalAction({
  args: {
    websiteId: v.id("websites"),
    locationCode: v.number(),
    /** Copy every day's metrics and answers, not just the last fortnight's. For backfills. */
    fullSync: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const key = siteRebuildKey(args.websiteId, args.locationCode);
    // One rebuild of a site at a time. The request is released as this one
    // begins, so a filing that lands while it runs asks for another — which
    // waits its turn rather than running alongside and deleting what this one
    // writes (collection reliability plan, 2.3).
    if (!(await ctx.runMutation(internal.siteSummaries.beginRebuild, { key }))) {
      await ctx.scheduler.runAfter(REBUILD_WAIT_MS, internal.siteSummaries.rebuildSite, args);
      return null;
    }
    let done = false;
    try {
      const result = await rebuildSiteNow(ctx, args);
      done = true;
      return result;
    } finally {
      await ctx.runMutation(internal.siteSummaries.endRebuild, { key, done });
    }
  },
});

async function rebuildSiteNow(
  ctx: ActionCtx,
  args: { websiteId: Id<"websites">; locationCode: number; fullSync?: boolean },
): Promise<null> {
  // A rebuild asked for before the website was deleted can run after it:
  // there is nothing left to summarise, and its lists' copies go with it.
  const copyKey = keywordsCopyKey(args.websiteId, args.locationCode);
  if (!(await ctx.runQuery(internal.siteListCopies.copyOwnerExists, { kind: "keywords", key: copyKey }))) {
    await dropCopyOf(ctx, "keywords", copyKey);
    await dropCopyOf(ctx, "pages", copyKey);
    return null;
  }
  const completeDay: string | null = await ctx.runQuery(internal.siteSummaries.completeRankedDay, {
    websiteId: args.websiteId,
    locationCode: args.locationCode,
  });
  // A search last seen before the latest keyword check still held is counted
  // nowhere and listed under its own filter (docs/plans/active/
  // sites-table-pages-plan.md, T9): "every search it ranks for" means those
  // the latest check found.
  const latestCheckDay: string | null = await ctx.runQuery(internal.siteSummaries.latestKeywordCheck, {
    websiteId: args.websiteId,
    locationCode: args.locationCode,
  });
  // The check before it, of the same kind: a search held then and not now
  // left a list held in part (§4.C) — one marked lost is counted as lost.
  const previousCheckDay: string | null = latestCheckDay === null ? null : await ctx.runQuery(internal.siteSummaries.checkBefore, {
    websiteId: args.websiteId,
    locationCode: args.locationCode,
    day: latestCheckDay,
  });
  let left = 0;

  // One pass over the latest rankings: the headline counts, the pages, the
  // rows a complete pull shows the site no longer ranks for, and the compact
  // copy the keyword tables are counted and paged from (§5.2).
  const bands = emptyBandCounts();
  const intents = { buying: 0, researching: 0, branded: 0 };
  const split: IntentSplit = {
    branded: { searches: 0, visits: 0 },
    buying: { searches: 0, visits: 0 },
    researching: { searches: 0, visits: 0 },
    other: { searches: 0, visits: 0 },
  };
  let keywords = 0;
  let rankingDay = "";
  const lost: Id<"siteKeywordRanks">[] = [];
  const pages = new Map<string, PageAggregate>();
  const statusRows: Array<{ status: Doc<"siteKeywordRanks">["status"]; day: string }> = [];
  const copyRows: unknown[][] = [];

  let cursor: string | null = null;
  for (;;) {
    const page: { rows: Doc<"siteKeywordRanks">[]; cursor: string; isDone: boolean } = await ctx.runQuery(
      internal.siteSummaries.keywordPage,
      { websiteId: args.websiteId, locationCode: args.locationCode, cursor },
    );
    for (const row of page.rows) {
      if (row.day > rankingDay) rankingDay = row.day;
      const isLost = row.position === undefined || (completeDay !== null && row.day < completeDay);
      if (isLost) {
        // Copied as it will stand once marked lost below, on the day it was lost.
        const lostNow = row.position !== undefined && completeDay !== null;
        copyRows.push(lostNow ? keywordCopyTuple(row, completeDay) : keywordCopyTuple(row));
        if (row.position !== undefined) lost.push(row._id);
        statusRows.push({ status: "LOST", day: row.position !== undefined && completeDay ? completeDay : row.day });
        continue;
      }
      copyRows.push(keywordCopyTuple(row));
      const position = row.position as number;
      statusRows.push({ status: row.status, day: row.day });
      // Not seen at the latest check (T9): listed under its own filter, counted nowhere.
      if (latestCheckDay !== null && row.day < latestCheckDay) {
        if (previousCheckDay !== null && row.day >= previousCheckDay) left += 1;
        continue;
      }
      keywords += 1;
      if (row.band !== "zz_none") bands[row.band] += 1;
      if (row.intent === "BUYING") intents.buying += 1;
      if (row.intent === "RESEARCHING") intents.researching += 1;
      if (row.intent === "BRANDED") intents.branded += 1;
      const group = row.intent === "BRANDED" ? split.branded
        : row.intent === "BUYING" ? split.buying
          : row.intent === "RESEARCHING" ? split.researching
            : split.other;
      group.searches += 1;
      group.visits += row.traffic ?? 0;

      if (!row.page) continue;
      const held = pages.get(row.page);
      if (!held) {
        const fresh: PageAggregate = {
          page: row.page,
          url: row.url ?? row.page,
          section: sectionOf(row.page),
          keywords: 1,
          bestPosition: position,
          top3: position <= 3 ? 1 : 0,
          volumeSum: row.volume,
          topKeyword: row.keyword,
          topKeywordVolume: row.volume,
          firstSeenDay: row.firstSeenDay,
          day: row.day,
        };
        addPageFacts(fresh, row);
        pages.set(row.page, fresh);
      } else {
        addPageFacts(held, row);
        held.keywords += 1;
        held.bestPosition = Math.min(held.bestPosition, position);
        held.top3 += position <= 3 ? 1 : 0;
        held.volumeSum += row.volume;
        if (row.volume > held.topKeywordVolume) {
          held.topKeyword = row.keyword;
          held.topKeywordVolume = row.volume;
        }
        if (row.firstSeenDay < held.firstSeenDay) held.firstSeenDay = row.firstSeenDay;
        if (row.day > held.day) held.day = row.day;
      }
    }
    if (page.isDone) break;
    cursor = page.cursor;
  }
  if (completeDay && completeDay > rankingDay) rankingDay = completeDay;

  for (const ids of chunks(lost, WRITE_BATCH)) {
    await ctx.runMutation(internal.siteSummaries.markLost, { ids, day: completeDay ?? rankingDay });
  }

  await writeListCopy(ctx, {
    kind: "keywords",
    key: keywordsCopyKey(args.websiteId, args.locationCode),
    fields: KEYWORD_COPY_FIELDS,
    rows: copyRows,
    meta: { rankingDay: rankingDay || null, latestCheckDay, previousCheckDay },
  });

  // Pages and folders, written under this rebuild's id; whatever an older
  // rebuild wrote and this one did not is a page the site no longer ranks with.
  const rebuildId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const pageRows = [...pages.values()];
  for (const rows of chunks(pageRows, WRITE_BATCH)) {
    await ctx.runMutation(internal.siteSummaries.writePages, {
      websiteId: args.websiteId, locationCode: args.locationCode, rebuildId, rows,
    });
  }
  const sections = new Map<string, Infer<typeof sectionRowValidator>>();
  for (const row of pageRows) {
    const held = sections.get(row.section) ?? { section: row.section, pages: 0, keywords: 0, top3: 0, volumeSum: 0 };
    held.pages += 1;
    held.keywords += row.keywords;
    held.top3 += row.top3;
    held.volumeSum += row.volumeSum;
    if (row.traffic !== undefined) held.traffic = (held.traffic ?? 0) + row.traffic;
    if (!held.day || row.day > held.day) held.day = row.day;
    sections.set(row.section, held);
  }
  for (const rows of chunks([...sections.values()], WRITE_BATCH)) {
    await ctx.runMutation(internal.siteSummaries.writeSections, {
      websiteId: args.websiteId, locationCode: args.locationCode, rebuildId, rows,
    });
  }
  for (const table of ["sitePageRanks", "siteSections"] as const) {
    let staleCursor: string | null = null;
    for (;;) {
      const result: { cursor: string; isDone: boolean } = await ctx.runMutation(
        internal.siteSummaries.removeStale,
        { table, websiteId: args.websiteId, locationCode: args.locationCode, rebuildId, cursor: staleCursor },
      );
      if (result.isDone) break;
      staleCursor = result.cursor;
    }
  }
  // Top pages' copy, from the pages just written, with their judged types.
  await ctx.runMutation(internal.siteListCopies.requestCopies, {
    requests: [{ kind: "pages", key: pagesCopyKey(args.websiteId, args.locationCode) }],
  });
  // Your pages says which pages rank: rebuilt for every company whose own website it is.
  await ctx.runMutation(internal.holdPages.requestWebsiteRebuilds, { websiteId: args.websiteId });

  // What moved at the last check: the statuses of rows checked that day.
  const moved = { up: 0, down: 0, fresh: 0, lost: 0 };
  for (const row of statusRows) {
    if (row.day !== rankingDay) continue;
    if (row.status === "UP") moved.up += 1;
    if (row.status === "DOWN") moved.down += 1;
    if (row.status === "NEW") moved.fresh += 1;
    if (row.status === "LOST") moved.lost += 1;
  }

  if (rankingDay) {
    await ctx.runMutation(internal.siteSummaries.writeRankingDay, {
      websiteId: args.websiteId,
      locationCode: args.locationCode,
      day: rankingDay,
      keywords,
      bands,
      pages: pageRows.length,
      rankedUp: moved.up,
      rankedDown: moved.down,
      rankedNew: moved.fresh,
      rankedLost: moved.lost,
      rankedLeft: left,
      ...intents,
      intentSplit: split,
    });
  }

  // The website's own figures and its questions' answers, copied into the
  // day rows: the last fortnight normally, everything on a backfill.
  const today = new Date().toISOString().slice(0, 10);
  const firstDay: string | null = args.fullSync
    ? await ctx.runQuery(internal.siteSummaries.firstRecordedDay, { websiteId: args.websiteId }) ?? today
    : null;
  for (const window of syncWindows(args, firstDay)) {
    await ctx.runMutation(internal.siteSummaries.syncDays, window);
    await syncListAiLines(ctx, window);
  }

  // Pages the address could not place are asked about, a few at a time.
  await ctx.scheduler.runAfter(0, internal.sitePageTypes.judgePageTypes, {
    websiteId: args.websiteId,
    locationCode: args.locationCode,
  });
  return null;
}

/** How long a rebuild may hold its turn before another may take it: past an action's own ten minutes. */
const REBUILD_TURN_MS = 11 * 60 * 1000;

/** How long a rebuild that found another running waits before it tries again. */
export const REBUILD_WAIT_MS = 60 * 1000;

/**
 * Take this key's turn to rebuild, or say another rebuild holds it. Taking it
 * releases the request, so a filing that lands while this one runs asks for
 * another.
 */
export const beginRebuild = internalMutation({
  args: { key: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const row = await ctx.db
      .query("siteSummaryRequests")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (row?.runningSince !== undefined && now - row.runningSince < REBUILD_TURN_MS) return false;
    if (row) await ctx.db.patch(row._id, { pending: false, runningSince: now });
    else await ctx.db.insert("siteSummaryRequests", { key: args.key, pending: false, requestedAt: now, runningSince: now });
    return true;
  },
});

/**
 * Give the turn back, however the rebuild ended. One that finished (`done`)
 * says what it built is current to when it began (`builtFrom`); one that
 * failed leaves its key out of date, for the nightly refresh to catch.
 */
export const endRebuild = internalMutation({
  args: { key: v.string(), done: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("siteSummaryRequests")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (!row) return null;
    const finished = args.done === true && row.runningSince !== undefined ? { builtFrom: row.runningSince } : {};
    await ctx.db.patch(row._id, { runningSince: undefined, ...finished });
    return null;
  },
});

export const releaseRequest = internalMutation({
  args: { key: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("siteSummaryRequests")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (row) await ctx.db.patch(row._id, { pending: false });
    return null;
  },
});

/**
 * The day of the newest ranked-keywords pull that covered everything the site
 * ranks for, or null. Only such a pull can say a search was lost: one that
 * returned the first hundred of eight hundred says nothing about the rest.
 */
export const completeRankedDay = internalQuery({
  args: { websiteId: v.id("websites"), locationCode: v.number() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    // From this place only: another place's complete pull says nothing about
    // what this place's rankings lost. The everyday call is complete when the
    // site ranks for no more than it returns; the full list when its pages,
    // counted as they go, reach the site's whole count. The newest of the two
    // that is complete decides.
    let newestComplete: string | null = null;
    for (const operationId of ["domain_ranked_keywords", KEYWORD_LIST_OPERATION_ID]) {
      const list = operationId === KEYWORD_LIST_OPERATION_ID;
      const rows = (await ctx.db
        .query("seoWebsiteMetrics")
        .withIndex("by_website_operation_day", (q) => q.eq("websiteId", args.websiteId).eq("operationId", operationId))
        .order("desc")
        .take(list ? LIST_PAGES_READ_FOR_COMPLETE_DAY : PLACES_READ_FOR_COMPLETE_DAY))
        .filter((row) => isThisPlace(row, args.locationCode));
      // The everyday call speaks for itself, at its newest. A list's day is
      // complete only when its pages, taken together, cover it
      // (`listDayComplete`) — no longer when any one page said so.
      const complete = list
        ? newestCompleteListDay(rows)
        : rows.slice(0, 1).find((row) => {
          const metrics = JSON.parse(row.metricsJson) as { rankedKeywords?: number; returnedKeywords?: number };
          const ranked = metrics.rankedKeywords ?? 0;
          return ranked > 0 && (metrics.returnedKeywords ?? 0) >= ranked;
        })?.day ?? null;
      if (complete && (newestComplete === null || complete > newestComplete)) newestComplete = complete;
    }
    return newestComplete;
  },
});

/** How far back a list day's reach is compared: a limit lowered is followed after this long. */
const LIST_REACH_DAYS = 14;

/**
 * How far one day's pages of a keyword list reached, in rows: to the end of
 * the site's list when a page came back short, else as far as its pages went.
 * Unknown for pages filed before they recorded their figures.
 */
export function listDayReach(pages: ListPageFigures[]): number | null {
  if (pages.length === 0) return null;
  if (pages.some((page) => page.listItems < page.listLimit)) return Number.POSITIVE_INFINITY;
  return Math.max(...pages.map((page) => page.listOffset + page.listItems));
}

/**
 * The newest day of a keyword list that reached as far as any recent one:
 * the latest check of the whole list kept. A day that bought only the
 * everyday check's first pages is newer and shorter, and is not the latest
 * check — taken as it, every search past its pages would read as not in the
 * latest check, and the site's counts would shrink to the everyday check on
 * every run between the weekly lists (`everyRunReach` in `sitePagedLists.ts`).
 * With no figures to judge by, the newest day, as before.
 */
function latestWholeListDay(rows: Doc<"seoWebsiteMetrics">[]): string | null {
  const byDay = pagesByDay(rows);
  const days = [...new Set(rows.map((row) => row.day))].sort().reverse();
  const newest = days[0];
  if (!newest) return null;
  const since = shiftDay(newest, -LIST_REACH_DAYS);
  const reaches = days.filter((day) => day >= since).map((day) => ({ day, reach: listDayReach(byDay.get(day) ?? []) }));
  const known = reaches.filter((entry): entry is { day: string; reach: number } => entry.reach !== null);
  if (known.length === 0) return newest;
  const furthest = Math.max(...known.map((entry) => entry.reach));
  return known.find((entry) => entry.reach >= furthest)?.day ?? newest;
}

/** A site's newest list requests read to find those still out: a list is up to ten pages, from each place. */
const LIST_PULLS_READ = 100;

/**
 * The day of the latest keyword check that has fully arrived, from this
 * place (docs/plans/active/sites-table-pages-plan.md, T9): the newest full
 * keyword list with no page still out — while this week's pages are still
 * landing, last week's list is the latest — or, for a site with no full list,
 * its newest everyday check. Null when neither has been filed.
 *
 * A search last seen before this day is not in the latest check: the list
 * that day did not hold it. When the list covered everything the site ranks
 * for, `completeRankedDay` has it marked lost already; when the list was held
 * to the site's limit, it may still rank below that limit, and is kept aside
 * rather than called lost.
 */
export const latestKeywordCheck = internalQuery({
  args: { websiteId: v.id("websites"), locationCode: v.number() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const now = Date.now();
    const pulls = await ctx.db
      .query("seoDataPulls")
      .withIndex("by_website_operation_submitted", (q) => q.eq("websiteId", args.websiteId).eq("operationId", KEYWORD_LIST_OPERATION_ID))
      .order("desc")
      .take(LIST_PULLS_READ);
    // The days whose list still has a page out: that list has not finished arriving.
    const unfinished = new Set<string>();
    for (const pull of pulls) {
      if (pull.status === "READY" || pull.status === "FAILED" || now - pull.submittedAt > LIST_PAGE_STUCK_MS) continue;
      const cycle = pull.cycleId ? await ctx.db.get(pull.cycleId) : null;
      unfinished.add(new Date(cycle?.startedAt ?? pull.submittedAt).toISOString().slice(0, 10));
    }
    const listRows = (await ctx.db
      .query("seoWebsiteMetrics")
      .withIndex("by_website_operation_day", (q) => q.eq("websiteId", args.websiteId).eq("operationId", KEYWORD_LIST_OPERATION_ID))
      .order("desc")
      .take(LIST_PAGES_READ_FOR_COMPLETE_DAY))
      .filter((row) => isThisPlace(row, args.locationCode));
    const landed = latestWholeListDay(listRows.filter((row) => !unfinished.has(row.day)));
    if (landed) return landed;
    const everyday = (await ctx.db
      .query("seoWebsiteMetrics")
      .withIndex("by_website_operation_day", (q) => q.eq("websiteId", args.websiteId).eq("operationId", "domain_ranked_keywords"))
      .order("desc")
      .take(PLACES_READ_FOR_COMPLETE_DAY))
      .find((row) => isThisPlace(row, args.locationCode));
    return everyday?.day ?? null;
  },
});

/**
 * The keyword check before a day, of the same kind: the list before it, for
 * a day a list landed; else the everyday check before it. Null when none.
 */
export const checkBefore = internalQuery({
  args: { websiteId: v.id("websites"), locationCode: v.number(), day: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const before = async (operationId: string) => (await ctx.db
      .query("seoWebsiteMetrics")
      .withIndex("by_website_operation_day", (q) => q.eq("websiteId", args.websiteId).eq("operationId", operationId).lte("day", args.day))
      .order("desc")
      .take(LIST_PAGES_READ_FOR_COMPLETE_DAY))
      .filter((row) => isThisPlace(row, args.locationCode));
    const lists = await before(KEYWORD_LIST_OPERATION_ID);
    const rows = lists.some((row) => row.day === args.day) ? lists : await before("domain_ranked_keywords");
    return rows.find((row) => row.day < args.day)?.day ?? null;
  },
});

export const firstRecordedDay = internalQuery({
  args: { websiteId: v.id("websites") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const first = await ctx.db
      .query("seoWebsiteMetrics")
      .withIndex("by_website_day", (q) => q.eq("websiteId", args.websiteId))
      .first();
    return first?.day ?? null;
  },
});

export const keywordPage = internalQuery({
  args: { websiteId: v.id("websites"), locationCode: v.number(), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("siteKeywordRanks")
      .withIndex("by_site_keyword", (q) => q.eq("websiteId", args.websiteId).eq("locationCode", args.locationCode))
      .paginate({ cursor: args.cursor, numItems: KEYWORD_PAGE });
    return { rows: result.page, cursor: result.continueCursor, isDone: result.isDone };
  },
});

export const markLost = internalMutation({
  args: { ids: v.array(v.id("siteKeywordRanks")), day: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const id of args.ids) {
      const row = await ctx.db.get(id);
      if (!row || row.position === undefined) continue;
      // Seen again since the rebuild read it: not lost (collection reliability plan, 2.2).
      if (row.day >= args.day) continue;
      // Written out rather than spread, so the position it no longer holds —
      // and the traffic and page figures that came with it — cannot ride
      // along from the old row. The search's own facts stay: they still hold.
      await ctx.db.replace(id, {
        ...(row.cpc !== undefined ? { cpc: row.cpc } : {}),
        ...(row.difficulty !== undefined ? { difficulty: row.difficulty } : {}),
        ...(row.kdBand ? { kdBand: row.kdBand } : {}),
        ...(row.trend ? { trend: row.trend } : {}),
        ...(row.serpFeatures ? { serpFeatures: row.serpFeatures } : {}),
        websiteId: row.websiteId,
        locationCode: row.locationCode,
        keyword: row.keyword,
        band: "zz_none",
        ...(row.url ? { url: row.url } : {}),
        page: row.page,
        volume: row.volume,
        volumeKnown: row.volumeKnown,
        intent: row.intent,
        status: "LOST",
        change: 0,
        previousPosition: row.position,
        previousDay: row.day,
        ...(row.page ? { previousPage: row.page } : {}),
        day: args.day,
        firstSeenDay: row.firstSeenDay,
        searchText: row.searchText,
        updatedAt: now,
      });
    }
    return null;
  },
});

export const writePages = internalMutation({
  args: {
    websiteId: v.id("websites"),
    locationCode: v.number(),
    rebuildId: v.string(),
    rows: v.array(pageRowValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const row of args.rows) {
      const existing = await ctx.db
        .query("sitePageRanks")
        .withIndex("by_site_page", (q) =>
          q.eq("websiteId", args.websiteId).eq("locationCode", args.locationCode).eq("page", row.page))
        .unique();
      // What kind of page: the address when it says so, else the Decision's
      // answer once there is one (`sitePageTypes.ts`).
      const judged = await ctx.db
        .query("sitePageTypes")
        .withIndex("by_site_page", (q) => q.eq("websiteId", args.websiteId).eq("page", row.page))
        .unique();
      const fields = {
        ...row,
        pageType: pageTypeByAddress(row.page) ?? judged?.pageType ?? "UNJUDGED",
        websiteId: args.websiteId,
        locationCode: args.locationCode,
        searchText: `${row.page} ${row.topKeyword}`,
        rebuildId: args.rebuildId,
        updatedAt: now,
      };
      if (existing) await ctx.db.replace(existing._id, fields);
      else await ctx.db.insert("sitePageRanks", fields);
    }
    return null;
  },
});

export const writeSections = internalMutation({
  args: {
    websiteId: v.id("websites"),
    locationCode: v.number(),
    rebuildId: v.string(),
    rows: v.array(sectionRowValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const row of args.rows) {
      const existing = await ctx.db
        .query("siteSections")
        .withIndex("by_site_section", (q) =>
          q.eq("websiteId", args.websiteId).eq("locationCode", args.locationCode).eq("section", row.section))
        .unique();
      const fields = { ...row, websiteId: args.websiteId, locationCode: args.locationCode, rebuildId: args.rebuildId, updatedAt: now };
      if (existing) await ctx.db.replace(existing._id, fields);
      else await ctx.db.insert("siteSections", fields);
    }
    return null;
  },
});

/** Remove a page of rows an older rebuild wrote. One table per call; the caller loops. */
export const removeStale = internalMutation({
  args: {
    table: v.union(v.literal("sitePageRanks"), v.literal("siteSections")),
    websiteId: v.id("websites"),
    locationCode: v.number(),
    rebuildId: v.string(),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.object({ cursor: v.string(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const result = args.table === "sitePageRanks"
      ? await ctx.db
        .query("sitePageRanks")
        .withIndex("by_site_page", (q) => q.eq("websiteId", args.websiteId).eq("locationCode", args.locationCode))
        .paginate({ cursor: args.cursor, numItems: WRITE_BATCH })
      : await ctx.db
        .query("siteSections")
        .withIndex("by_site_section", (q) => q.eq("websiteId", args.websiteId).eq("locationCode", args.locationCode))
        .paginate({ cursor: args.cursor, numItems: WRITE_BATCH });
    for (const row of result.page) if (row.rebuildId !== args.rebuildId) await ctx.db.delete(row._id);
    return { cursor: result.continueCursor, isDone: result.isDone };
  },
});

/** Find or start the summary row for a site, place and day. */
async function daySummary(
  ctx: MutationCtx,
  websiteId: Id<"websites">,
  locationCode: number,
  day: string,
): Promise<Doc<"siteDaySummaries">> {
  const existing = await ctx.db
    .query("siteDaySummaries")
    .withIndex("by_site_day", (q) => q.eq("websiteId", websiteId).eq("locationCode", locationCode).eq("day", day))
    .unique();
  if (existing) return existing;
  const id = await ctx.db.insert("siteDaySummaries", { websiteId, locationCode, day, updatedAt: Date.now() });
  return (await ctx.db.get(id))!;
}

export const writeRankingDay = internalMutation({
  args: {
    websiteId: v.id("websites"),
    locationCode: v.number(),
    day: v.string(),
    keywords: v.number(),
    bands: bandCountsValidator,
    pages: v.number(),
    rankedUp: v.number(),
    rankedDown: v.number(),
    rankedNew: v.number(),
    rankedLost: v.number(),
    rankedLeft: v.optional(v.number()),
    buying: v.number(),
    researching: v.number(),
    branded: v.number(),
    intentSplit: intentSplitValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { websiteId, locationCode, day, ...fields } = args;
    const row = await daySummary(ctx, websiteId, locationCode, day);
    await ctx.db.patch(row._id, { ...fields, updatedAt: Date.now() });
    return null;
  },
});

/**
 * Copy the website's figures for a window of days into the day rows of one
 * place. Each company's AI lines about it are counted apart, a list at a time
 * (`syncListAiLines`, `siteListAiDays.ts`).
 */
export const syncDays = internalMutation({
  args: { websiteId: v.id("websites"), locationCode: v.number(), fromDay: v.string(), toDay: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await syncDayFigures(ctx, args);
    return null;
  },
});

/** A site's newest ranked-keywords totals read to find this place's: enough for every place watching it. */
const PLACES_READ_FOR_COMPLETE_DAY = 50;

/** A list's newest page figures read: a list is up to a few dozen pages a day, from each place. */
const LIST_PAGES_READ_FOR_COMPLETE_DAY = 200;

/** What a list page recorded about the whole list, for `listDayComplete`: its rows, and the searches among them. */
export type ListPageFigures = {
  listOffset: number;
  listLimit: number;
  listItems: number;
  listDropped: number;
  listTotal?: number;
  /** The searches among the page's rows; absent on pages filed before they were counted. */
  searches?: number;
  /** The searches the supplier says the site ranks for. */
  rankedKeywords?: number;
};

/**
 * Whether one day's pages of a full keyword list cover the whole of it: from
 * the start with no gap, each page bringing every row it should have — a full
 * page, or the rest of the list — with nothing dropped to fit, up to
 * DataForSEO's total across every row kind. Only then can a search missing
 * from it be called lost (collection reliability plan, 2.1 and 2.2). A list
 * held to a limit below the site's total is never whole, so it never calls
 * anything lost, as before.
 */
export function listDayComplete(pages: ListPageFigures[]): boolean {
  const total = Math.max(0, ...pages.map((page) => page.listTotal ?? 0));
  if (total <= 0) return false;
  // Two pages from one place can start at one row — an everyday check cut
  // short of a thousand, and the week's full page — and the longer speaks.
  const byOffset = new Map<number, ListPageFigures>();
  for (const page of pages) {
    const held = byOffset.get(page.listOffset);
    if (!held || page.listLimit > held.listLimit) byOffset.set(page.listOffset, page);
  }
  let searches = 0;
  let counted = true;
  for (let offset = 0; offset < total;) {
    const page = byOffset.get(offset);
    if (!page || page.listDropped > 0 || page.listLimit <= 0) return false;
    if (page.listItems < Math.min(page.listLimit, total - offset)) return false;
    if (page.searches === undefined) counted = false;
    searches += page.searches ?? 0;
    offset += page.listLimit;
  }
  // Every search the supplier counts, too: pages bought on different days can
  // shift where a row falls, and a search skipped between two of them would
  // otherwise read as lost (sites-data-completeness-plan.md, B9).
  const ranked = Math.max(0, ...pages.map((page) => page.rankedKeywords ?? 0));
  return !counted || ranked === 0 || searches >= ranked;
}

/** A keyword list's pages by day, with the figures each recorded; pages filed before they recorded them are left out. */
export function pagesByDay(rows: Doc<"seoWebsiteMetrics">[]): Map<string, ListPageFigures[]> {
  const byDay = new Map<string, ListPageFigures[]>();
  for (const row of rows) {
    const figures = JSON.parse(row.metricsJson) as Partial<ListPageFigures>;
    if (typeof figures.listOffset !== "number" || typeof figures.listLimit !== "number" || typeof figures.listItems !== "number") continue;
    const pages = byDay.get(row.day) ?? [];
    const through = (figures as { returnedKeywords?: unknown }).returnedKeywords;
    const ranked = (figures as { rankedKeywords?: unknown }).rankedKeywords;
    pages.push({
      listOffset: figures.listOffset,
      listLimit: figures.listLimit,
      listItems: figures.listItems,
      listDropped: figures.listDropped ?? 0,
      ...(typeof figures.listTotal === "number" ? { listTotal: figures.listTotal } : {}),
      // A page records its searches as how far they reach: its first row's place and its own.
      ...(typeof through === "number" ? { searches: Math.max(0, through - figures.listOffset) } : {}),
      ...(typeof ranked === "number" ? { rankedKeywords: ranked } : {}),
    });
    byDay.set(row.day, pages);
  }
  return byDay;
}

/** The newest day whose list pages cover the whole list, or null. Pages filed before they recorded their figures never count. */
function newestCompleteListDay(rows: Doc<"seoWebsiteMetrics">[]): string | null {
  const byDay = pagesByDay(rows);
  for (const day of [...byDay.keys()].sort().reverse()) {
    if (listDayComplete(byDay.get(day) ?? [])) return day;
  }
  return null;
}

