import { v } from "convex/values";

import { internalAction, internalMutation, internalQuery, type ActionCtx, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { BACKLINK_LIST_OPERATION_ID } from "./dataForSeoLinkOperations";
import { KEYWORD_LIST_OPERATION_ID } from "./dataForSeoKeywordListOperations";
import { DISCOVERY_OPERATION_ID } from "./siteDiscovery";
import { dropCopies } from "./siteListCopies";
import { requestSiteRebuild } from "./siteRankings";
import { sentOffset } from "./sitePagedLists";
import { anyCompanyOwns } from "./utils/websitePairing";
import { competitorOnlyWebsites } from "./websites";

/**
 * Clear out what is no longer collected for competitors, across every
 * website on the platform (docs/plans/active/finish-off-plan.md, item 12;
 * Anthony, 2026-10-05: "the clear out script is across all websites in the
 * platform, not just those we added today").
 *
 * A competitor — a website no company holds as its own — keeps its link
 * totals, its linking websites, its keyword totals and its top 1,000
 * keywords (items 6 and 6b). Removed: its crawls, their pages and broken
 * links, and the crawl's figures on each day's summary; every other link list (every link, one per site, broken links,
 * gained and lost, link words, linking servers); its keywords past the top
 * 1,000; and "who competes with it". A website any company owns is never
 * touched, even where another company watches it as a competitor.
 *
 * What DataForSEO was paid is kept: the calls (`seoDataPulls`) are the cost
 * record. Their raw answers go after 30 days on their own.
 *
 * Run once on each deployment, first `go: false` — counts, changes nothing —
 * then `go: true`. A page of rows a step, in runs that hand on to the next
 * before an action's ten minutes. Safe to run again.
 */

/** A competitor's keywords kept: the top 1,000 by estimated visits, as its list is now bought (item 6b). */
export const COMPETITOR_KEYWORDS_KEPT = 1_000;

/** The link lists a competitor no longer has: everything but the totals and the linking websites. */
const DROPPED_LINK_OPERATIONS = [
  BACKLINK_LIST_OPERATION_ID,
  "backlinks_list",
  "backlinks_broken",
  "backlinks_new_lost",
  "anchors_list",
  "referring_ips_list",
] as const;

/** Rows read or removed per step: small rows, but kept under a thousand (`src/analytics-read-drift.test.ts`). */
const ROWS_PER_STEP = 500;
/** Websites read per page when looking for competitors. */
const WEBSITES_PER_PAGE = 100;
/** How long one run works before it hands on to the next: an action stops at ten minutes. */
const CLEAN_RUN_MS = 6 * 60 * 1000;

const TASKS = [
  "crawls",
  "crawlPages",
  "crawlLinks",
  "crawlFigures",
  "backlinks",
  "anchors",
  "ips",
  "subnets",
  "linkDays",
  "linkCopy",
  "metrics",
  "keywordPages",
  "keywordRanks",
  "discovery",
] as const;
type Task = (typeof TASKS)[number];
const taskValidator = v.union(...TASKS.map((task) => v.literal(task)));

/** Where a step got to, besides its cursor: the keyword ranks' place and count so far, and the places touched. */
const markValidator = v.object({ location: v.union(v.number(), v.null()), seen: v.number(), locations: v.array(v.number()) });
type Mark = typeof markValidator.type;
const NO_MARK: Mark = { location: null, seen: 0, locations: [] };

const stepValidator = v.object({ found: v.number(), continueCursor: v.string(), isDone: v.boolean(), mark: markValidator });
type Step = typeof stepValidator.type;

const tallyValidator = v.record(v.string(), v.number());
type Tally = Record<string, number>;

/** A page of websites, with the ones no company owns and what to call them. */
export const competitorWebsites = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    websites: v.array(v.object({ websiteId: v.id("websites"), host: v.string() })),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => await competitorOnlyWebsites(ctx, args.cursor, WEBSITES_PER_PAGE),
});

type Paged<T> = { page: T[]; continueCursor: string; isDone: boolean };

