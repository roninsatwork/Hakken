import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import {
  listAnswerFacts,
  parseAnchors,
  parseBacklinkList,
  parseLinkHistory,
  parseNewLostSeries,
  parseRankingHistory,
  parseReferringDomains,
  parseReferringIps,
} from "./dataForSeoLinkParsers";
import { BACKLINK_LIST_OPERATION_ID } from "./dataForSeoLinkOperations";
import { expandSeoResult } from "./dataForSeoSlim";
import { joinedSegments, LIST_PAGE, sentLimit, sentOffset } from "./sitePagedLists";
import { placesWatching } from "./siteRankings";
import { getErrorMessage } from "./utils/lang";
import { DEFAULT_LOCATION_CODE } from "./utils/seoLocations";
import { bandCountsValidator } from "./utils/siteShapes";

/**
 * Filing the Sites link calls (`dataForSeoLinkOperations.ts`, Phase 4).
 *
 * **Lists replace.** Each new link list — backlinks, linking websites,
 * anchors, servers — is the website's list now: its rows are written under
 * the pull that bought them, and rows from older pulls are removed after, a
 * page at a time. A re-parse of an old pull changes nothing, because only the
 * newest bought list of each kind may stand.
 *
 * **Every link comes in pages.** The list of every link (`backlinks_all`) is
 * bought a thousand links a request (`sitePagedLists.ts`), so it is one list
 * by its day rather than by one pull: each page files under the list's day,
 * lists from earlier days are removed, and a page from an older list than
 * the one standing is not filed at all.
 *
 * **Histories fill in.** Links gained and lost are kept a row per week,
 * replaced by any later answer about the same week. The two history calls
 * (`backlinks_history`, `ranking_history`) are no longer collected — the owner
 * withdrew backfilling on 2026-09-23 (`dataForSeoLinkOperations.ts`) — but the
 * few bought in testing are still read here: they fill the day summaries the
 * charts read, and only where our own collection has no figure for that day.
 */

const LINK_OPERATIONS = new Set([
  "backlinks_list", BACKLINK_LIST_OPERATION_ID, "backlinks_broken", "referring_domains_list", "anchors_list",
  "referring_ips_list", "backlinks_new_lost", "backlinks_history", "ranking_history",
]);

/** Whether an operation is filed here rather than by the generic parse. */
export function isSiteLinkOperation(operationId: string): boolean {
  return LINK_OPERATIONS.has(operationId);
}

/** Rows written per mutation. */
const ROWS_PER_WRITE = 200;

/** Rows looked at per mutation when clearing an older list. */
const CLEAR_PAGE = 400;

/** Day summaries filled per mutation. */
const DAYS_PER_WRITE = 60;

const linkStatus = v.union(v.literal("LIVE"), v.literal("NEW"), v.literal("LOST"));
const linkPass = v.union(v.literal("ONE_PER_DOMAIN"), v.literal("BROKEN"), v.literal("ALL"));
const linkTable = v.union(
  v.literal("siteBacklinks"), v.literal("siteReferringDomains"), v.literal("siteAnchors"), v.literal("siteReferringIps"),
);
const maybeNumber = v.optional(v.number());
const maybeString = v.optional(v.string());

type LinkTable = "siteBacklinks" | "siteReferringDomains" | "siteAnchors" | "siteReferringIps";

/** The Monday of the week a day falls in, as `bucketOf` counts weeks. */
function mondayOf(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let start = 0; start < items.length; start += size) out.push(items.slice(start, start + size));
  return out;
}

type PullForFiling = {
  operationId: string;
  websiteId: Id<"websites"> | null;
  resultJson: string | null;
  taskArgsJson: string | null;
  completedAt: number | null;
  /** The day its results belong to: its run's (`runDayOf`). */
  runDay: string;
};

