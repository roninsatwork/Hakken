import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { answerPlace, type AiEngine } from "./seoAiEngines";
import { requestGapRebuild, siteRebuildKey } from "./siteRankings";
import { DEFAULT_LOCATION_CODE } from "./utils/seoLocations";
import { isTrackedHold, pairedOwnedHold } from "./utils/websitePairing";
import {
  bandCountsValidator,
  emptyBandCounts,
  pageTypeByAddress,
  sectionOf,
  type BandCounts,
  type EngineDay,
} from "./utils/siteShapes";

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

/** Days of metrics and answers copied into the day summaries on an ordinary rebuild. */
const SYNC_DAYS = 14;

/** A site's questions read when counting its answers. */
const QUESTIONS_READ = 200;

/** Answers read per question and engine for one window of days. */
const ANSWERS_PER_WINDOW = 400;

/** Metrics rows read for one window of days. */
const METRICS_PER_WINDOW = 2_000;

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

function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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
    // Released first, so a filing that lands while this runs asks for another.
    await ctx.runMutation(internal.siteSummaries.releaseRequest, {
      key: siteRebuildKey(args.websiteId, args.locationCode),
    });

    const completeDay: string | null = await ctx.runQuery(internal.siteSummaries.completeRankedDay, {
      websiteId: args.websiteId,
      locationCode: args.locationCode,
    });

    // One pass over the latest rankings: the headline counts, the pages and
    // the rows a complete pull shows the site no longer ranks for.
    const bands = emptyBandCounts();
    const intents = { buying: 0, researching: 0, branded: 0 };
    let keywords = 0;
    let rankingDay = "";
    const lost: Id<"siteKeywordRanks">[] = [];
    const pages = new Map<string, PageAggregate>();
    const statusRows: Array<{ status: Doc<"siteKeywordRanks">["status"]; day: string }> = [];

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
          if (row.position !== undefined) lost.push(row._id);
          statusRows.push({ status: "LOST", day: row.position !== undefined && completeDay ? completeDay : row.day });
          continue;
        }
        const position = row.position as number;
        statusRows.push({ status: row.status, day: row.day });
        keywords += 1;
        if (row.band !== "zz_none") bands[row.band] += 1;
        if (row.intent === "BUYING") intents.buying += 1;
        if (row.intent === "RESEARCHING") intents.researching += 1;
        if (row.intent === "BRANDED") intents.branded += 1;

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
        ...intents,
      });
    }

    // The website's own figures and its questions' answers, copied into the
    // day rows: the last fortnight normally, everything on a backfill.
    const today = new Date().toISOString().slice(0, 10);
    const firstDay: string | null = args.fullSync
      ? await ctx.runQuery(internal.siteSummaries.firstRecordedDay, { websiteId: args.websiteId })
      : shiftDay(today, -SYNC_DAYS);
    for (let from = firstDay ?? today; from <= today; from = shiftDay(from, 31)) {
      await ctx.runMutation(internal.siteSummaries.syncDays, {
        websiteId: args.websiteId,
        locationCode: args.locationCode,
        fromDay: from,
        toDay: shiftDay(from, 30),
      });
    }

    await ctx.runMutation(internal.siteSummaries.requestGapsFor, {
      websiteId: args.websiteId,
      locationCode: args.locationCode,
    });
    // Pages the address could not place are asked about, a few at a time.
    await ctx.scheduler.runAfter(0, internal.sitePageTypes.judgePageTypes, {
      websiteId: args.websiteId,
      locationCode: args.locationCode,
    });
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
    // what this place's rankings lost.
    const newest = (await ctx.db
      .query("seoWebsiteMetrics")
      .withIndex("by_website_operation_day", (q) =>
        q.eq("websiteId", args.websiteId).eq("operationId", "domain_ranked_keywords"))
      .order("desc")
      .take(PLACES_READ_FOR_COMPLETE_DAY))
      .find((row) => isThisPlace(row, args.locationCode));
    if (!newest) return null;
    const metrics = JSON.parse(newest.metricsJson) as { rankedKeywords?: number; returnedKeywords?: number };
    const ranked = metrics.rankedKeywords ?? 0;
    const returned = metrics.returnedKeywords ?? 0;
    return ranked > 0 && returned >= ranked ? newest.day : null;
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
    buying: v.number(),
    researching: v.number(),
    branded: v.number(),
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
 * Copy the website's figures and its questions' answers for a window of days
 * into the day rows of one place.
 */