/** Count a page of rows, removing them when going ahead. */
async function clearPage(ctx: MutationCtx, page: Paged<{ _id: Id<never> }>, go: boolean): Promise<Step> {
  if (go) for (const row of page.page) await ctx.db.delete(row._id);
  return { found: page.page.length, continueCursor: page.continueCursor, isDone: page.isDone, mark: NO_MARK };
}

/** Packed records looked at a step: each up to a thousand rows. */
const PARTS_PER_STEP = 20;

/** Count a page of packed records' rows, removing the records when going ahead. */
async function clearParts(ctx: MutationCtx, page: Paged<{ _id: Id<"siteAnchorParts"> | Id<"siteReferringIpParts"> }>, rows: number, go: boolean): Promise<Step> {
  if (go) for (const part of page.page) await ctx.db.delete(part._id);
  return { found: rows, continueCursor: page.continueCursor, isDone: page.isDone, mark: NO_MARK };
}

/**
 * One step of one task for one competitor: a page of its rows counted, and
 * removed when going ahead. Says where to go on.
 */
export const cleanStep = internalMutation({
  args: { websiteId: v.id("websites"), task: taskValidator, go: v.boolean(), cursor: v.union(v.string(), v.null()), mark: markValidator },
  returns: stepValidator,
  handler: async (ctx, args): Promise<Step> => {
    const site = args.websiteId;
    // A website made someone's own since the run began is left alone.
    if (await anyCompanyOwns(ctx, site)) return { found: 0, continueCursor: "", isDone: true, mark: args.mark };
    const paging = { cursor: args.cursor, numItems: ROWS_PER_STEP };
    const as = <T>(page: Paged<T>) => page as unknown as Paged<{ _id: Id<never> }>;
    switch (args.task) {
      case "crawls":
        return await clearPage(ctx, as(await ctx.db.query("siteCrawls").withIndex("by_site_day", (q) => q.eq("websiteId", site)).paginate(paging)), args.go);
      case "crawlPages":
        return await clearPage(ctx, as(await ctx.db.query("siteCrawlPages").withIndex("by_site", (q) => q.eq("websiteId", site)).paginate(paging)), args.go);
      case "crawlLinks":
        return await clearPage(ctx, as(await ctx.db.query("siteCrawlLinks").withIndex("by_site", (q) => q.eq("websiteId", site)).paginate(paging)), args.go);
      case "crawlFigures": {
        // A crawl's pages and score, written onto each day's summary: the fields cleared, the days kept.
        const page = await ctx.db.query("siteDaySummaries").withIndex("by_site_day", (q) => q.eq("websiteId", site)).paginate(paging);
        const crawled = page.page.filter((row) => row.crawledPages !== undefined || row.onPageScore !== undefined);
        if (args.go) for (const row of crawled) await ctx.db.patch(row._id, { crawledPages: undefined, onPageScore: undefined });
        return { found: crawled.length, continueCursor: page.continueCursor, isDone: page.isDone, mark: args.mark };
      }
      case "backlinks":
        return await clearPage(ctx, as(await ctx.db.query("siteBacklinks").withIndex("by_site_pass_day", (q) => q.eq("websiteId", site)).paginate(paging)), args.go);
      // Packed a check's list a record (`siteLinkGroupParts.ts`): a few records a step, their rows counted.
      case "anchors": {
        const page = await ctx.db.query("siteAnchorParts").withIndex("by_site_day", (q) => q.eq("websiteId", site)).paginate({ cursor: args.cursor, numItems: PARTS_PER_STEP });
        return await clearParts(ctx, page, page.page.reduce((sum, part) => sum + part.anchors.length, 0), args.go);
      }
      case "ips": {
        const page = await ctx.db.query("siteReferringIpParts").withIndex("by_site_day", (q) => q.eq("websiteId", site)).paginate({ cursor: args.cursor, numItems: PARTS_PER_STEP });
        return await clearParts(ctx, page, page.page.reduce((sum, part) => sum + part.ips.length, 0), args.go);
      }
      case "subnets":
        return await clearPage(ctx, as(await ctx.db.query("siteReferringSubnets").withIndex("by_site_domains", (q) => q.eq("websiteId", site)).paginate(paging)), args.go);
      case "linkDays":
        return await clearPage(ctx, as(await ctx.db.query("siteLinkDays").withIndex("by_site_day", (q) => q.eq("websiteId", site)).paginate(paging)), args.go);
      case "linkCopy": {
        // Every link's compact copy for the screens: its header counted, all of it removed.
        const header = await ctx.db.query("siteListCopies").withIndex("by_kind_key", (q) => q.eq("kind", "links").eq("key", `${site}`)).first();
        const more = args.go ? await dropCopies(ctx, "links", `${site}`) : false;
        return { found: args.cursor === null && header ? 1 : 0, continueCursor: "more", isDone: !more, mark: args.mark };
      }
      case "metrics":
        return await metricsStep(ctx, site, args.go, args.cursor, args.mark);
      case "keywordPages":
        return await keywordPagesStep(ctx, site, args.go, args.cursor, args.mark);
      case "keywordRanks":
        return await keywordRanksStep(ctx, site, args.go, args.cursor, args.mark);
      case "discovery":
        return await discoveryStep(ctx, site, args.go, args.mark);
    }
  },
});

