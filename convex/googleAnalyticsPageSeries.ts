import { PART_ROWS } from "./utils/searchConsolePacks";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, type ActionCtx, type QueryCtx } from "./_generated/server";
import { analyticsPackedRows, pageSeriesListValidator, type PageSeriesList } from "./googleAnalyticsSchema";
import { EVERY_DEVICE, channelKey, groupKeys, packList, slotKey, splitChannelKey, unpackPart, type Lead, type ListRow, type PackedPart } from "./googleAnalyticsLists";
import { addInto, blank } from "./googleAnalyticsRows";
import { askList, countryIdOf, failed, openSession, type CollectTarget, type Session, type StepResult } from "./googleAnalyticsCollect";
import { beginFillStep, fillStops, type FillArgs, type FillOutcome } from "./googleAnalyticsHistory";
import { fillReachedOf, withoutReached } from "./googleAnalyticsFillAfter";
import { numberPages } from "./googleAnalyticsPageNumbers";
import { coverageOf, withCoverage } from "./googleAnalyticsCoverage";
import { shiftDay } from "./searchConsoleDays";
import { HISTORY_REACH_DAYS, dayDevice, historyFloors, homeOf, monthOfWeek, pointsBetween, type Grain } from "./utils/analyticsHistory";
import { monthStart, weekStart } from "./utils/searchConsolePacks";

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
/**
 * Each page as a landing page by channel, every device (page-conversion-explorer-plan.md): Google's channel, and the
 * AI assistants' visits by their source beside it, so a page's chart can draw each channel over time.
 */
export type ChannelSeriesList = "landingChannel" | "landingAssistant";
export const CHANNEL_SERIES_LISTS: readonly ChannelSeriesList[] = ["landingChannel", "landingAssistant"];

/** Records written by one call, at most. */
const RECORDS_PER_WRITE = 100;
/**
 * Packed figures written by one call, at most, in characters (collection-reliability-plan.md, RR3): a page's
 * record holds every event a website counts, for each point, so a record's size grows with the website's
 * events, and 100 of a big shop's were several megabytes a call — read once and written once.
 */
const CHARACTERS_PER_WRITE = 1_000_000;
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
 * years gone; points that land on one key added up. A point keyed with more
 * beside it — a channel, by channel (`CHANNEL_SERIES_LISTS`) — keeps it.
 */
export function reshaped(rows: readonly ListRow[], newest: string): ListRow[] {
  const floors = historyFloors(newest);
  const by = new Map<string, ListRow>();
  for (const row of rows) {
    const { channel: when, source: beside } = splitChannelKey(row.key);
    const point = pointOf(when);
    let home: { grain: Grain; start: string } | null;
    if (point.grain === "day") home = homeOf(point.start, newest);
    else if (point.grain === "week") home = point.start >= floors.week ? point : monthOfWeek(point.start) >= floors.month ? { grain: "month", start: monthOfWeek(point.start) } : null;
    else home = point.start >= floors.month ? point : null;
    if (!home) continue;
    const key = beside ? channelKey(pointKey(home.grain, home.start), beside) : pointKey(home.grain, home.start);
    const into = by.get(key) ?? blank(key);
    addInto(into, row);
    by.set(key, into);
  }
  return [...by.values()];
}

/** The last day a point stands for, to say when a page was last seen. */
function lastDayOf(key: string): string {
  const point = pointOf(splitChannelKey(key).channel);
  if (point.grain === "day") return point.start;
  if (point.grain === "week") return shiftDay(point.start, 6);
  return shiftDay(`${shiftDay(point.start, 32).slice(0, 7)}-01`, -1);
}

