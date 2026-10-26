import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { countedOf } from "./googleAnalyticsRows";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { countryIdOf, perVisitOf } from "./googleAnalyticsCollect";
import { mainConsoleCountry } from "./searchConsoleCountries";
import { assertInsightsPublisher, insightsPublicationArgs } from "./insightsRunState";
import {
  HISTORY_KINDS,
  firstMonthKept,
  historyKindValidator,
  historyRowValidator,
} from "./utils/insightHistory";

/**
 * The research's history (utils/insightHistory.ts): sixteen months of Search
 * Console and Google Analytics asked of Google, which charges nothing, and
 * kept as small lines — each page and each source a month, the website a day.
 * Asked once whole, then each run the months not yet held and the newest two
 * again. Only the Insights run reads and writes it, for its own website.
 */

/**
 * Records a hold keeps at most: six kinds a record a month for seventeen
 * months at most, and the three whole-span ones — read in one bounded read,
 * never a collect.
 */
const RECORDS_MOST = 200;

const recordValidator = v.object({
  kind: historyKindValidator,
  month: v.string(),
  from: v.string(),
  to: v.string(),
  rows: v.array(historyRowValidator),
  cut: v.optional(v.boolean()),
});

/** Where a hold's history is asked: its two connections, and what it holds already. */
export const historyTarget = internalQuery({
  args: { holdId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.object({
    console: v.union(v.null(), v.object({ connectionId: v.id("searchConsoleConnections"), property: v.string(), newestDay: v.string() })),
    analytics: v.union(v.null(), v.object({
      connectionId: v.id("googleAnalyticsConnections"),
      property: v.string(),
      addresses: v.array(v.string()),
      country: v.string(),
      counted: v.array(v.string()),
      /** Of them, those Google counts once a visit: counted by their visits (conversions-back-in-time-plan.md BT1). */
      perVisit: v.array(v.string()),
      newestDay: v.string(),
    })),
  })),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    if (!hold) return null;
    const sc = await ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first();
    const ga = await ctx.db.query("googleAnalyticsConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first();
    return {
      console: sc?.status === "CONNECTED" && sc.property && sc.newestDay ? { connectionId: sc._id, property: sc.property, newestDay: sc.newestDay } : null,
      analytics: ga?.status === "CONNECTED" && ga.property && ga.newestDay
        ? {
          connectionId: ga._id,
          property: ga.property,
          addresses: ga.addresses ?? [],
          country: countryIdOf(ga.mainCountry ?? mainConsoleCountry(hold)),
          counted: countedOf(ga).map((event) => event.eventName),
          perVisit: perVisitOf(ga),
          newestDay: ga.newestDay,
        }
        : null,
    };
  },
});

/** Small metadata pages keep the history worker's initial read below the database's memory and read limits. */
export const historyMetadataPart = internalQuery({
  args: { holdId: v.id("companyWebsites"), paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(v.object({ kind: historyKindValidator, month: v.string(), from: v.string(), to: v.string() })),
    continueCursor: v.string(), isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const result = await ctx.db.query("insightHistory")
      .withIndex("by_hold_kind_month", (q) => q.eq("companyWebsiteId", args.holdId))
      .paginate(args.paginationOpts);
    return { page: result.page.map(({ kind, month, from, to }) => ({ kind, month, from, to })), continueCursor: result.continueCursor, isDone: result.isDone };
  },
});