/**
 * The figures DataForSEO's dropped lists and "who competes with it" left on
 * each day, one operation after another: `mark.seen` is which operation.
 */
async function metricsStep(ctx: MutationCtx, site: Id<"websites">, go: boolean, cursor: string | null, mark: Mark): Promise<Step> {
  const operations = [...DROPPED_LINK_OPERATIONS, DISCOVERY_OPERATION_ID];
  const operation = operations[mark.seen];
  if (operation === undefined) return { found: 0, continueCursor: "", isDone: true, mark };
  const page = await ctx.db
    .query("seoWebsiteMetrics")
    .withIndex("by_website_operation_day", (q) => q.eq("websiteId", site).eq("operationId", operation))
    .paginate({ cursor, numItems: ROWS_PER_STEP });
  if (go) for (const row of page.page) await ctx.db.delete(row._id);
  if (!page.isDone) return { found: page.page.length, continueCursor: page.continueCursor, isDone: false, mark };
  // This operation done: the next from the start, until none is left.
  const next = mark.seen + 1;
  return { found: page.page.length, continueCursor: "", isDone: next >= operations.length, mark: { ...mark, seen: next } };
}

/**
 * The keyword list's pages past the top 1,000: each such page's positions,
 * search features and page figures. A page at a time; a page with more rows
 * than a step removes is come back to.
 */
async function keywordPagesStep(ctx: MutationCtx, site: Id<"websites">, go: boolean, cursor: string | null, mark: Mark): Promise<Step> {
  const page = await ctx.db
    .query("seoDataPulls")
    .withIndex("by_website_operation_submitted", (q) => q.eq("websiteId", site).eq("operationId", KEYWORD_LIST_OPERATION_ID))
    .paginate({ cursor, numItems: 1 });
  const pull = page.page[0];
  if (!pull || sentOffset(pull.taskArgsJson) < COMPETITOR_KEYWORDS_KEPT) {
    return { found: 0, continueCursor: page.continueCursor, isDone: page.isDone, mark };
  }
  const features = await ctx.db.query("siteKeywordFeatures").withIndex("by_pull", (q) => q.eq("pullId", pull._id)).take(ROWS_PER_STEP);
  const figures = await ctx.db.query("seoWebsiteMetrics").withIndex("by_pull", (q) => q.eq("pullId", pull._id)).take(ROWS_PER_STEP);
  const rows = [...features, ...figures];
  if (!go) return { found: rows.length, continueCursor: page.continueCursor, isDone: page.isDone, mark };
  for (const row of rows) await ctx.db.delete(row._id);
  const more = features.length === ROWS_PER_STEP || figures.length === ROWS_PER_STEP;
  // More of this page's rows left: the same page again; otherwise on.
  return more
    ? { found: rows.length, continueCursor: cursor ?? "", isDone: false, mark }
    : { found: rows.length, continueCursor: page.continueCursor, isDone: page.isDone, mark };
}

