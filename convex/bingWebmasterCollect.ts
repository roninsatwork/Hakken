import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { isTrackedHold } from "./utils/websitePairing";
import { bingCrawlValidator, bingListValidator, bingPeriodValidator } from "./bingWebmasterSchema";
import { readPeriod } from "./searchConsolePeriodReads";
import { textsFrom, wholeBook } from "./searchConsolePeriodBooks";
import { normalisePage } from "./utils/pageClassification";
import { compareText } from "./utils/sortOrder";
import { packNumbers, unpackNumbers, type StoredNumbers } from "./utils/searchConsolePacks";
import {
  GOOGLE_PERIOD_OF,
  addUpRows,
  keywordMatch,
  packBingRows,
  rowsOfBingPart,
  weeksOf,
  pageRefOf,
  type BingPeriod,
  type BingRow,
  BING_PERIODS,
  WEEKS_IN,
  WITH_BEFORE,
} from "./utils/bingWebmasterWeeks";
import { wholeBingBook } from "./bingWebmasterBook";
import { addressesOf } from "./holdPageRefs";
import { requestHoldPages } from "./holdPages";
import { calendarPeriodValidator } from "./utils/calendarPeriods";

/**
 * What Bing's collection writes, and the ready-made lists it builds
 * (docs/plans/active/bing-webmaster-plan.md §4). The runs that call these are
 * `bingWebmasterAgentRun.ts`.
 */

/** Rows deleted per call when clearing. */
const CLEAR_PER_CALL = 200;

/** Days written per call. */
export const DAYS_PER_WRITE = 200;

/** A list's weeks read at most: 13 months kept, and Bing's six months given at once. */
export const WEEKS_READ = 200;

/** One week's parts read at most: a part is 2,000 rows. */
export const PARTS_READ = 100;

/** What a website's run needs to know of its connection, read at each step. */
export type CollectTarget = {
  status: Doc<"bingConnections">["status"];
  site: string | null;
  clearing: boolean;
  owned: boolean;
  holdId: Id<"companyWebsites">;
  newestDay: string | null;
  oldestDay: string | null;
  newestWeek: string | null;
  oldestWeek: string | null;
  periodsAt: number | null;
  pagesCheckedAt: number | null;
};

export const collectTarget = internalQuery({
  args: { connectionId: v.id("bingConnections") },
  handler: async (ctx, args): Promise<CollectTarget | null> => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) return null;
    const hold = await ctx.db.get(connection.companyWebsiteId);
    return {
      status: connection.status,
      site: connection.site ?? null,
      clearing: connection.clearing === true,
      owned: hold !== null && !isTrackedHold(hold),
      holdId: connection.companyWebsiteId,
      newestDay: connection.newestDay ?? null,
      oldestDay: connection.oldestDay ?? null,
      newestWeek: connection.newestWeek ?? null,
      oldestWeek: connection.oldestWeek ?? null,
      periodsAt: connection.periodsAt ?? null,
      pagesCheckedAt: connection.pagesCheckedAt ?? null,
    };
  },
});

// ---------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------

const dayValidator = v.object({
  day: v.string(),
  clicks: v.optional(v.number()),
  impressions: v.optional(v.number()),
  crawl: v.optional(bingCrawlValidator),
});

/** The website's days as Bing gave them: a day whose figures did not move is left as it is. */
export const writeDays = internalMutation({
  args: { holdId: v.id("companyWebsites"), days: v.array(dayValidator) },
  returns: v.number(),
  handler: async (ctx, args) => {
    let written = 0;
    const now = Date.now();
    for (const day of args.days) {
      const held = await ctx.db
        .query("bingDays")
        .withIndex("by_hold_day", (q) => q.eq("companyWebsiteId", args.holdId).eq("day", day.day))
        .first();
      const next = {
        ...(day.clicks !== undefined ? { clicks: day.clicks } : {}),
        ...(day.impressions !== undefined ? { impressions: day.impressions } : {}),
        ...(day.crawl !== undefined ? { crawl: day.crawl } : {}),
      };
      if (!held) {
        await ctx.db.insert("bingDays", { companyWebsiteId: args.holdId, day: day.day, ...next, fetchedAt: now });
        written += 1;
        continue;
      }
      const same = (day.clicks === undefined || held.clicks === day.clicks)
        && (day.impressions === undefined || held.impressions === day.impressions)
        && (day.crawl === undefined || JSON.stringify(held.crawl) === JSON.stringify(day.crawl));
      if (same) continue;
      await ctx.db.patch(held._id, { ...next, fetchedAt: now });
      written += 1;
    }
    return written;
  },
});

