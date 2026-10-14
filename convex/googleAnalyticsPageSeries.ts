import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction, internalMutation, type ActionCtx, type QueryCtx } from "./_generated/server";
import { analyticsPackedRows } from "./googleAnalyticsSchema";
import { EVERY_DEVICE, channelKey, groupKeys, packList, splitChannelKey, unpackPart, type Lead, type ListRow, type PackedPart } from "./googleAnalyticsLists";
import { addInto, blank } from "./googleAnalyticsRows";
import { askList, countryIdOf, failed, numberPages, openSession, type CollectTarget, type Session, type StepResult } from "./googleAnalyticsCollect";
import { coverageOf, withCoverage } from "./googleAnalyticsCoverage";
import { shiftDay } from "./searchConsoleDays";
import { HISTORY_REACH_DAYS, dayDevice, historyFloors, homeOf, monthOfWeek, pointsBetween, type Grain } from "./utils/analyticsHistory";
import { weekStart } from "./utils/searchConsolePacks";

/**
 * Each page over time (docs/plans/active/ga-stored-figures-plan.md SF5):
 * as a landing page and as a page viewed, every device and each, a day for 90
 * days, a week to 12 months, a month to two years — one record a page, list
 * and device, so a page's own chart reads only its own. Each run adds its new
 * days once the page store is filled (`fillPageHistory`, on Anthony's go,
 * SF9), and reshapes the record as it writes; a page quiet for two years goes.
 */

type Reader = { db: QueryCtx["db"] };
export type SeriesList = "landing" | "page";
const SERIES_LISTS: readonly SeriesList[] = ["landing", "page"];

/** Records written by one call. */
const RECORDS_PER_WRITE = 100;
/** Records cleared by one call of the sweep. */
const SWEPT_PER_CALL = 200;

/** A point's key in a page's record: a day as itself, a week or a month marked. */
export function pointKey(grain: Grain, start: string): string {
  return grain === "day" ? start : `${grain === "week" ? "w" : "m"}:${start}`;
}

export function pointOf(key: string): { grain: Grain; start: string } {
  if (key.startsWith("w:")) return { grain: "week", start: key.slice(2) };
  if (key.startsWith("m:")) return { grain: "month", start: key.slice(2) };
  return { grain: "day", start: key };
}

/**
 * A page's points reshaped to the rule as of `newest`: a day past 90 into its
 * week, a week past a year into the month it starts in, anything past two
 * years gone; points that land on one key added up.
 */
export function reshaped(rows: readonly ListRow[], newest: string): ListRow[] {
  const floors = historyFloors(newest);
  const by = new Map<string, ListRow>();
  for (const row of rows) {
    const point = pointOf(row.key);
    let home: { grain: Grain; start: string } | null;
    if (point.grain === "day") home = homeOf(point.start, newest);
    else if (point.grain === "week") home = point.start >= floors.week ? point : monthOfWeek(point.start) >= floors.month ? { grain: "month", start: monthOfWeek(point.start) } : null;
    else home = point.start >= floors.month ? point : null;
    if (!home) continue;
    const key = pointKey(home.grain, home.start);
    const into = by.get(key) ?? blank(key);
    addInto(into, row);
    by.set(key, into);
  }
  return [...by.values()];
}

/** The last day a point stands for, to say when a page was last seen. */
function lastDayOf(key: string): string {
  const point = pointOf(key);
  if (point.grain === "day") return point.start;
  if (point.grain === "week") return shiftDay(point.start, 6);
  return shiftDay(`${shiftDay(point.start, 32).slice(0, 7)}-01`, -1);
}

const recordValidator = v.object({
  list: v.union(v.literal("landing"), v.literal("page")),
  page: v.string(),
  device: v.string(),
  part: v.object(analyticsPackedRows),
});

/**
 * Pages' points written: each page's record unpacked, the fresh points put in
 * place of the same keys (`replace`, the fill's weeks and months) or added
 * beside them, reshaped to the rule, and written back whole.
 */