/** File one pull of a Sites link call. Failures are recorded on the pull, as every parse does. */
export async function fileSiteLinkPull(ctx: ActionCtx, pullId: Id<"seoDataPulls">, pull: PullForFiling): Promise<null> {
  if (!pull.resultJson || !pull.websiteId) return null;
  const websiteId = pull.websiteId;
  const day = pull.runDay;
  try {
    const result = expandSeoResult(JSON.parse(pull.resultJson) as unknown);
    const newest: boolean = await ctx.runQuery(internal.siteLinkFiling.isNewestPull, {
      pullId, websiteId, operationId: pull.operationId,
    });

    const paged = PAGED_LINK_LISTS[pull.operationId];
    if (paged) {
      await fileLinkListPage(ctx, pullId, pull, websiteId, paged, result);
      await ctx.runMutation(internal.siteLinkFiling.clearPullError, { pullId });
      return null;
    }

    switch (pull.operationId) {
      case "backlinks_new_lost": {
        // Each answer carries the whole series, so only the newest is filed:
        // an older pull parsed again would put back thinner counts.
        if (!newest) break;
        // A week arrives dated by its last day, which for this week is still
        // ahead. Filed under its Monday, every answer about a week lands on
        // the same row — a later, fuller count replaces an earlier one.
        const weeks = parseNewLostSeries(result).map((row) => ({ ...row, day: mondayOf(row.day) }));
        for (const rows of chunks(weeks, DAYS_PER_WRITE)) {
          await ctx.runMutation(internal.siteLinkFiling.writeLinkDays, { websiteId, rows });
        }
        break;
      }
      case "backlinks_history": {
        // A month arrives dated by its last day; this month's, still ahead,
        // is the figure as of the day it was bought.
        const months = parseLinkHistory(result).map((row) => ({ ...row, day: row.day > day ? day : row.day }));
        for (const rows of chunks(months, DAYS_PER_WRITE)) {
          await ctx.runMutation(internal.siteLinkFiling.fillDaySummaries, { websiteId, rows });
        }
        break;
      }
      case "ranking_history": {
        let sent: Record<string, unknown> = {};
        try {
          sent = JSON.parse(pull.taskArgsJson ?? "{}") as Record<string, unknown>;
        } catch {
          sent = {};
        }
        const place = typeof sent.location_code === "number" ? sent.location_code : DEFAULT_LOCATION_CODE;
        for (const rows of chunks(parseRankingHistory(result), DAYS_PER_WRITE)) {
          await ctx.runMutation(internal.siteLinkFiling.fillDaySummaries, {
            websiteId,
            locationCode: place,
            rows: rows.map((row) => ({
              day: row.day,
              ...(row.keywords !== undefined ? { rankedKeywordsTotal: row.keywords } : {}),
              ...(row.traffic !== undefined ? { estimatedTraffic: row.traffic } : {}),
              ...(row.trafficValue !== undefined ? { trafficValue: row.trafficValue } : {}),
              ...(row.bands ? { allBands: row.bands } : {}),
              ...(row.keywordsNew !== undefined ? { keywordsNew: row.keywordsNew } : {}),
              ...(row.keywordsUp !== undefined ? { keywordsUp: row.keywordsUp } : {}),
              ...(row.keywordsDown !== undefined ? { keywordsDown: row.keywordsDown } : {}),
              ...(row.keywordsLost !== undefined ? { keywordsLost: row.keywordsLost } : {}),
              ...(row.paidKeywords !== undefined ? { paidKeywords: row.paidKeywords } : {}),
              ...(row.paidTraffic !== undefined ? { paidTraffic: row.paidTraffic } : {}),
              ...(row.paidTrafficCost !== undefined ? { paidTrafficCost: row.paidTrafficCost } : {}),
            })),
          });
        }
        break;
      }
    }
    await ctx.runMutation(internal.siteLinkFiling.clearPullError, { pullId });
  } catch (error) {
    await ctx.runMutation(internal.seoCollectionParse.recordParseFailure, { pullId, error: getErrorMessage(error) });
  }
  return null;
}

/**
 * The link lists filed a list by its day, page by page (`sitePagedLists.ts`):
 * the table each is kept in, and the pass of the backlinks table it fills.
 */
const PAGED_LINK_LISTS: Record<string, { table: LinkTable; pass?: "ONE_PER_DOMAIN" | "BROKEN" | "ALL" }> = {
  backlinks_list: { table: "siteBacklinks", pass: "ONE_PER_DOMAIN" },
  backlinks_broken: { table: "siteBacklinks", pass: "BROKEN" },
  [BACKLINK_LIST_OPERATION_ID]: { table: "siteBacklinks", pass: "ALL" },
  referring_domains_list: { table: "siteReferringDomains" },
  anchors_list: { table: "siteAnchors" },
  referring_ips_list: { table: "siteReferringIps" },
};