/**
 * The keywords a competitor ranks for past its top 1,000 by estimated visits,
 * in each place: read most visits first, place by place, counting as it goes.
 * The places touched are rebuilt after.
 */
async function keywordRanksStep(ctx: MutationCtx, site: Id<"websites">, go: boolean, cursor: string | null, mark: Mark): Promise<Step> {
  const page = await ctx.db
    .query("siteKeywordRanks")
    .withIndex("by_site_traffic", (q) => q.eq("websiteId", site))
    .order("desc")
    .paginate({ cursor, numItems: ROWS_PER_STEP });
  let { location, seen } = mark;
  const locations = new Set(mark.locations);
  let found = 0;
  for (const row of page.page) {
    if (row.locationCode !== location) {
      location = row.locationCode;
      seen = 0;
    }
    seen += 1;
    if (seen <= COMPETITOR_KEYWORDS_KEPT) continue;
    found += 1;
    locations.add(row.locationCode);
    if (go) await ctx.db.delete(row._id);
  }
  return { found, continueCursor: page.continueCursor, isDone: page.isDone, mark: { location, seen, locations: [...locations] } };
}

/** "Who competes with it", found for each company watching the competitor: one hold a step. */
async function discoveryStep(ctx: MutationCtx, site: Id<"websites">, go: boolean, mark: Mark): Promise<Step> {
  const holds = await ctx.db.query("companyWebsites").withIndex("by_website", (q) => q.eq("websiteId", site)).take(100);
  const hold = holds[mark.seen];
  if (!hold) return { found: 0, continueCursor: "", isDone: true, mark };
  const found = await ctx.db.query("discoveredCompetitors").withIndex("by_company_website", (q) => q.eq("companyWebsiteId", hold._id)).take(ROWS_PER_STEP);
  const rows = found;
  if (go) for (const row of rows) await ctx.db.delete(row._id);
  // Counting, or all of this hold's gone: the next hold.
  const next = !go || rows.length < ROWS_PER_STEP ? mark.seen + 1 : mark.seen;
  return { found: rows.length, continueCursor: "", isDone: next >= holds.length, mark: { ...mark, seen: next } };
}

/**
 * After a competitor's rows go: its keyword summaries rebuilt in each place
 * touched — and with them its keyword copy, which the content gaps it is in
 * read when they are read (`siteContentGap.ts`).
 */
export const afterCleanOut = internalMutation({
  args: { websiteId: v.id("websites"), locations: v.array(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const location of args.locations) await requestSiteRebuild(ctx, args.websiteId, location);
    return null;
  },
});

const LABELS: Record<Task, string> = {
  crawls: "crawls",
  crawlPages: "crawled pages",
  crawlLinks: "crawled broken links",
  crawlFigures: "days' crawl figures",
  backlinks: "links (every link, one per site, broken)",
  anchors: "link words",
  ips: "linking servers",
  subnets: "linking networks",
  linkDays: "links gained and lost, by day",
  linkCopy: "every link's screen copy",
  metrics: "daily figures of the dropped lists",
  keywordPages: "keyword rows from pages past the top 1,000",
  keywordRanks: "keywords past the top 1,000",
  discovery: "\"who competes with it\" rows",
};

function sentence(tally: Tally, go: boolean): string {
  const parts = TASKS.filter((task) => (tally[task] ?? 0) > 0).map((task) => `${tally[task]} ${LABELS[task]}`);
  return parts.length === 0 ? "nothing to clear" : `${parts.join(", ")} ${go ? "removed" : "to remove"}`;
}

const add = (one: Tally, two: Tally): Tally => {
  const sum: Tally = { ...one };
  for (const [key, count] of Object.entries(two)) sum[key] = (sum[key] ?? 0) + count;
  return sum;
};