/** History content read in small pages by Node analysis workers. */
export const historyDataPart = internalQuery({
  args: { holdId: v.id("companyWebsites"), paginationOpts: paginationOptsValidator },
  returns: v.object({ page: v.array(recordValidator), continueCursor: v.string(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const result = await ctx.db.query("insightHistory").withIndex("by_hold_kind_month", (q) => q.eq("companyWebsiteId", args.holdId)).paginate(args.paginationOpts);
    return { page: result.page.map(({ kind, month, from, to, rows, cut }) => ({ kind, month, from, to, rows, ...(cut === undefined ? {} : { cut }) })), continueCursor: result.continueCursor, isDone: result.isDone };
  },
});

/**
 * Each record written over its own (one a kind and month, the days a single
 * one), and the months now older than sixteen months removed: the table keeps
 * to its rule as each new month comes (keepRules.ts).
 */
export const saveHistory = internalMutation({
  args: { ...insightsPublicationArgs, holdId: v.id("companyWebsites"), newestDay: v.string(), records: v.array(recordValidator), mergeDays: v.optional(v.boolean()), mergeDaySource: v.optional(v.union(v.literal("SC"), v.literal("GA"))) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertInsightsPublisher(ctx, args);
    const now = Date.now();
    for (const record of args.records) {
      const held = await ctx.db
        .query("insightHistory")
        .withIndex("by_hold_kind_month", (q) => q.eq("companyWebsiteId", args.holdId).eq("kind", record.kind).eq("month", record.month))
        .first();
      let saved = record;
      if (args.mergeDays && record.kind === "DAYS" && held) {
        const days = new Map(held.rows.filter((day) => day.key >= firstMonthKept(args.newestDay)).map((day) => [day.key, day]));
        if (args.mergeDaySource) {
          const fields = args.mergeDaySource === "SC" ? ["clicks", "impressions", "positionSum"] : ["visits", "enquiries", "googleVisits"];
          for (const [key, day] of days) {
            if (key < record.from || key > record.to) continue;
            const cleared = Object.fromEntries(Object.entries(day).filter(([field]) => !fields.includes(field))) as typeof day;
            if (Object.keys(cleared).length > 1) days.set(key, cleared);
            else days.delete(key);
          }
        }
        for (const day of record.rows) days.set(day.key, { ...days.get(day.key), ...day });
        const rows = [...days.values()].sort((a, b) => a.key.localeCompare(b.key));
        saved = { ...record, rows, from: rows[0]?.key ?? record.from, to: rows.at(-1)?.key ?? record.to };
      }
      const row = { companyWebsiteId: args.holdId, ...saved, fetchedAt: now };
      if (held) await ctx.db.replace(held._id, row);
      else await ctx.db.insert("insightHistory", row);
    }
    const first = firstMonthKept(args.newestDay);
    // History records can hold thousands of rows: read only expired records by kind, never the whole history to prune it.
    for (const kind of HISTORY_KINDS) {
      const expired = await ctx.db.query("insightHistory")
        .withIndex("by_hold_kind_month", (q) => q.eq("companyWebsiteId", args.holdId).eq("kind", kind).gt("month", "").lt("month", first))
        .take(4);
      for (const record of expired) await ctx.db.delete(record._id);
    }
    return null;
  },
});

/** A hold's whole history, for the research to read. */
export const historyOf = internalQuery({
  args: { holdId: v.id("companyWebsites") },
  returns: v.array(recordValidator),
  handler: async (ctx, args) => {
    const all = await ctx.db.query("insightHistory").withIndex("by_hold_kind_month", (q) => q.eq("companyWebsiteId", args.holdId)).take(RECORDS_MOST);
    return all.map(({ kind, month, from, to, rows, cut }) => ({ kind, month, from, to, rows, ...(cut !== undefined ? { cut } : {}) }));
  },
});

/**
 * Asks Google for what the hold does not hold yet, and the newest months
 * again, and keeps it. Search Console: each page a month, and the website's
 * clicks, times shown and position a day. Analytics: each landing page and
 * each source a month, people a month, and visits — all, and from Google's own
 * search — a day. A source not connected is left out; a refusal is said, and
 * the rest kept.
 */
export const fetchHistory = internalAction({
  args: { holdId: v.id("companyWebsites") },
  returns: v.object({ records: v.number(), asks: v.number(), problems: v.array(v.string()) }),
  handler: async (ctx, args): Promise<{ records: number; asks: number; problems: string[] }> =>
    await ctx.runAction(internal.insightHistorySteps.fetchHistory, args),
});