export const syncDays = internalMutation({
  args: { websiteId: v.id("websites"), locationCode: v.number(), fromDay: v.string(), toDay: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const perDay = new Map<string, Partial<Doc<"siteDaySummaries">>>();
    const touch = (day: string) => {
      const held = perDay.get(day) ?? {};
      perDay.set(day, held);
      return held;
    };

    const metrics = await ctx.db
      .query("seoWebsiteMetrics")
      .withIndex("by_website_day", (q) =>
        q.eq("websiteId", args.websiteId).gte("day", args.fromDay).lte("day", args.toDay))
      .take(METRICS_PER_WINDOW);
    for (const row of metrics) {
      if (!isThisPlace(row, args.locationCode)) continue;
      const figures = JSON.parse(row.metricsJson) as Record<string, number | null | undefined>;
      const into = touch(row.day);
      const copy = (from: string, to: keyof Doc<"siteDaySummaries">) => {
        const value = figures[from];
        if (typeof value === "number") (into as Record<string, unknown>)[to] = value;
      };
      if (row.operationId === "domain_ranked_keywords") {
        if (typeof figures.rankedKeywords === "number") into.rankedKeywordsTotal = figures.rankedKeywords;
        if (typeof figures.estimatedTraffic === "number") into.estimatedTraffic = Math.round(figures.estimatedTraffic);
        if (typeof figures.trafficValue === "number") into.trafficValue = Math.round(figures.trafficValue);
        copy("keywordsNew", "keywordsNew");
        copy("keywordsUp", "keywordsUp");
        copy("keywordsDown", "keywordsDown");
        copy("keywordsLost", "keywordsLost");
        copy("featuredSnippets", "featuredSnippets");
        copy("localPacks", "localPacks");
        copy("aiOverviewRefs", "aiOverviewRefs");
        if (typeof figures.paidKeywords === "number") into.paidKeywords = figures.paidKeywords;
        if (typeof figures.paidTraffic === "number") into.paidTraffic = Math.round(figures.paidTraffic);
        if (typeof figures.paidTrafficCost === "number") into.paidTrafficCost = Math.round(figures.paidTrafficCost);
        const allBands = bandsFrom(figures);
        if (allBands) into.allBands = allBands;
      } else if (row.operationId === "backlinks_summary") {
        copy("backlinks", "backlinks");
        copy("referringDomains", "referringDomains");
        copy("referringMainDomains", "referringMainDomains");
        copy("rank", "domainRank");
        copy("brokenBacklinks", "brokenBacklinks");
        copy("spamScore", "spamScore");
        copy("brokenPages", "brokenPages");
      } else if (row.operationId === "bulk_backlinks" && into.backlinks === undefined) {
        copy("backlinks", "backlinks");
      } else if (row.operationId === "bulk_referring_domains" && into.referringDomains === undefined) {
        copy("referringDomains", "referringDomains");
      } else if (row.operationId === "bulk_ranks" && into.domainRank === undefined) {
        copy("rank", "domainRank");
      }
    }

    // The site's own questions, asked of each engine from where that engine
    // answers for this place.
    const questions = await ctx.db
      .query("websiteQuestions")
      .withIndex("by_website", (q) => q.eq("websiteId", args.websiteId))
      .take(QUESTIONS_READ);
    const ai = new Map<string, Map<AiEngine, EngineDay>>();
    // Every other website those answers named, by day: the competitor lines
    // on this site's charts read these, and nothing else (D17).
    const rivals = new Map<string, { day: string; websiteId: Id<"websites">; engines: Map<AiEngine, EngineDay> }>();
    for (const question of questions) {
      for (const engine of question.engines) {
        const answers = await ctx.db
          .query("aiAnswers")
          .withIndex("by_question", (q) =>
            q.eq("prompt", question.prompt).eq("engine", engine)
              .eq("locationCode", answerPlace(engine, args.locationCode))
              .gte("day", args.fromDay).lte("day", args.toDay))
          .take(ANSWERS_PER_WINDOW);
        for (const answer of answers) {
          const day = ai.get(answer.day) ?? new Map<AiEngine, EngineDay>();
          ai.set(answer.day, day);
          const held = day.get(engine) ?? { engine, asked: 0, named: 0, recommended: 0 };
          held.asked += 1;
          if (answer.named.includes(args.websiteId)) held.named += 1;
          if (answer.recommended.includes(args.websiteId)) held.recommended += 1;
          day.set(engine, held);

          for (const named of new Set(answer.named)) {
            if (named === args.websiteId) continue;
            const key = `${answer.day}|${named}`;
            const rival = rivals.get(key) ?? { day: answer.day, websiteId: named, engines: new Map<AiEngine, EngineDay>() };
            rivals.set(key, rival);
            // "Asked" stays at nought: the questions were this site's, not the rival's.
            const counts = rival.engines.get(engine) ?? { engine, asked: 0, named: 0, recommended: 0 };
            counts.named += 1;
            if (answer.recommended.includes(named)) counts.recommended += 1;
            rival.engines.set(engine, counts);
          }
        }
      }
    }
    for (const [day, engines] of ai) touch(day).ai = [...engines.values()];

    const now = Date.now();
    for (const [day, fields] of perDay) {
      const row = await daySummary(ctx, args.websiteId, args.locationCode, day);
      await ctx.db.patch(row._id, { ...fields, updatedAt: now });
    }

    // The window's rival rows made to match what the answers say now: a row
    // an answer no longer supports goes, and an unchanged one is left alone.
    const standing = await ctx.db
      .query("siteRivalAiDays")
      .withIndex("by_asker_day", (q) =>
        q.eq("askerWebsiteId", args.websiteId).eq("locationCode", args.locationCode)
          .gte("day", args.fromDay).lte("day", args.toDay))
      .take(RIVAL_ROWS_PER_WINDOW);
    const unclaimed = new Map(standing.map((row) => [`${row.day}|${row.websiteId}`, row]));
    for (const [key, rival] of rivals) {
      const ai = [...rival.engines.values()];
      const row = unclaimed.get(key);
      unclaimed.delete(key);
      if (row && JSON.stringify(row.ai) === JSON.stringify(ai)) continue;
      const fields = {
        askerWebsiteId: args.websiteId,
        locationCode: args.locationCode,
        websiteId: rival.websiteId,
        day: rival.day,
        ai,
        updatedAt: now,
      };
      if (row) await ctx.db.replace(row._id, fields);
      else await ctx.db.insert("siteRivalAiDays", fields);
    }
    for (const row of unclaimed.values()) await ctx.db.delete(row._id);
    return null;
  },
});