export const writePageSeries = internalMutation({
  args: { connectionId: v.id("googleAnalyticsConnections"), property: v.string(), newest: v.string(), records: v.array(recordValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    // Disconnected, or another property chosen, while the step ran: what it fetched is not this connection's.
    if (!connection || connection.status !== "CONNECTED" || connection.property !== args.property || connection.clearing) return null;
    const holdId = connection.companyWebsiteId;
    const now = Date.now();
    for (const record of args.records) {
      const held = await ctx.db
        .query("googleAnalyticsPageSeries")
        .withIndex("by_hold_list_page_device", (q) => q.eq("companyWebsiteId", holdId).eq("list", record.list).eq("page", record.page).eq("device", record.device))
        .first();
      const fresh = unpackPart(record.part as PackedPart);
      const freshKeys = new Set(fresh.map((row) => row.key));
      const kept = held ? unpackPart(held as PackedPart).filter((row) => !freshKeys.has(row.key)) : [];
      const rows = reshaped([...kept, ...fresh], args.newest);
      const events = [...new Set([...(held?.events ?? []), ...record.part.events])];
      const [part] = packList("series", rows, events);
      const lastDay = rows.reduce((most, row) => (lastDayOf(row.key) > most ? lastDayOf(row.key) : most), "");
      if (rows.length === 0) {
        if (held) await ctx.db.delete(held._id);
      } else if (held) {
        await ctx.db.patch(held._id, { ...part, lastDay, fetchedAt: now });
      } else {
        await ctx.db.insert("googleAnalyticsPageSeries", { companyWebsiteId: holdId, list: record.list, page: record.page, device: record.device, ...part, lastDay, fetchedAt: now });
      }
    }
    return null;
  },
});

/**
 * Each page's points from one list asked of Google, led by `lead`: rows keyed
 * page then point, every device among them — for another home country (SF7)
 * asked for it alone and kept beside the main one's (`dayDevice`).
 */
async function askPages(ctx: ActionCtx, session: Session, target: CollectTarget, list: SeriesList, lead: Lead, range: { from: string; to: string }, country?: string) {
  const asked = await askList(session, country ? { ...target, country: countryIdOf(country) } : target, list, [lead, "deviceCategory"], range);
  if (!asked.ok) return asked;
  // Every page and point numbered at once, each row keyed page, then the point and the device.
  const rows: ListRow[] = [];
  for (const [group, groupRows] of asked.groups) {
    const [when, device] = groupKeys(group);
    const grain: Grain = lead === "isoYearIsoWeek" ? "week" : lead === "yearMonth" ? "month" : "day";
    for (const row of groupRows) rows.push({ ...row, key: channelKey(row.key, channelKey(pointKey(grain, when), dayDevice(device ?? EVERY_DEVICE, country))) });
  }
  const numbered = await numberPages(ctx, target, rows, list, true);
  const records = new Map<string, { list: SeriesList; page: string; device: string; rows: ListRow[] }>();
  for (const row of numbered) {
    const { channel: page, source: rest } = splitChannelKey(row.key);
    if (page === "(not set)") continue;
    const { channel: point, source: device } = splitChannelKey(rest);
    const key = `${page}|${device}`;
    const record = records.get(key) ?? { list, page, device, rows: [] };
    record.rows.push({ ...row, key: point });
    records.set(key, record);
  }
  return { ok: true as const, records: [...records.values()] };
}

async function writeRecords(ctx: ActionCtx, target: CollectTarget, connectionId: Doc<"googleAnalyticsConnections">["_id"], newest: string, records: ReadonlyArray<{ list: SeriesList; page: string; device: string; rows: ListRow[] }>) {
  for (let first = 0; first < records.length; first += RECORDS_PER_WRITE) {
    await ctx.runMutation(internal.googleAnalyticsPageSeries.writePageSeries, {
      connectionId,
      property: target.property!,
      newest,
      records: records.slice(first, first + RECORDS_PER_WRITE).map((record) => ({ list: record.list, page: record.page, device: record.device, part: packList("series", record.rows, target.events)[0] })),
    });
  }
}

/**
 * A run's days added to each page (SF5): both lists by day and device for the
 * days the run fetched, once the page store is filled.
 */
export async function collectPageDays(ctx: ActionCtx, session: Session, connectionId: Doc<"googleAnalyticsConnections">["_id"], target: CollectTarget, range: { from: string; to: string }, country?: string): Promise<StepResult> {
  let rows = 0;
  const newestDay = country ? target.countryHistory.find((one) => one.country === country)?.newestDay : target.newestDay;
  for (const list of SERIES_LISTS) {
    const asked = await askPages(ctx, session, target, list, "date", range, country);
    if (!asked.ok) return failed(session, asked);
    rows += asked.records.reduce((sum, record) => sum + record.rows.length, 0);
    await writeRecords(ctx, target, connectionId, range.to > (newestDay ?? "") ? range.to : newestDay!, asked.records);
  }
  return { ok: true, rows, requests: session.requests };
}

/**
 * Each page's two years asked of Google once (SF5, SF9): the 90 days by day,
 * then the year's weeks and the year before's months asked as weeks and
 * months, so a big website's fill stays small. Run only when Anthony says:
 * `npx convex run googleAnalyticsPageSeries:fillPageHistory '{"connectionId": "…"}'`.
 */
export const fillPageHistory = internalAction({
  args: {
    connectionId: v.id("googleAnalyticsConnections"),
    /** Another home country kept ready (SF7), by its code (`fra`): its own pages' two years. */
    country: v.optional(v.string()),
  },
  returns: v.object({ ok: v.boolean(), rows: v.number(), requests: v.number(), problem: v.optional(v.string()) }),
  handler: async (ctx, args): Promise<{ ok: boolean; rows: number; requests: number; problem?: string }> => {
    const target = await ctx.runQuery(internal.googleAnalyticsCollect.collectTarget, { connectionId: args.connectionId });
    const newestDay = args.country ? target?.countryHistory.find((one) => one.country === args.country)?.newestDay : target?.newestDay;
    if (!target?.property || !newestDay) return { ok: false, rows: 0, requests: 0, problem: "Not connected, or no days collected yet." };
    if (args.country && !target.others.includes(args.country)) return { ok: false, rows: 0, requests: 0, problem: "Not one of the website's home countries." };
    const opened = await openSession(ctx, args.connectionId);
    if (!opened.ok) return { ok: false, rows: 0, requests: 0, problem: opened.problem };
    const newest = newestDay;
    const floors = historyFloors(newest);
    // The month before the year's weeks begin ends where the weeks begin, so no day is asked twice.
    const pieces: Array<{ lead: Lead; from: string; to: string }> = [
      { lead: "yearMonth", from: floors.month, to: shiftDay(floors.week, -1) },
      { lead: "isoYearIsoWeek", from: floors.week, to: shiftDay(weekStart(floors.day), -1) },
      // The week the 90 days begin in, its days before them as that week.
      { lead: "isoYearIsoWeek", from: weekStart(floors.day), to: shiftDay(floors.day, -1) },
    ];
    for (let to = newest; to >= floors.day; to = shiftDay(to, -7)) {
      pieces.push({ lead: "date", from: shiftDay(to, -6) > floors.day ? shiftDay(to, -6) : floors.day, to });
    }
    let rows = 0;
    for (const piece of pieces) {
      if (piece.from > piece.to) continue;
      for (const list of SERIES_LISTS) {
        const asked = await askPages(ctx, opened.session, target, list, piece.lead, piece, args.country);
        if (!asked.ok) return { ok: false, rows, requests: opened.session.requests, problem: asked.reason };
        rows += asked.records.reduce((sum, record) => sum + record.rows.length, 0);
        await writeRecords(ctx, target, args.connectionId, newest, asked.records);
      }
    }
    await ctx.runMutation(internal.googleAnalyticsPageSeries.notePagesHeld, { connectionId: args.connectionId, property: target.property, from: floors.month, ...(args.country ? { country: args.country } : {}) });
    return { ok: true, rows, requests: opened.session.requests };
  },
});

export const notePagesHeld = internalMutation({
  args: { connectionId: v.id("googleAnalyticsConnections"), property: v.string(), from: v.string(), country: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.property !== args.property) return null;
    await ctx.db.patch(connection._id, args.country
      ? { countryHistory: withCoverage(connection, args.country, { pageHistoryFrom: args.from }), updatedAt: Date.now() }
      : { pageHistoryFrom: args.from, updatedAt: Date.now() });
    return null;
  },
});