/**
 * One page of a link list (sites-data-completeness-plan.md, B2 and B5): its
 * rows, filed under the list's day; its figures — where it started, what it
 * asked for and brought, and the list's total, which the screens show as "X
 * of Y"; and the rest of the list, asked for once the first page has said how
 * long it is. The standing list is replaced only once the new one is whole
 * and reaches at least as far — never by a first page alone, and never by a
 * shorter list bought for a company that keeps fewer. Until then the screens
 * read the new rows over the old (`newestPerKey`). A late page of an older
 * list than the one standing is not filed at all.
 */
async function fileLinkListPage(
  ctx: ActionCtx,
  pullId: Id<"seoDataPulls">,
  pull: PullForFiling,
  websiteId: Id<"websites">,
  kind: { table: LinkTable; pass?: "ONE_PER_DOMAIN" | "BROKEN" | "ALL" },
  result: unknown,
): Promise<void> {
  const listPage: { day: string } | null = await ctx.runQuery(internal.sitePagedLists.listPageOf, { pullId });
  if (!listPage) return;
  const day = listPage.day;
  const newer: boolean = await ctx.runQuery(internal.siteLinkFiling.hasNewerList, { websiteId, operationId: pull.operationId, day });
  if (newer) return;

  const facts = listAnswerFacts(result);
  await clearPull(ctx, kind.table, pullId);
  if (kind.table === "siteBacklinks") {
    for (const rows of chunks(parseBacklinkList(result).rows, ROWS_PER_WRITE)) {
      await ctx.runMutation(internal.siteLinkFiling.writeBacklinks, { websiteId, pullId, pass: kind.pass ?? "ONE_PER_DOMAIN", day, rows });
    }
  } else if (kind.table === "siteReferringDomains") {
    for (const rows of chunks(parseReferringDomains(result).rows, ROWS_PER_WRITE)) {
      await ctx.runMutation(internal.siteLinkFiling.writeReferringDomains, { websiteId, pullId, day, rows });
    }
  } else if (kind.table === "siteAnchors") {
    for (const rows of chunks(parseAnchors(result).rows, ROWS_PER_WRITE)) {
      await ctx.runMutation(internal.siteLinkFiling.writeAnchors, { websiteId, pullId, day, rows });
    }
  } else {
    for (const rows of chunks(parseReferringIps(result).rows, ROWS_PER_WRITE)) {
      await ctx.runMutation(internal.siteLinkFiling.writeReferringIps, { websiteId, pullId, day, rows });
    }
  }

  const offset = sentOffset(pull.taskArgsJson);
  const replaces: boolean = await ctx.runMutation(internal.siteLinkFiling.recordLinkListPage, {
    pullId,
    websiteId,
    operationId: pull.operationId,
    day,
    listOffset: offset,
    listLimit: sentLimit(pull.taskArgsJson) ?? LIST_PAGE,
    listItems: facts.items,
    ...(facts.total !== undefined ? { listTotal: facts.total } : {}),
  });
  if (replaces) {
    await clearRowsBefore(ctx, kind, websiteId, day);
    if (kind.table === "siteReferringIps") await countNetworks(ctx, websiteId, pullId, day);
  }
  // All backlinks counts every link from its compact copy: rebuilt once this burst of pages is in.
  if (kind.pass === "ALL") await ctx.runMutation(internal.siteListCopies.requestCopies, { requests: [{ kind: "links", key: `${websiteId}` }] });
  if (offset === 0 && facts.total !== undefined) {
    await ctx.runMutation(internal.sitePagedLists.queueListPages, { pullId, total: facts.total });
  }
}