const siteValidator = v.object({
  websiteId: v.id("websites"),
  host: v.string(),
  task: v.number(),
  cursor: v.union(v.string(), v.null()),
  mark: markValidator,
  tally: tallyValidator,
});
type Site = typeof siteValidator.type;

/**
 * Clear out what is no longer collected for every competitor on the
 * platform. `go: false` counts; `go: true` removes. Returns the report when it
 * finishes in its first run; otherwise hands on, and the last run logs it.
 */
export const cleanOutCompetitors = internalAction({
  args: {
    go: v.boolean(),
    cursor: v.optional(v.union(v.string(), v.null())),
    queue: v.optional(v.array(v.object({ websiteId: v.id("websites"), host: v.string() }))),
    listed: v.optional(v.boolean()),
    site: v.optional(siteValidator),
    tally: v.optional(tallyValidator),
    lines: v.optional(v.array(v.string())),
  },
  returns: v.union(v.null(), v.object({ websites: v.number(), tally: tallyValidator, lines: v.array(v.string()) })),
  handler: async (ctx, args): Promise<{ websites: number; tally: Tally; lines: string[] } | null> => {
    const started = Date.now();
    let cursor = args.cursor ?? null;
    let listed = args.listed ?? false;
    const queue = [...(args.queue ?? [])];
    let site: Site | null = args.site ?? null;
    let tally: Tally = args.tally ?? {};
    const lines = [...(args.lines ?? [])];
    for (;;) {
      if (Date.now() - started > CLEAN_RUN_MS) {
        await ctx.scheduler.runAfter(0, internal.seoCleanOut.cleanOutCompetitors, { go: args.go, cursor, queue, listed, ...(site ? { site } : {}), tally, lines });
        return null;
      }
      if (!site) {
        if (queue.length === 0) {
          if (listed) break;
          const page: { websites: Array<{ websiteId: Id<"websites">; host: string }>; continueCursor: string; isDone: boolean } =
            await ctx.runQuery(internal.seoCleanOut.competitorWebsites, { cursor });
          queue.push(...page.websites);
          cursor = page.continueCursor;
          listed = page.isDone;
          continue;
        }
        const next = queue.shift()!;
        site = { ...next, task: 0, cursor: null, mark: NO_MARK, tally: {} };
      }
      if (site.task < TASKS.length) {
        site = await advance(ctx, site, args.go);
        continue;
      }
      if (args.go) await ctx.runMutation(internal.seoCleanOut.afterCleanOut, { websiteId: site.websiteId, locations: site.mark.locations });
      if (Object.values(site.tally).some((count) => count > 0)) lines.push(`${site.host}: ${sentence(site.tally, args.go)}.`);
      tally = add(tally, { ...site.tally, websites: 1 });
      site = null;
    }
    const websites = tally.websites ?? 0;
    lines.push(`All ${websites} competitor websites: ${sentence(tally, args.go)}.`);
    for (const line of lines) console.log(`Competitor clean-out${args.go ? "" : " (count only)"}: ${line}`);
    return { websites, tally, lines };
  },
});

/** One step of a competitor's current task, and where it leaves the website. */
async function advance(ctx: ActionCtx, site: Site, go: boolean): Promise<Site> {
  const task = TASKS[site.task];
  const step: Step = await ctx.runMutation(internal.seoCleanOut.cleanStep, { websiteId: site.websiteId, task, go, cursor: site.cursor, mark: site.mark });
  const tally = { ...site.tally, [task]: (site.tally[task] ?? 0) + step.found };
  // The keyword ranks' places touched carry on to the rebuild; every other task's mark starts afresh.
  const kept = { ...NO_MARK, locations: [...new Set([...site.mark.locations, ...step.mark.locations])] };
  if (step.isDone) return { ...site, task: site.task + 1, cursor: null, mark: kept, tally };
  return { ...site, cursor: step.continueCursor === "" ? null : step.continueCursor, mark: step.mark, tally };
}