// ---------------------------------------------------------------------------
// Weeks
// ---------------------------------------------------------------------------

/** Each week of a list held, with its fingerprint: a week Bing gives again unchanged is not written. */
export const weekHashes = internalQuery({
  args: { holdId: v.id("companyWebsites"), list: bingListValidator },
  returns: v.array(v.object({ week: v.string(), hash: v.string() })),
  handler: async (ctx, args) => {
    // A week's first part carries its fingerprint: 13 months of weeks at most.
    const rows = await ctx.db
      .query("bingWeeks")
      .withIndex("by_hold_list_part_week", (q) => q.eq("companyWebsiteId", args.holdId).eq("list", args.list).eq("part", 0))
      .take(WEEKS_READ);
    return rows.map((row) => ({ week: row.week, hash: row.hash }));
  },
});

const partValidator = v.object({ keys: v.string(), clicks: v.string(), impressions: v.string(), positionSums: v.string() });

/** One week of a list, written whole: its parts replace the ones held. */
export const writeWeek = internalMutation({
  args: { holdId: v.id("companyWebsites"), list: bingListValidator, week: v.string(), hash: v.string(), parts: v.array(partValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const held = await ctx.db
      .query("bingWeeks")
      .withIndex("by_hold_list_week_part", (q) => q.eq("companyWebsiteId", args.holdId).eq("list", args.list).eq("week", args.week))
      .take(100);
    for (const row of held) await ctx.db.delete(row._id);
    const now = Date.now();
    for (const [part, packed] of args.parts.entries()) {
      await ctx.db.insert("bingWeeks", { companyWebsiteId: args.holdId, list: args.list, week: args.week, part, hash: args.hash, ...packed, fetchedAt: now });
    }
    return null;
  },
});

/** The weeks of a list from a day on, as rows, for a period's build. */
export type StoredWeek = { week: string; keys: string; clicks: StoredNumbers; impressions: StoredNumbers; positionSums: StoredNumbers };

/** One week of a list, its parts, for a period's build. */
export const weekParts = internalQuery({
  args: { holdId: v.id("companyWebsites"), list: bingListValidator, week: v.string() },
  handler: async (ctx, args): Promise<StoredWeek[]> => {
    const rows = await ctx.db
      .query("bingWeeks")
      .withIndex("by_hold_list_week_part", (q) => q.eq("companyWebsiteId", args.holdId).eq("list", args.list).eq("week", args.week))
      .take(PARTS_READ);
    return rows.map((row) => ({ week: row.week, keys: row.keys, clicks: row.clicks, impressions: row.impressions, positionSums: row.positionSums }));
  },
});

/** Weeks more than 13 months behind the newest are dropped, as the keep rule says (`keepRules.ts`). */
export const dropOldWeeks = internalMutation({
  args: { holdId: v.id("companyWebsites"), before: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    let more = false;
    for (const list of ["query", "page"] as const) {
      const old = await ctx.db
        .query("bingWeeks")
        .withIndex("by_hold_list_week_part", (q) => q.eq("companyWebsiteId", args.holdId).eq("list", list).lt("week", args.before))
        .take(CLEAR_PER_CALL);
      for (const row of old) await ctx.db.delete(row._id);
      more ||= old.length === CLEAR_PER_CALL;
    }
    return more;
  },
});

// ---------------------------------------------------------------------------
// Ready-made periods, with Google's figures beside them (BW10)
// ---------------------------------------------------------------------------

/**
 * Google's figures for each keyword or page of Search Console's ready-made
 * period of the same length — the website's main home country, web results,
 * as Search Console's own screens open — named as the two engines are matched
 * on: a keyword lower case, a page by its path. Null when Search Console has
 * no such period.
 */
export const googleFigures = internalQuery({
  args: { holdId: v.id("companyWebsites"), list: bingListValidator, period: calendarPeriodValidator },
  handler: async (ctx, args): Promise<(Google & { from: string; to: string }) | null> => {
    const read = await readPeriod(ctx, args.holdId, "web", args.list, args.period, "NOW");
    if (!read) return null;
    const name = args.list === "query" && read.book ? textsFrom(await wholeBook(ctx, read.book, "query")) : (key: string) => key;
    const keys: string[] = [];
    const clicks: number[] = [];
    const impressions: number[] = [];
    const positionSums: number[] = [];
    for (const row of read.rows) {
      const text = name(row.key);
      if (!text) continue;
      keys.push(args.list === "query" ? keywordMatch(text) : normalisePage(text));
      clicks.push(row.clicks);
      impressions.push(row.impressions);
      positionSums.push(row.positionSum);
    }
    return { from: read.from, to: read.to, keys, clicks, impressions, positionSums };
  },
});

/** One period's parts, written under the build's time; the build's older parts go once all are in (`dropOlderPeriods`). */
export const writePeriodParts = internalMutation({
  args: {
    holdId: v.id("companyWebsites"),
    list: bingListValidator,
    period: bingPeriodValidator,
    which: v.union(v.literal("NOW"), v.literal("BEFORE")),
    from: v.string(),
    to: v.string(),
    builtAt: v.number(),
    parts: v.array(v.object({
      keys: v.string(),
      clicks: v.string(),
      impressions: v.string(),
      positionSums: v.string(),
      googleClicks: v.optional(v.string()),
      googleImpressions: v.optional(v.string()),
      googlePositionSums: v.optional(v.string()),
      nameRanks: v.optional(v.string()),
    })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const [part, packed] of args.parts.entries()) {
      await ctx.db.insert("bingPeriods", {
        companyWebsiteId: args.holdId,
        list: args.list,
        period: args.period,
        which: args.which,
        part,
        from: args.from,
        to: args.to,
        ...packed,
        builtAt: args.builtAt,
      });
    }
    return null;
  },
});

/** Every period part of an older build than this one, dropped: the screens then read the new build whole. */
export const dropOlderPeriods = internalMutation({
  args: { holdId: v.id("companyWebsites"), builtAt: v.number() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const old = await ctx.db
      .query("bingPeriods")
      .withIndex("by_hold_built", (q) => q.eq("companyWebsiteId", args.holdId).lt("builtAt", args.builtAt))
      .take(CLEAR_PER_CALL);
    for (const row of old) await ctx.db.delete(row._id);
    return old.length === CLEAR_PER_CALL;
  },
});

type Google = { keys: string[]; clicks: number[]; impressions: number[]; positionSums: number[] };

/**
 * The ready-made lists for every period, built from the weeks held and
 * written whole under one build time, then the older build dropped (§4.4).
 * Each keyword's or page's Google figures sit beside it, from Search
 * Console's period of the same length; -1 where Google has none.
 */
export async function buildPeriods(ctx: ActionCtx, holdId: Id<"companyWebsites">): Promise<number> {
  const builtAt = Date.now();
  let written = 0;
  const book = await wholeBingBook(ctx, holdId);
  const pages = await addressesOf(ctx, holdId, true);
  for (const list of ["query", "page"] as const) {
    // A week at a time, the weeks a year's period can need: 52, newest first.
    const held: { week: string; hash: string }[] = await ctx.runQuery(internal.bingWebmasterCollect.weekHashes, { holdId, list });
    const byWeek = new Map<string, BingRow[]>();
    for (const { week } of held.sort((left, right) => right.week.localeCompare(left.week)).slice(0, WEEKS_IN["365"])) {
      const parts: StoredWeek[] = await ctx.runQuery(internal.bingWebmasterCollect.weekParts, { holdId, list, week });
      byWeek.set(week, parts.flatMap(rowsOfBingPart));
    }
    const google = new Map<string, Google | null>();
    const matchOf = (key: number) => {
      if (list === "query") return keywordMatch(book[key] ?? "");
      const address = pages.addresses[key];
      return address ? normalisePage(address) : pageRefOf(key);
    };
    for (const period of BING_PERIODS as readonly BingPeriod[]) {
      for (const which of ["NOW", "BEFORE"] as const) {
        if (which === "BEFORE" && !WITH_BEFORE.has(period)) continue;
        const span = weeksOf([...byWeek.keys()], period, which);
        if (!span) continue;
        const rows = addUpRows(span.weeks.map((week) => byWeek.get(week) ?? []));
        const googlePeriod = which === "NOW" ? GOOGLE_PERIOD_OF[period] : undefined;
        let figures: Google | null = null;
        if (googlePeriod) {
          if (!google.has(googlePeriod)) {
            const read: Google | null = await ctx.runQuery(internal.bingWebmasterCollect.googleFigures, { holdId, list, period: googlePeriod });
            google.set(googlePeriod, read);
          }
          figures = google.get(googlePeriod) ?? null;
        }
        const packed = packBingRows(rows);
        const at = figures ? new Map(figures.keys.map((key, index) => [key, index])) : null;
        const rankOf = nameRanksOf(rows.map((row) => row.key), (key) => (list === "query" ? book[key] ?? "" : pages.addresses[key] ?? pageRefOf(key)));
        const withGoogle = packed.map((part) => {
          const keys = unpackNumbers(part.keys);
          const ranked = { ...part, nameRanks: packColumn(keys.map((key) => rankOf.get(key) ?? 0)) };
          if (!figures || !at) return ranked;
          const place = keys.map((key) => at.get(matchOf(key)) ?? -1);
          const column = (values: number[]) => packColumn(place.map((index) => (index < 0 ? -1 : values[index] ?? -1)));
          return { ...ranked, googleClicks: column(figures.clicks), googleImpressions: column(figures.impressions), googlePositionSums: column(figures.positionSums) };
        });
        // A few parts a call: a part is at most 2,000 rows.
        for (let start = 0; start < withGoogle.length; start += 4) {
          await ctx.runMutation(internal.bingWebmasterCollect.writePeriodParts, {
            holdId,
            list,
            period,
            which,
            from: span.from,
            to: span.to,
            builtAt,
            parts: withGoogle.slice(start, start + 4),
          });
        }
        written += withGoogle.length;
      }
    }
  }
  for (let more = true; more;) {
    more = await ctx.runMutation(internal.bingWebmasterCollect.dropOlderPeriods, { holdId, builtAt });
  }
  return written;
}

/** Each key's place in its list's A to Z order by its name, as every list sorts names (`compareText`). */
function nameRanksOf(keys: readonly number[], nameOf: (key: number) => string): Map<number, number> {
  const named = keys.map((key) => ({ key, name: nameOf(key) }));
  named.sort((left, right) => compareText(left.name, right.name) || left.key - right.key);
  return new Map(named.map((entry, rank) => [entry.key, rank]));
}

/** A column of Google's figures, -1 where Google has none: packed numbers keep the sign. */
function packColumn(values: number[]): string {
  return packNumbers(values);
}

// ---------------------------------------------------------------------------
// Money pages on Bing
// ---------------------------------------------------------------------------

/** The website's money pages, as its weekly checks chose them (`moneyPageChecks.ts`): the pages asked of Bing. */
export const moneyPages = internalQuery({
  args: { holdId: v.id("companyWebsites") },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("moneyPageChecks")
      .withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", args.holdId))
      .take(48);
    return rows.map((row) => row.page);
  },
});