/** Pages with nothing in two years, a batch at a time: their records go (the keep rule). */
export const dropOldPageSeries = internalMutation({
  args: { companyWebsiteId: v.id("companyWebsites"), newest: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const oldest = shiftDay(args.newest, -(HISTORY_REACH_DAYS - 1));
    const stale = await ctx.db
      .query("googleAnalyticsPageSeries")
      .withIndex("by_hold_last", (q) => q.eq("companyWebsiteId", args.companyWebsiteId).lt("lastDay", oldest))
      .take(SWEPT_PER_CALL);
    for (const row of stale) await ctx.db.delete(row._id);
    if (stale.length === SWEPT_PER_CALL) await ctx.scheduler.runAfter(0, internal.googleAnalyticsPageSeries.dropOldPageSeries, args);
    return null;
  },
});

/** A page's point over a chart's dates. */
export type PagePoint = { grain: Grain; start: string; end: string; row: ListRow };

/**
 * One page over `from` to `to`, a point at the finest grain held for each
 * date (SF2b) — every point the record holds within a point's days added into
 * it, however old the record — or null before the page store is filled.
 */
export async function readPageSeries(ctx: Reader, connection: Doc<"googleAnalyticsConnections">, list: SeriesList, page: string, device: string, from: string, to: string, country = ""): Promise<PagePoint[] | null> {
  const { newestDay: newest, pageHistoryFrom } = coverageOf(connection, country);
  if (!newest || !pageHistoryFrom) return null;
  const heldFrom = pageHistoryFrom > historyFloors(newest).month ? pageHistoryFrom : historyFloors(newest).month;
  if (from < heldFrom) return null;
  const record = await ctx.db
    .query("googleAnalyticsPageSeries")
    .withIndex("by_hold_list_page_device", (q) => q.eq("companyWebsiteId", connection.companyWebsiteId).eq("list", list).eq("page", page).eq("device", dayDevice(device, country)))
    .first();
  const held = record ? unpackPart(record as PackedPart) : [];
  const points = pointsBetween(from, to, newest).map((point) => ({ ...point, row: blank(point.start) }));
  for (const row of held) {
    const day = pointOf(row.key).start;
    const point = points.find((one) => day >= one.start && day <= one.end);
    if (point) addInto(point.row, row);
  }
  return points;
}