/** A link list's rows from lists older than this day, removed a page at a time. */
async function clearRowsBefore(
  ctx: ActionCtx,
  kind: { table: LinkTable; pass?: "ONE_PER_DOMAIN" | "BROKEN" | "ALL" },
  websiteId: Id<"websites">,
  day: string,
): Promise<void> {
  let cursor: string | null = null;
  for (;;) {
    const page: { cursor: string; isDone: boolean } = await ctx.runMutation(internal.siteLinkFiling.removeRowsBefore, {
      table: kind.table, websiteId, day, cursor, ...(kind.pass ? { pass: kind.pass } : {}),
    });
    if (page.isDone) return;
    cursor = page.cursor;
  }
}

/** The networks of a whole list of servers, counted once so the page reads a few rows. */
async function countNetworks(ctx: ActionCtx, websiteId: Id<"websites">, pullId: Id<"seoDataPulls">, day: string): Promise<void> {
  const subnets = new Map<string, { subnet: string; ips: number; backlinks: number; referringDomains: number }>();
  let cursor: string | null = null;
  for (;;) {
    const page: { rows: Array<{ subnet: string; backlinks: number; referringDomains: number }>; cursor: string; isDone: boolean } =
      await ctx.runQuery(internal.siteLinkFiling.serversOfDay, { websiteId, day, cursor });
    for (const row of page.rows) {
      const held = subnets.get(row.subnet) ?? { subnet: row.subnet, ips: 0, backlinks: 0, referringDomains: 0 };
      held.ips += 1;
      held.backlinks += row.backlinks;
      held.referringDomains += row.referringDomains;
      subnets.set(row.subnet, held);
    }
    if (page.isDone) break;
    cursor = page.cursor;
  }
  await ctx.runMutation(internal.siteLinkFiling.writeSubnets, { websiteId, pullId, rows: [...subnets.values()] });
}

/** Remove whatever an earlier parse of this pull wrote, so a re-parse replaces rather than adds. */
async function clearPull(ctx: ActionCtx, table: LinkTable, pullId: Id<"seoDataPulls">): Promise<void> {
  for (;;) {
    const removed: number = await ctx.runMutation(internal.siteLinkFiling.removePullRows, { table, pullId });
    if (removed < CLEAR_PAGE) return;
  }
}

/**
 * Whether a list of this kind newer than this day already stands: a late page
 * of an older list filed over it would bring back rows since gone. Every link
 * was dated by its list before its pages recorded their figures, so its rows
 * say it too.
 */
export const hasNewerList = internalQuery({
  args: { websiteId: v.id("websites"), operationId: v.string(), day: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const newerPage = await ctx.db
      .query("seoWebsiteMetrics")
      .withIndex("by_website_operation_day", (q) => q.eq("websiteId", args.websiteId).eq("operationId", args.operationId).gt("day", args.day))
      .first();
    if (newerPage) return true;
    if (args.operationId !== BACKLINK_LIST_OPERATION_ID) return false;
    const newerLinks = await ctx.db
      .query("siteBacklinks")
      .withIndex("by_site_pass_day", (q) => q.eq("websiteId", args.websiteId).eq("pass", "ALL").gt("day", args.day))
      .first();
    return newerLinks !== null;
  },
});

/** A link list's pages read to judge it: at most ten a list, over a few weeks. */
const LINK_PAGES_READ = 200;

/** A standing list older than this is replaced by any whole list, however long. */
const STANDING_LIST_DAYS = 28;

/**
 * One link list page's figures, replacing an earlier parse's, as its metrics
 * row: where it started, what it asked for and brought, and the list's total.
 * Then whether the list it belongs to now replaces the standing one — whole,
 * as far as its run meant to buy or to its end, and reaching at least as far
 * as the list standing, unless that one is weeks old.
 */