const recordValidator = v.object({
  list: pageSeriesListValidator,
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

/**
 * Each page's points by channel from one list asked of Google, led by `lead`: rows keyed page, then the point and
 * the channel (`landingAssistant`'s, Google's channel and the assistant's source), every device only — a page's
 * records by device times its channels would be the store's biggest (page-conversion-explorer-plan.md).
 */
async function askPageChannels(ctx: ActionCtx, session: Session, target: CollectTarget, list: ChannelSeriesList, lead: Lead, range: { from: string; to: string }, country?: string) {
  const asked = await askList(session, country ? { ...target, country: countryIdOf(country) } : target, list, [lead], range);
  if (!asked.ok) return asked;
  const grain: Grain = lead === "isoYearIsoWeek" ? "week" : lead === "yearMonth" ? "month" : "day";
  const rows: ListRow[] = [];
  for (const [group, groupRows] of asked.groups) {
    const [when] = groupKeys(group);
    for (const row of groupRows) {
      const { channel: page, source: channel } = splitChannelKey(row.key);
      rows.push({ ...row, key: channelKey(page, channelKey(pointKey(grain, when), channel)) });
    }
  }
  const numbered = await numberPages(ctx, target, rows, list, true);
  const device = dayDevice(EVERY_DEVICE, country);
  const records = new Map<string, { list: PageSeriesList; page: string; device: string; rows: ListRow[] }>();
  for (const row of numbered) {
    const { channel: page, source: rest } = splitChannelKey(row.key);
    if (page === "(not set)") continue;
    const record = records.get(page) ?? { list, page, device, rows: [] };
    record.rows.push({ ...row, key: rest });
    records.set(page, record);
  }
  return { ok: true as const, records: [...records.values()] };
}

async function writeRecords(ctx: ActionCtx, target: CollectTarget, connectionId: Doc<"googleAnalyticsConnections">["_id"], newest: string, records: ReadonlyArray<{ list: PageSeriesList; page: string; device: string; rows: ListRow[] }>) {
  for (const batch of writeBatches(records.map((record) => ({ list: record.list, page: record.page, device: record.device, part: packList("series", record.rows, target.events)[0] })))) {
    await ctx.runMutation(internal.googleAnalyticsPageSeries.writePageSeries, { connectionId, property: target.property!, newest, records: batch });
  }
}

/** Records in writes of a fixed size (RR3): at most `RECORDS_PER_WRITE` records, and `CHARACTERS_PER_WRITE` of packed figures. */
export function writeBatches<Record extends { part: object }>(records: readonly Record[], most = RECORDS_PER_WRITE, characters = CHARACTERS_PER_WRITE): Record[][] {
  const batches: Record[][] = [];
  let batch: Record[] = [];
  let size = 0;
  for (const record of records) {
    const length = JSON.stringify(record.part).length;
    if (batch.length > 0 && (batch.length >= most || size + length > characters)) {
      batches.push(batch);
      batch = [];
      size = 0;
    }
    batch.push(record);
    size += length;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

/**
 * A run's days added to each page (SF5): both lists by day and device for the
 * days the run fetched, once the page store is filled.
 */
export async function collectPageDays(ctx: ActionCtx, session: Session, connectionId: Doc<"googleAnalyticsConnections">["_id"], target: CollectTarget, range: { from: string; to: string }, country?: string): Promise<StepResult> {
  let rows = 0;
  const newestDay = country ? target.countryHistory.find((one) => one.country === country)?.newestDay : target.newestDay;
  // As many days an ask as keep the answer small: a big website's a day at a time (ga-big-site-reliability-plan.md BR5).
  const pages = await ctx.runQuery(internal.googleAnalyticsPageSeries.pagesSeenOf, { companyWebsiteId: target.companyWebsiteId, ...(country ? { country } : {}) });
  const newest = range.to > (newestDay ?? "") ? range.to : newestDay!;
  for (const piece of spans(range.from, shiftDay(range.to, 1), nextDay, unitsPerAsk(pages))) {
    for (const list of SERIES_LISTS) {
      const asked = await askPages(ctx, session, target, list, "date", piece, country);
      if (!asked.ok) return failed(session, asked);
      rows += asked.records.reduce((sum, record) => sum + record.rows.length, 0);
      await writeRecords(ctx, target, connectionId, newest, asked.records);
    }
    // Each page by channel too, every device (page-conversion-explorer-plan.md): from the first night it is kept.
    for (const list of CHANNEL_SERIES_LISTS) {
      const asked = await askPageChannels(ctx, session, target, list, "date", piece, country);
      if (!asked.ok) return failed(session, asked);
      rows += asked.records.reduce((sum, record) => sum + record.rows.length, 0);
      await writeRecords(ctx, target, connectionId, newest, asked.records);
    }
  }
  await ctx.runMutation(internal.googleAnalyticsPageSeries.notePageChannelsFrom, { connectionId, property: target.property!, from: range.from, ...(country ? { country } : {}) });
  return { ok: true, rows, requests: session.requests };
}

/**
 * Rows one ask of each page over time is kept near (ga-big-site-reliability-plan.md BR5): a page's points a unit —
 * a month, a week or a day — for each device, every device added up beside them.
 */
export const PAGE_ROWS_PER_ASK = 30_000;
const DEVICES_SPLIT = 3;

/**
 * Units of time (months, weeks or days) one ask covers for a website with
 * `pages` pages viewed in 90 days, so its answer stays near
 * `PAGE_ROWS_PER_ASK`: a 95-page website a whole span at once, a
 * 15,000-page website a unit at a time. Unknown, one at a time.
 */
export function unitsPerAsk(pages: number | null): number {
  if (!pages || pages <= 0) return 1;
  return Math.max(1, Math.floor(PAGE_ROWS_PER_ASK / (pages * DEVICES_SPLIT)));
}

/** From `from` to the day before `before`, `units` units an ask, each unit's next start given by `next`. */
function spans(from: string, before: string, next: (start: string) => string, units: number): Array<{ from: string; to: string }> {
  const out: Array<{ from: string; to: string }> = [];
  for (let start = from; start < before;) {
    let end = start;
    for (let unit = 0; unit < units && end < before; unit += 1) end = next(end);
    const stop = end < before ? end : before;
    out.push({ from: start, to: shiftDay(stop, -1) });
    start = stop;
  }
  return out;
}

const nextMonth = (day: string) => monthStart(shiftDay(monthStart(day), 32));
const nextWeek = (day: string) => shiftDay(weekStart(day), 7);
const nextDay = (day: string) => shiftDay(day, 1);

/**
 * The pieces of a page fill, oldest first (BR5, BR6): the months before the
 * year's weeks, the weeks to the 90 days, the week the 90 days begin in, and
 * the 90 days — `units` months, weeks or days an ask, so no month or week is
 * split between two asks and a big website's answer stays small.
 */
export function pageFillPieces(newest: string, units: number): Array<{ lead: Lead; from: string; to: string }> {
  const floors = historyFloors(newest);
  return [
    // The month before the year's weeks begin ends where the weeks begin, so no day is asked twice.
    ...spans(floors.month, floors.week, nextMonth, units).map((span) => ({ lead: "yearMonth" as Lead, ...span })),
    ...spans(floors.week, weekStart(floors.day), nextWeek, units).map((span) => ({ lead: "isoYearIsoWeek" as Lead, ...span })),
    // The week the 90 days begin in, its days before them as that week.
    ...(weekStart(floors.day) < floors.day ? [{ lead: "isoYearIsoWeek" as Lead, from: weekStart(floors.day), to: shiftDay(floors.day, -1) }] : []),
    ...spans(floors.day, shiftDay(newest, 1), nextDay, units).map((span) => ({ lead: "date" as Lead, ...span })),
  ];
}

/**
 * Pages viewed in a quarter, as the website's own lists hold them (BR5): last quarter's or this quarter's, the more —
 * either may be the one held (a finished period is asked again after a website becomes a shop). Null before either is.
 */
export const pagesSeenOf = internalQuery({
  args: { companyWebsiteId: v.id("companyWebsites"), country: v.optional(v.string()) },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, args) => {
    const counts: number[] = [];
    for (const period of ["lastQuarter", "thisQuarter"] as const) {
      const key = slotKey("page", period, "NOW", EVERY_DEVICE, args.country ?? "");
      const slot = await ctx.db.query("googleAnalyticsPeriodSlots").withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", args.companyWebsiteId).eq("key", key)).first();
      if (!slot) continue;
      // Every part but the last is full (`packList`): only the last is read (collection-reliability-plan.md, RR3),
      // where a big website's whole list passed a query's 16 MB.
      const last = slot.parts === 0 ? null : await ctx.db
        .query("googleAnalyticsPeriods")
        .withIndex("by_hold_key_slot_part", (q) => q.eq("companyWebsiteId", args.companyWebsiteId).eq("key", key).eq("slot", slot.slot).eq("part", slot.parts - 1))
        .first();
      counts.push(slot.parts === 0 ? 0 : (slot.parts - 1) * PART_ROWS + (last?.keys.length ?? 0));
    }
    return counts.length > 0 ? Math.max(...counts) : null;
  },
});

/**
 * A page fill's arguments: the fill's own, and `channelsOnly` for a website whose pages were filled before they were
 * kept by channel (page-conversion-explorer-plan.md) — only the lists by channel, from their own place. The validator
 * is built where the step is (`googleAnalyticsSteps.ts`): built here, it would spread the fill's before that module
 * has loaded.
 */
export type PageFillArgs = FillArgs & { channelsOnly?: boolean };

/**
 * Each page's two years asked of Google once (SF5, SF9): months, weeks and
 * days, as many an ask as keep the answer small (BR5). A step of the fill
 * (`googleAnalyticsSteps.fillPageHistory`): each piece's place is noted once
 * both lists are written, so a fill stopped part-way starts after it (BR6).
 * Run by hand only when Anthony says:
 * `npx convex run googleAnalyticsSteps:fillPageHistory '{"connectionId": "…"}'`; a website filled before its pages
 * were kept by channel takes `"channelsOnly": true`, which asks only the lists by channel.
 */
export async function fillPageHistoryStep(ctx: ActionCtx, args: PageFillArgs): Promise<FillOutcome> {
  const begun = await beginFillStep(ctx, "GA_FILL_PAGES", args);
  if (!begun.go) return begun.outcome;
  const close = async (outcome: FillOutcome) => {
    await ctx.runMutation(internal.collectionSteps.closeChain, { key: begun.watched.key, ...(begun.watched.booking !== undefined ? { booking: begun.watched.booking } : {}) });
    return outcome;
  };
  const target = await ctx.runQuery(internal.googleAnalyticsCollect.collectTarget, { connectionId: args.connectionId });
  const newestDay = args.country ? target?.countryHistory.find((one) => one.country === args.country)?.newestDay : target?.newestDay;
  if (!target?.property || !newestDay) return await close({ ok: false, pieces: 0, rows: 0, requests: 0, problem: "Not connected, or no days collected yet." });
  if (args.country && !target.others.includes(args.country)) return await close({ ok: false, pieces: 0, rows: 0, requests: 0, problem: "Not one of the website's home countries." });
  const opened = await openSession(ctx, args.connectionId);
  if (!opened.ok) return await close({ ok: false, pieces: 0, rows: 0, requests: 0, problem: opened.problem });
  const country = args.country ?? "";
  const newest = newestDay;
  const floors = historyFloors(newest);
  const pages = await ctx.runQuery(internal.googleAnalyticsPageSeries.pagesSeenOf, { companyWebsiteId: target.companyWebsiteId, ...(args.country ? { country: args.country } : {}) });
  // The second try after the platform stopped a step: a unit an ask, the smallest piece (RR1).
  const pieces = pageFillPieces(newest, begun.watched.careful ? 1 : unitsPerAsk(pages));
  let rows = 0;
  const step = fillStops(
    ctx,
    begun.again,
    args.nightFrom,
    () => ({ pieces: pieces.length, rows, requests: opened.session.requests }),
    begun.watched,
  );
  // A page fill asks both lists and each by channel; a channels-only fill, the lists by channel from its own place.
  const fill = args.channelsOnly ? PAGE_CHANNELS_FILL : PAGES_FILL;
  const reached = fillReachedOf(target, country, fill);
  for (const piece of pieces) {
    if (piece.from > piece.to || (reached && piece.to <= reached)) continue;
    if (step.timeUp()) return await step.handOn();
    for (const list of args.channelsOnly ? [] : SERIES_LISTS) {
      const asked = await askPages(ctx, opened.session, target, list, piece.lead, piece, args.country);
      if (!asked.ok) return await step.stopped(failed(opened.session, asked));
      rows += asked.records.reduce((sum, record) => sum + record.rows.length, 0);
      await writeRecords(ctx, target, args.connectionId, newest, asked.records);
    }
    for (const list of CHANNEL_SERIES_LISTS) {
      const asked = await askPageChannels(ctx, opened.session, target, list, piece.lead, piece, args.country);
      if (!asked.ok) return await step.stopped(failed(opened.session, asked));
      rows += asked.records.reduce((sum, record) => sum + record.rows.length, 0);
      await writeRecords(ctx, target, args.connectionId, newest, asked.records);
    }
    await ctx.runMutation(internal.googleAnalyticsFillAfter.noteFillReached, { connectionId: args.connectionId, property: target.property, country, fill, to: piece.to });
    await step.piece(`each page${args.channelsOnly ? " by channel" : ""}, to ${piece.to}`, args);
  }
  const held = { connectionId: args.connectionId, property: target.property, from: floors.month, ...(args.country ? { country: args.country } : {}) };
  if (!args.channelsOnly) await ctx.runMutation(internal.googleAnalyticsPageSeries.notePagesHeld, held);
  await ctx.runMutation(internal.googleAnalyticsPageSeries.notePageChannelsFrom, { ...held, filled: true });
  return await step.done({ ok: true, pieces: pieces.length, rows, requests: opened.session.requests });
}

/** The page fill's name among the fills' places (BR6), and the channels-only fill's. */
export const PAGES_FILL = "pages";
export const PAGE_CHANNELS_FILL = "pageChannels";

/**
 * The first day each page is held from by channel (page-conversion-explorer-plan.md): the earliest a night's
 * collection kept, or the start of the two years once a fill has run (`filled`), when its place is no longer needed.
 */
export const notePageChannelsFrom = internalMutation({
  args: { connectionId: v.id("googleAnalyticsConnections"), property: v.string(), from: v.string(), country: v.optional(v.string()), filled: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.property !== args.property) return null;
    const held = coverageOf(connection, args.country ?? "").pageChannelsFrom;
    const from = held && held < args.from ? held : args.from;
    if (from === held && !args.filled) return null;
    const fillsReached = args.filled ? withoutReached(connection, args.country ?? "", [PAGE_CHANNELS_FILL]) : connection.fillsReached;
    await ctx.db.patch(connection._id, args.country
      ? { countryHistory: withCoverage(connection, args.country, { pageChannelsFrom: from }), fillsReached, updatedAt: Date.now() }
      : { pageChannelsFrom: from, fillsReached, updatedAt: Date.now() });
    return null;
  },
});

export const notePagesHeld = internalMutation({
  args: { connectionId: v.id("googleAnalyticsConnections"), property: v.string(), from: v.string(), country: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.property !== args.property) return null;
    // Filled: its place is no longer needed (BR6).
    const fillsReached = withoutReached(connection, args.country ?? "", [PAGES_FILL]);
    await ctx.db.patch(connection._id, args.country
      ? { countryHistory: withCoverage(connection, args.country, { pageHistoryFrom: args.from }), fillsReached, updatedAt: Date.now() }
      : { pageHistoryFrom: args.from, fillsReached, updatedAt: Date.now() });
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