/** Each money page's place in Bing's index, replacing last week's; a page no longer a money page goes. */
export const savePageChecks = internalMutation({
  args: {
    holdId: v.id("companyWebsites"),
    checks: v.array(v.object({ page: v.string(), inIndex: v.boolean(), lastRead: v.union(v.string(), v.null()), status: v.union(v.number(), v.null()) })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const held = await ctx.db.query("bingPageChecks").withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", args.holdId)).take(100);
    const asked = new Set(args.checks.map((check) => check.page));
    for (const row of held) if (!asked.has(row.page)) await ctx.db.delete(row._id);
    for (const check of args.checks) {
      const row = held.find((entry) => entry.page === check.page);
      if (row) await ctx.db.patch(row._id, { ...check, checkedAt: now });
      else await ctx.db.insert("bingPageChecks", { companyWebsiteId: args.holdId, ...check, checkedAt: now });
    }
    return null;
  },
});

// ---------------------------------------------------------------------------
// Finishing, clearing
// ---------------------------------------------------------------------------

/** A collection done: how far the figures go now, the run over, any problem gone. */
export const finishCollection = internalMutation({
  args: {
    connectionId: v.id("bingConnections"),
    site: v.string(),
    newestDay: v.union(v.string(), v.null()),
    oldestDay: v.union(v.string(), v.null()),
    newestWeek: v.union(v.string(), v.null()),
    oldestWeek: v.union(v.string(), v.null()),
    periodsBuilt: v.boolean(),
    pagesChecked: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.site !== args.site) return null;
    const now = Date.now();
    await ctx.db.patch(connection._id, {
      ...(args.newestDay ? { newestDay: args.newestDay } : {}),
      ...(args.oldestDay ? { oldestDay: args.oldestDay } : {}),
      ...(args.newestWeek ? { newestWeek: args.newestWeek } : {}),
      ...(args.oldestWeek ? { oldestWeek: args.oldestWeek } : {}),
      ...(args.periodsBuilt ? { periodsAt: now } : {}),
      ...(args.pagesChecked ? { pagesCheckedAt: now } : {}),
      lastCollectedAt: now,
      collecting: undefined,
      problem: undefined,
      problemAt: undefined,
      updatedAt: now,
    });
    // Your pages takes Bing's clicks beside Google's (§4.3).
    if (args.periodsBuilt) await requestHoldPages(ctx, connection.companyWebsiteId);
    return null;
  },
});