/** A window's rival rows: a month of days, each naming a few dozen websites at most. */
const RIVAL_ROWS_PER_WINDOW = 4_000;

/** Whether a metrics row speaks for this place: a site-wide figure, or an older row, speaks for every place. */
function isThisPlace(row: Doc<"seoWebsiteMetrics">, locationCode: number): boolean {
  return row.locationCode === undefined || row.locationCode === locationCode;
}

/** A site's newest ranked-keywords totals read to find this place's: enough for every place watching it. */
const PLACES_READ_FOR_COMPLETE_DAY = 50;

/**
 * DataForSEO's own position bands for everything a site ranks for, grouped
 * into ours, from a ranked-keywords metrics row — or null for a row filed
 * before the bands were read out (Phase 2).
 */
function bandsFrom(figures: Record<string, number | null | undefined>): BandCounts | null {
  if (typeof figures.bandTop3 !== "number") return null;
  const count = (key: string) => (typeof figures[key] === "number" ? figures[key] as number : 0);
  return {
    p01_03: count("bandTop3"),
    p04_10: count("band4to10"),
    p11_20: count("band11to20"),
    p21_50: count("band21to50"),
    p51_up: count("band51up"),
  };
}

/**
 * After a site is rebuilt, every content gap it takes part in: the gap of each
 * hold in each group the site belongs to, since every hold is a Site (D17) and
 * each one's gap is read against the rest of its group.
 */
export const requestGapsFor = internalMutation({
  args: { websiteId: v.id("websites"), locationCode: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const holds = await ctx.db
      .query("companyWebsites")
      .withIndex("by_website", (q) => q.eq("websiteId", args.websiteId))
      .take(200);
    for (const hold of holds) {
      const owner = isTrackedHold(hold) ? await pairedOwnedHold(ctx, hold) : hold;
      if (!owner) continue;
      if ((owner.locationCode ?? DEFAULT_LOCATION_CODE) !== args.locationCode) continue;
      const competitors = (await ctx.db
        .query("companyWebsites")
        .withIndex("by_company_against", (q) => q.eq("companyId", owner.companyId).eq("againstWebsiteId", owner.websiteId))
        .take(200))
        .filter(isTrackedHold);
      for (const member of [owner, ...competitors]) await requestGapRebuild(ctx, member._id);
    }
    return null;
  },
});