export const recordLinkListPage = internalMutation({
  args: {
    pullId: v.id("seoDataPulls"),
    websiteId: v.id("websites"),
    operationId: v.string(),
    day: v.string(),
    listOffset: v.number(),
    listLimit: v.number(),
    listItems: v.number(),
    listTotal: v.optional(v.number()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    for (const row of await ctx.db.query("seoWebsiteMetrics").withIndex("by_pull", (q) => q.eq("pullId", args.pullId)).take(10)) {
      await ctx.db.delete(row._id);
    }
    await ctx.db.insert("seoWebsiteMetrics", {
      websiteId: args.websiteId,
      day: args.day,
      operationId: args.operationId,
      pullId: args.pullId,
      metricsJson: JSON.stringify({
        listOffset: args.listOffset,
        listLimit: args.listLimit,
        listItems: args.listItems,
        ...(args.listTotal !== undefined ? { listTotal: args.listTotal } : {}),
      }),
      createdAt: Date.now(),
    });

    const byDay = new Map<string, Array<{ offset: number; limit: number; rows: number; searches: number; total: number | null }>>();
    for (const row of await ctx.db
      .query("seoWebsiteMetrics")
      .withIndex("by_website_operation_day", (q) => q.eq("websiteId", args.websiteId).eq("operationId", args.operationId))
      .order("desc")
      .take(LINK_PAGES_READ)) {
      const figures = JSON.parse(row.metricsJson) as { listOffset?: number; listLimit?: number; listItems?: number; listTotal?: number };
      if (figures.listOffset === undefined || figures.listLimit === undefined || figures.listItems === undefined) continue;
      byDay.set(row.day, [...(byDay.get(row.day) ?? []), {
        offset: figures.listOffset, limit: figures.listLimit, rows: figures.listItems, searches: 0, total: figures.listTotal ?? null,
      }]);
    }
    const reachOf = (pages: Array<{ offset: number; limit: number; rows: number; searches: number }>) => {
      const end = joinedSegments(pages).at(-1);
      return end ? { rows: end.offset + end.rows, ended: end.rows < end.limit } : { rows: 0, ended: false };
    };
    const mine = reachOf(byDay.get(args.day) ?? []);
    const total = Math.max(0, ...(byDay.get(args.day) ?? []).map((page) => page.total ?? 0));
    const pull = await ctx.db.get(args.pullId);
    const wanted = pull?.listReach ?? LIST_PAGE;
    const whole = mine.ended || (total > 0 && mine.rows >= total) || mine.rows >= wanted;
    if (!whole) return false;
    const standingDay = [...byDay.keys()].filter((day) => day < args.day).sort().at(-1);
    if (!standingDay) return true;
    const standing = reachOf(byDay.get(standingDay) ?? []);
    const weeksOld = Date.parse(`${args.day}T00:00:00Z`) - Date.parse(`${standingDay}T00:00:00Z`) > STANDING_LIST_DAYS * 86_400_000;
    return mine.rows >= standing.rows || weeksOld;
  },
});

/** A link list's rows from lists before this day: a page of them looked at, those older removed. */
export const removeRowsBefore = internalMutation({
  args: {
    table: linkTable,
    websiteId: v.id("websites"),
    day: v.string(),
    pass: v.optional(linkPass),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.object({ cursor: v.string(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const page = { cursor: args.cursor, numItems: CLEAR_PAGE };
    const result = args.table === "siteBacklinks"
      ? await ctx.db.query("siteBacklinks")
        .withIndex("by_site_pass_day", (q) => q.eq("websiteId", args.websiteId).eq("pass", args.pass ?? "ONE_PER_DOMAIN").lt("day", args.day))
        .paginate(page)
      : args.table === "siteReferringDomains"
        ? await ctx.db.query("siteReferringDomains").withIndex("by_site_rank", (q) => q.eq("websiteId", args.websiteId)).paginate(page)
        : args.table === "siteAnchors"
          ? await ctx.db.query("siteAnchors").withIndex("by_site_backlinks", (q) => q.eq("websiteId", args.websiteId)).paginate(page)
          : await ctx.db.query("siteReferringIps").withIndex("by_site_backlinks", (q) => q.eq("websiteId", args.websiteId)).paginate(page);
    for (const row of result.page) if (row.day < args.day) await ctx.db.delete(row._id);
    return { cursor: result.continueCursor, isDone: result.isDone };
  },
});

/** A page of a site's servers from one day's list, for counting its networks. */
export const serversOfDay = internalQuery({
  args: { websiteId: v.id("websites"), day: v.string(), cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    rows: v.array(v.object({ subnet: v.string(), backlinks: v.number(), referringDomains: v.number() })),
    cursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("siteReferringIps")
      .withIndex("by_site_backlinks", (q) => q.eq("websiteId", args.websiteId))
      .paginate({ cursor: args.cursor, numItems: CLEAR_PAGE });
    return {
      rows: result.page.filter((row) => row.day === args.day).map((row) => ({ subnet: row.subnet, backlinks: row.backlinks, referringDomains: row.referringDomains })),
      cursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

/**
 * Whether this is the newest bought answer of its kind for the website. A
 * list filed from an older one would put last month's links back.
 */
export const isNewestPull = internalQuery({
  args: { pullId: v.id("seoDataPulls"), websiteId: v.id("websites"), operationId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const newest = await ctx.db
      .query("seoDataPulls")
      .withIndex("by_website_operation_submitted", (q) => q.eq("websiteId", args.websiteId).eq("operationId", args.operationId))
      .order("desc")
      .filter((q) => q.eq(q.field("status"), "READY"))
      .first();
    return newest === null || newest._id === args.pullId;
  },
});

export const clearPullError = internalMutation({
  args: { pullId: v.id("seoDataPulls") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.pullId, { error: undefined });
    return null;
  },
});

export const removePullRows = internalMutation({
  args: { table: linkTable, pullId: v.id("seoDataPulls") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query(args.table).withIndex("by_pull", (q) => q.eq("pullId", args.pullId)).take(CLEAR_PAGE);
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length;
  },
});

export const writeBacklinks = internalMutation({
  args: {
    websiteId: v.id("websites"),
    pullId: v.id("seoDataPulls"),
    pass: linkPass,
    day: v.string(),
    rows: v.array(v.object({
      domainFrom: v.string(),
      urlFrom: v.string(),
      urlTo: v.string(),
      pageTo: v.string(),
      anchor: maybeString,
      dofollow: v.boolean(),
      status: linkStatus,
      isBroken: v.boolean(),
      itemType: maybeString,
      domainRank: v.number(),
      pageRank: maybeNumber,
      firstSeen: maybeString,
      lastSeen: maybeString,
      statusCode: maybeNumber,
      country: maybeString,
      attributes: v.optional(v.array(v.string())),
      location: maybeString,
      platformTypes: v.optional(v.array(v.string())),
      spamScore: maybeNumber,
      linkRank: maybeNumber,
      linksOnPage: maybeNumber,
      indirect: v.optional(v.boolean()),
      language: maybeString,
      previousSeen: maybeString,
    })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      await ctx.db.insert("siteBacklinks", {
        websiteId: args.websiteId,
        pass: args.pass,
        pullId: args.pullId,
        day: args.day,
        ...row,
        searchText: [row.domainFrom, row.urlFrom, row.anchor ?? "", row.pageTo].join(" ").slice(0, 1_000),
      });
    }
    return null;
  },
});

const groupFields = {
  rank: v.number(),
  backlinks: v.number(),
  firstSeen: maybeString,
  lostDate: maybeString,
  status: linkStatus,
  spamScore: maybeNumber,
};

export const writeReferringDomains = internalMutation({
  args: {
    websiteId: v.id("websites"),
    pullId: v.id("seoDataPulls"),
    day: v.string(),
    rows: v.array(v.object({
      domain: v.string(),
      ...groupFields,
      brokenBacklinks: maybeNumber,
      referringPages: maybeNumber,
      nofollowPages: maybeNumber,
    })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      await ctx.db.insert("siteReferringDomains", { websiteId: args.websiteId, pullId: args.pullId, day: args.day, ...row });
    }
    return null;
  },
});

export const writeAnchors = internalMutation({
  args: {
    websiteId: v.id("websites"),
    pullId: v.id("seoDataPulls"),
    day: v.string(),
    rows: v.array(v.object({ anchor: v.string(), ...groupFields, referringDomains: v.number() })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      await ctx.db.insert("siteAnchors", { websiteId: args.websiteId, pullId: args.pullId, day: args.day, ...row });
    }
    return null;
  },
});

export const writeReferringIps = internalMutation({
  args: {
    websiteId: v.id("websites"),
    pullId: v.id("seoDataPulls"),
    day: v.string(),
    rows: v.array(v.object({ ip: v.string(), subnet: v.string(), ...groupFields, referringDomains: v.number() })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      await ctx.db.insert("siteReferringIps", {
        websiteId: args.websiteId, pullId: args.pullId, day: args.day, ...row, searchText: `${row.ip} ${row.subnet}`,
      });
    }
    return null;
  },
});

/** Replace the website's networks with this list's. A list is at most a thousand servers, so a few hundred networks. */
export const writeSubnets = internalMutation({
  args: {
    websiteId: v.id("websites"),
    pullId: v.id("seoDataPulls"),
    rows: v.array(v.object({ subnet: v.string(), ips: v.number(), backlinks: v.number(), referringDomains: v.number() })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const older = await ctx.db
      .query("siteReferringSubnets")
      .withIndex("by_site_domains", (q) => q.eq("websiteId", args.websiteId))
      .take(SUBNETS_KEPT + 100);
    for (const row of older) await ctx.db.delete(row._id);
    const kept = [...args.rows].sort((left, right) => right.referringDomains - left.referringDomains).slice(0, SUBNETS_KEPT);
    for (const row of kept) await ctx.db.insert("siteReferringSubnets", { websiteId: args.websiteId, pullId: args.pullId, ...row });
    return null;
  },
});

/** Networks kept per website: the thousand servers' networks, at most. */
const SUBNETS_KEPT = 1_000;

export const writeLinkDays = internalMutation({
  args: {
    websiteId: v.id("websites"),
    rows: v.array(v.object({
      day: v.string(),
      newBacklinks: v.number(),
      lostBacklinks: v.number(),
      newReferringDomains: v.number(),
      lostReferringDomains: v.number(),
      newMainDomains: v.number(),
      lostMainDomains: v.number(),
    })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const row of args.rows) {
      const existing = await ctx.db
        .query("siteLinkDays")
        .withIndex("by_site_day", (q) => q.eq("websiteId", args.websiteId).eq("day", row.day))
        .unique();
      const fields = { websiteId: args.websiteId, ...row, updatedAt: now };
      if (existing) await ctx.db.replace(existing._id, fields);
      else await ctx.db.insert("siteLinkDays", fields);
    }
    return null;
  },
});

/** The day-summary figures a history can supply. */
const historyDay = v.object({
  day: v.string(),
  backlinks: maybeNumber,
  referringDomains: maybeNumber,
  referringMainDomains: maybeNumber,
  domainRank: maybeNumber,
  rankedKeywordsTotal: maybeNumber,
  estimatedTraffic: maybeNumber,
  trafficValue: maybeNumber,
  allBands: v.optional(bandCountsValidator),
  keywordsNew: maybeNumber,
  keywordsUp: maybeNumber,
  keywordsDown: maybeNumber,
  keywordsLost: maybeNumber,
  paidKeywords: maybeNumber,
  paidTraffic: maybeNumber,
  paidTrafficCost: maybeNumber,
});

/**
 * Fill the day summaries from a history: each figure only where the day has
 * none of its own. From one place for a ranking history, which was asked
 * from one; from every place the website is watched from for a link
 * history, which is the website's alone.
 */
export const fillDaySummaries = internalMutation({
  args: { websiteId: v.id("websites"), locationCode: v.optional(v.number()), rows: v.array(historyDay) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const places = args.locationCode !== undefined ? [args.locationCode] : await placesWatching(ctx, args.websiteId);
    const now = Date.now();
    for (const place of places) {
      for (const { day, ...figures } of args.rows) {
        const existing = await ctx.db
          .query("siteDaySummaries")
          .withIndex("by_site_day", (q) => q.eq("websiteId", args.websiteId).eq("locationCode", place).eq("day", day))
          .unique();
        const missing = missingFigures(existing, figures);
        if (Object.keys(missing).length === 0) continue;
        if (existing) await ctx.db.patch(existing._id, { ...missing, updatedAt: now });
        else await ctx.db.insert("siteDaySummaries", { websiteId: args.websiteId, locationCode: place, day, ...missing, updatedAt: now });
      }
    }
    return null;
  },
});

/** The figures a day row does not have yet. */
function missingFigures(existing: Doc<"siteDaySummaries"> | null, figures: Record<string, unknown>): Record<string, unknown> {
  const missing: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(figures)) {
    if (value === undefined) continue;
    if (existing && (existing as Record<string, unknown>)[key] !== undefined) continue;
    missing[key] = value;
  }
  return missing;
}