/** A run that stopped early leaves the connection free for the next. */
export const releaseRun = internalMutation({
  args: { connectionId: v.id("bingConnections") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (connection?.collecting) await ctx.db.patch(connection._id, { collecting: undefined });
    return null;
  },
});

/** What a keyword's or a page's own screen asked, cleared as the next collection lands. */
export const dropLive = internalMutation({
  args: { holdId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const row of await ctx.db.query("bingLive").withIndex("by_hold_ask", (q) => q.eq("companyWebsiteId", args.holdId)).take(CLEAR_PER_CALL)) {
      await ctx.db.delete(row._id);
    }
    return null;
  },
});

const FIGURE_TABLES = ["bingDays", "bingWeeks", "bingPeriods", "bingPageChecks", "bingLive", "bingKeywordBooks"] as const;

async function clearSome(ctx: MutationCtx, holdId: Id<"companyWebsites">): Promise<boolean> {
  for (const table of FIGURE_TABLES) {
    const rows: Doc<(typeof FIGURE_TABLES)[number]>[] = await (table === "bingDays"
      ? ctx.db.query("bingDays").withIndex("by_hold_day", (q) => q.eq("companyWebsiteId", holdId)).take(CLEAR_PER_CALL)
      : table === "bingWeeks"
        ? ctx.db.query("bingWeeks").withIndex("by_hold_list_week_part", (q) => q.eq("companyWebsiteId", holdId)).take(CLEAR_PER_CALL)
        : table === "bingPeriods"
          ? ctx.db.query("bingPeriods").withIndex("by_hold_list_period_which_part", (q) => q.eq("companyWebsiteId", holdId)).take(CLEAR_PER_CALL)
          : table === "bingPageChecks"
            ? ctx.db.query("bingPageChecks").withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", holdId)).take(CLEAR_PER_CALL)
            : table === "bingLive"
              ? ctx.db.query("bingLive").withIndex("by_hold_ask", (q) => q.eq("companyWebsiteId", holdId)).take(CLEAR_PER_CALL)
              : ctx.db.query("bingKeywordBooks").withIndex("by_hold_chunk", (q) => q.eq("companyWebsiteId", holdId)).take(CLEAR_PER_CALL));
    if (rows.length === 0) continue;
    for (const row of rows) await ctx.db.delete(row._id);
    return true;
  }
  return false;
}

/**
 * Another site chosen: the figures held from the last one go, in turns, and
 * then — when the connection still wants them — the new site is collected.
 */
export const clearFigures = internalMutation({
  args: { companyWebsiteId: v.id("companyWebsites"), thenCollect: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (await clearSome(ctx, args.companyWebsiteId)) {
      await ctx.scheduler.runAfter(0, internal.bingWebmasterCollect.clearFigures, args);
      return null;
    }
    const connection = await ctx.db
      .query("bingConnections")
      .withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.companyWebsiteId))
      .first();
    if (!connection) return null;
    await ctx.db.patch(connection._id, { clearing: undefined, updatedAt: Date.now() });
    if (args.thenCollect && connection.status === "CONNECTED") {
      await ctx.scheduler.runAfter(0, internal.bingWebmasterAgentRun.startFirstCollection, { connectionId: connection._id });
    }
    return null;
  },
});

/** A website the company no longer holds: everything Bing brought for it, its keys and its connection. */
export const purgeHold = internalMutation({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (await clearSome(ctx, args.companyWebsiteId)) {
      await ctx.scheduler.runAfter(0, internal.bingWebmasterCollect.purgeHold, args);
      return null;
    }
    for (const row of await ctx.db.query("bingTokens").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.companyWebsiteId)).take(10)) {
      await ctx.db.delete(row._id);
    }
    for (const row of await ctx.db.query("bingConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.companyWebsiteId)).take(10)) {
      await ctx.db.delete(row._id);
    }
    return null;
  },
});
