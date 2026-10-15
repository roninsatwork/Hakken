import { v, type ObjectType } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import { DAY_FACT_LISTS, analyticsPackedRows, dayFactListValidator, type DayFactList } from "./googleAnalyticsSchema";
import { EVERY_DEVICE, groupKeys, packList, unpackPart, type ListRow, type PackedPart } from "./googleAnalyticsLists";
import { addInto, blank } from "./googleAnalyticsRows";
import { DAYS_PER_STEP, STEP_BUDGET_MS, askList, collectDays, countryIdOf, dayFactsOf, failed, openSession, type StepResult } from "./googleAnalyticsCollect";
import { NIGHT_MS, afterTheHour } from "./googleAnalyticsBudget";
import { fillReachedOf, withoutReached } from "./googleAnalyticsFillAfter";
import { shiftDay } from "./searchConsoleDays";
import { coverageOf, filledLists, withCoverage } from "./googleAnalyticsCoverage";
import { dayDevice, historyFloors, homeOf, monthOfWeek, pointsBetween, type Grain } from "./utils/analyticsHistory";
import { monthStart, weekStart } from "./utils/searchConsolePacks";

/**
 * Google Analytics' channels over time (docs/plans/active/ga-stored-figures-plan.md
 * SF2, SF2b, SF9): a day for 90 days (`googleAnalyticsDays`), a week to 12
 * months and a month to two years (`googleAnalyticsHistory`), so a chart over
 * any dates reads what Hakken holds and never waits on Google.
 *
 * - **Rolling on** (`rollHistory`), after each collection: a channel day past
 *   90 goes into its week, a week past a year into the month it starts in, a
 *   month past two years goes; a total day past 90 goes.
 * - **Reading** (`readChannelPoints`): a chart's points at the finest grain
 *   held for each date, or null when the dates reach back past what is held.
 * - **The fill** (`fillChannelHistory`): the two years asked of Google once,
 *   in whole weeks and months, run only when Anthony says, website by website
 *   (SF9).
 */

type Reader = { db: QueryCtx["db"] };
type HoldId = Id<"companyWebsites">;
type HistoryGrain = Exclude<Grain, "day">;

/** Day records rolled on a call: the rest roll on the next, scheduled at once. */
const ROLL_PER_CALL = 100;
/** Parts of one week or month: 2,000 rows each, so 100,000 channel and source rows at most. */
const MOST_PARTS = 50;
/** Records read for one chart: 90 days, 53 weeks and 25 months for each span, with room for their parts. */
const POINT_RECORDS_READ = 600;

/** A record's rows: every part, unpacked. */
function rowsOfParts(parts: readonly PackedPart[]): ListRow[] {
  return parts.flatMap((part) => unpackPart(part));
}

/** Rows added up by key: a channel and its source, an event, a campaign — an event's times and a product's baskets too. */
export function merged(rows: readonly ListRow[]): ListRow[] {
  const by = new Map<string, ListRow>();
  for (const row of rows) {
    const into = by.get(row.key) ?? blank(row.key);
    addInto(into, row);
    if (row.times !== undefined) into.times = (into.times ?? 0) + row.times;
    if (row.basket !== undefined) into.basket = (into.basket ?? 0) + row.basket;
    by.set(row.key, into);
  }
  return [...by.values()];
}

/** The key events a set of parts counts, in the order first met: a part keeps each one's count. */
function eventsOf(parts: ReadonlyArray<{ events: string[] }>, more: readonly string[] = []): string[] {
  return [...new Set([...parts.flatMap((part) => part.events), ...more])];
}

async function historyParts(ctx: Reader, holdId: HoldId, list: DayFactList, device: string, grain: HistoryGrain, start: string) {
  return await ctx.db
    .query("googleAnalyticsHistory")
    .withIndex("by_hold_device_grain_start", (q) => q.eq("companyWebsiteId", holdId).eq("list", list).eq("device", device).eq("grain", grain).eq("start", start))
    .take(MOST_PARTS);
}

/** A week's or month's record written whole: its parts patched, added or taken away. */
async function writeRecord(ctx: MutationCtx, holdId: HoldId, list: DayFactList, device: string, grain: HistoryGrain, start: string, parts: readonly PackedPart[], fetchedAt: number) {
  const held = await historyParts(ctx, holdId, list, device, grain, start);
  for (const [part, packed] of parts.entries()) {
    const before = held.find((row) => row.part === part);
    if (before) await ctx.db.patch(before._id, { ...packed, fetchedAt });
    else await ctx.db.insert("googleAnalyticsHistory", { companyWebsiteId: holdId, list, device, grain, start, part, ...packed, fetchedAt });
  }
  for (const row of held) if (row.part >= parts.length) await ctx.db.delete(row._id);
}

/** Rows added into a week's or month's record. */
async function addIntoRecord(ctx: MutationCtx, holdId: HoldId, list: DayFactList, device: string, grain: HistoryGrain, start: string, rows: readonly ListRow[], events: readonly string[]) {
  const held = await historyParts(ctx, holdId, list, device, grain, start);
  const all = merged([...rowsOfParts(held), ...rows]);
  await writeRecord(ctx, holdId, list, device, grain, start, packList(list, all, eventsOf(held, events)), Date.now());
}

/**
 * The past rolled on, a batch at a time (SF2): channel days past 90 into their
 * weeks, total days past 90 gone, weeks past a year into their months, months
 * past two years gone. Schedules itself again until nothing is left to roll.
 */
export const rollHistory = internalMutation({
  args: { companyWebsiteId: v.id("companyWebsites"), newest: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const holdId = args.companyWebsiteId;
    const floors = historyFloors(args.newest);
    let more = false;

    // Each day fact's days past 90: into their weeks (or months, or gone), a day's every device and part together.
    for (const list of DAY_FACT_LISTS) {
      const days = await ctx.db
        .query("googleAnalyticsDays")
        .withIndex("by_hold_list_day_device", (q) => q.eq("companyWebsiteId", holdId).eq("list", list).lt("day", floors.day))
        .take(ROLL_PER_CALL);
      more ||= days.length === ROLL_PER_CALL;
      const groups = new Map<string, { device: string; home: { grain: Grain; start: string } | null; parts: PackedPart[] }>();
      for (const day of days) {
        const home = homeOf(day.day, args.newest);
        const key = `${day.device}|${home?.grain ?? "gone"}|${home?.start ?? ""}`;
        const group = groups.get(key) ?? { device: day.device, home, parts: [] };
        group.parts.push(day as PackedPart);
        groups.set(key, group);
      }
      for (const group of groups.values()) {
        if (!group.home || group.home.grain === "day") continue;
        await addIntoRecord(ctx, holdId, list, group.device, group.home.grain, group.home.start, rowsOfParts(group.parts), eventsOf(group.parts));
      }
      for (const day of days) await ctx.db.delete(day._id);
    }

    // Weeks past a year: into the month each starts in.
    const weeks = await ctx.db
      .query("googleAnalyticsHistory")
      .withIndex("by_hold_grain_start", (q) => q.eq("companyWebsiteId", holdId).eq("grain", "week").lt("start", floors.week))
      .take(ROLL_PER_CALL);
    more ||= weeks.length === ROLL_PER_CALL;
    const byMonth = new Map<string, { list: DayFactList; device: string; start: string; parts: PackedPart[] }>();
    for (const week of weeks) {
      const key = `${week.list}|${week.device}|${monthOfWeek(week.start)}`;
      const group = byMonth.get(key) ?? { list: week.list, device: week.device, start: monthOfWeek(week.start), parts: [] };
      group.parts.push(week as PackedPart);
      byMonth.set(key, group);
    }
    for (const group of byMonth.values()) {
      if (group.start < floors.month) continue;
      await addIntoRecord(ctx, holdId, group.list, group.device, "month", group.start, rowsOfParts(group.parts), eventsOf(group.parts));
    }
    for (const week of weeks) await ctx.db.delete(week._id);

    // Months past two years: gone.
    const months = await ctx.db
      .query("googleAnalyticsHistory")
      .withIndex("by_hold_grain_start", (q) => q.eq("companyWebsiteId", holdId).eq("grain", "month").lt("start", floors.month))
      .take(ROLL_PER_CALL);
    more ||= months.length === ROLL_PER_CALL;
    for (const month of months) await ctx.db.delete(month._id);

    if (more) await ctx.scheduler.runAfter(0, internal.googleAnalyticsHistory.rollHistory, args);
    return null;
  },
});

/** A chart's point: its dates, at the grain held for them, and its rows. */
export type ChannelPoint = { grain: Grain; start: string; end: string; rows: ListRow[] };
export type DayPoint = ChannelPoint;

/**
 * A device's channels over `from` to `to`, a point at the finest grain held
 * for each date (SF2b) — or null when the dates reach back past what is held:
 * past the 90 days before the two years are filled (SF9), or before the first
 * collection has the days.
 */
export async function readChannelPoints(ctx: Reader, connection: Doc<"googleAnalyticsConnections">, device: string, from: string, to: string, country = ""): Promise<ChannelPoint[] | null> {
  return await readDayPoints(ctx, connection, "channel", device, from, to, country);
}

/**
 * One day fact's points over `from` to `to`, a point at the finest grain held
 * for each date (SF2b, SF12) — or null when the dates reach back past what is
 * held. The totals and channels have always been kept as days; the other
 * day facts are read only once their two years are filled.
 */
export async function readDayPoints(
  ctx: Reader,
  connection: Doc<"googleAnalyticsConnections">,
  list: DayFactList,
  shownDevice: string,
  from: string,
  to: string,
  /** Another home country (SF7): its own records, beside the main one's. */
  country = "",
): Promise<DayPoint[] | null> {
  const coverage = coverageOf(connection, country);
  const newest = coverage.newestDay;
  if (!newest || !coverage.oldestDay) return null;
  const floors = historyFloors(newest);
  const filledList = filledLists(coverage).includes(list);
  if (!filledList && list !== "total" && list !== "channel") return null;
  // Days held back to the 90 (or as far as the first collection reached); weeks and months beyond only once the
  // fill has run and the days reach the 90, so no stretch between them is missing.
  const daysFrom = coverage.oldestDay > floors.day ? coverage.oldestDay : floors.day;
  const filled = filledList && daysFrom === floors.day && coverage.historyFrom !== undefined && coverage.historyFrom <= floors.day;
  const heldFrom = filled ? (coverage.historyFrom! > floors.month ? coverage.historyFrom! : floors.month) : daysFrom;
  if (from < heldFrom) return null;
  const holdId = connection.companyWebsiteId;
  const device = dayDevice(shownDevice, country);
  const points = pointsBetween(from, to, newest);
  const byKey = new Map<string, ListRow[]>();
  const add = (grain: Grain, start: string, rows: readonly ListRow[]) => byKey.set(`${grain}|${start}`, [...(byKey.get(`${grain}|${start}`) ?? []), ...rows]);
  const firstDay = points.find((point) => point.grain === "day")?.start;
  if (firstDay) {
    const days = await ctx.db
      .query("googleAnalyticsDays")
      .withIndex("by_hold_list_device_day", (q) => q.eq("companyWebsiteId", holdId).eq("list", list).eq("device", device).gte("day", firstDay).lte("day", to))
      .take(POINT_RECORDS_READ);
    for (const day of days) add("day", day.day, unpackPart(day as PackedPart));
  }
  for (const grain of ["week", "month"] as const) {
    const starts = points.filter((point) => point.grain === grain).map((point) => point.start);
    if (starts.length === 0) continue;
    const records = await ctx.db
      .query("googleAnalyticsHistory")
      .withIndex("by_hold_device_grain_start", (q) => q.eq("companyWebsiteId", holdId).eq("list", list).eq("device", device).eq("grain", grain).gte("start", starts[0]).lte("start", starts[starts.length - 1]))
      .take(POINT_RECORDS_READ);
    for (const record of records) add(grain, record.start, unpackPart(record as PackedPart));
  }
  return points.map((point) => ({ ...point, rows: byKey.get(`${point.grain}|${point.start}`) ?? [] }));
}

// ---------------------------------------------------------------------------
// The fill (SF9): the two years asked of Google once, on Anthony's go
// ---------------------------------------------------------------------------

const recordValidator = v.object({
  list: dayFactListValidator,
  device: v.string(),
  grain: v.union(v.literal("week"), v.literal("month")),
  start: v.string(),
  parts: v.array(v.object(analyticsPackedRows)),
});

/** A piece of the fill written: each week or month whole, in place of what was there. */
export const writeHistory = internalMutation({
  args: {
    connectionId: v.id("googleAnalyticsConnections"),
    property: v.string(),
    records: v.array(recordValidator),
    fetchedAt: v.number(),
    /** The fill's place once this piece is written (ga-big-site-reliability-plan.md BR6), noted with it. */
    reached: v.optional(v.object({ country: v.string(), fill: v.string(), to: v.string() })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    // Disconnected, or another property chosen, while the fill ran: what it fetched is not this connection's.
    if (!connection || connection.status !== "CONNECTED" || connection.property !== args.property || connection.clearing) return null;
    for (const record of args.records) await writeRecord(ctx, connection.companyWebsiteId, record.list, record.device, record.grain, record.start, record.parts, args.fetchedAt);
    if (args.reached) {
      const kept = withoutReached(connection, args.reached.country, [args.reached.fill]) ?? [];
      await ctx.db.patch(connection._id, { fillsReached: [...kept, args.reached], updatedAt: Date.now() });
    }
    return null;
  },
});

/** A day list's oldest day held for a device: every day has a record for every device, so the days are whole from it. */
export const oldestDayOf = internalQuery({
  args: { companyWebsiteId: v.id("companyWebsites"), list: dayFactListValidator, device: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => (await ctx.db
    .query("googleAnalyticsDays")
    .withIndex("by_hold_list_device_day", (q) => q.eq("companyWebsiteId", args.companyWebsiteId).eq("list", args.list).eq("device", args.device))
    .first())?.day ?? null,
});

/** The fill done: the lists it filled are held from its first day, for the main home country or another. */
export const noteHistoryFrom = internalMutation({
  args: { connectionId: v.id("googleAnalyticsConnections"), property: v.string(), from: v.string(), lists: v.array(dayFactListValidator), country: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.property !== args.property) return null;
    const filled = [...new Set([...filledLists(coverageOf(connection, args.country)), ...args.lists])];
    // Filled: the lists' places are no longer needed (BR6).
    const fillsReached = withoutReached(connection, args.country ?? "", args.lists);
    await ctx.db.patch(connection._id, args.country
      ? { countryHistory: withCoverage(connection, args.country, { historyFrom: args.from, historyFilled: filled }), fillsReached, updatedAt: Date.now() }
      : { historyFrom: args.from, historyFilled: filled, fillsReached, updatedAt: Date.now() });
    return null;
  },
});

/**
 * The pieces of the fill, oldest first: each month past the year's weeks
 * whole, then four weeks at a time to the 90 days kept as days — so no week
 * or month is split between two asks.
 */
export function fillPieces(newest: string): Array<{ from: string; to: string }> {
  const floors = historyFloors(newest);
  const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  const pieces: Array<{ from: string; to: string }> = [];
  for (let month = floors.month; month < floors.week; month = monthStart(shift(month, 32))) {
    const end = shift(monthStart(shift(month, 32)), -1);
    pieces.push({ from: month, to: end < floors.week ? end : shift(floors.week, -1) });
  }
  for (let week = weekStart(floors.week); week < floors.day; week = shift(week, 28)) {
    const end = shift(week, 27);
    pieces.push({ from: week, to: end < floors.day ? end : shift(floors.day, -1) });
  }
  return pieces;
}

/** A fill's arguments (ga-big-site-reliability-plan.md BR6, BR7): the lists still to fill, the home country, the night. */
export const fillArgs = {
  connectionId: v.id("googleAnalyticsConnections"),
  /** Another home country kept ready (SF7), by its code (`fra`): its own two years. */
  country: v.optional(v.string()),
  /** When the night's run began: a fill that spends the hour's budget waits for the hour while the night lasts (BR7). */
  nightFrom: v.optional(v.number()),
};
export const fillHistoryArgs = { ...fillArgs, lists: v.optional(v.array(dayFactListValidator)) };
export type FillArgs = ObjectType<typeof fillArgs>;
export type FillHistoryArgs = ObjectType<typeof fillHistoryArgs>;

/** What a fill's step did: `handedOn` when it carries on in a step of its own — now, or after the hour. */
export type FillOutcome = { ok: boolean; pieces: number; rows: number; requests: number; problem?: string; handedOn?: "STEP" | "HOUR" };
export const fillOutcomeValidator = v.object({
  ok: v.boolean(),
  pieces: v.number(),
  rows: v.number(),
  requests: v.number(),
  problem: v.optional(v.string()),
  handedOn: v.optional(v.union(v.literal("STEP"), v.literal("HOUR"))),
});

/**
 * How a fill stops part-way (BR6, BR7): its step's minutes up, it carries on
 * at once in a step of its own; the hour's budget spent inside the night, it
 * carries on after the hour; anything else, or past the night, it stops, and
 * the next night's run starts it again where it stopped.
 */
export function fillStops(ctx: ActionCtx, again: (atMs: number) => Promise<unknown>, nightFrom: number | undefined, outcome: () => Omit<FillOutcome, "ok" | "problem" | "handedOn">) {
  const started = Date.now();
  return {
    timeUp: () => Date.now() - started >= STEP_BUDGET_MS,
    handOn: async (): Promise<FillOutcome> => {
      await again(0);
      return { ok: true, ...outcome(), handedOn: "STEP" };
    },
    stopped: async (result: Extract<StepResult, { ok: false }>): Promise<FillOutcome> => {
      if (result.wait && nightFrom !== undefined) {
        const resumeAt = afterTheHour(Date.now());
        if (resumeAt - nightFrom <= NIGHT_MS) {
          await again(resumeAt - Date.now());
          return { ok: true, ...outcome(), handedOn: "HOUR" };
        }
      }
      return { ok: false, ...outcome(), problem: result.reason };
    },
  };
}

/**
 * Two years of the day facts asked of Google once (SF9, SF12): every day past
 * the 90 kept as days, by device, added into its week or month and written
 * whole; and the 90 days themselves for a list not kept as days before. A
 * step of the fill (`googleAnalyticsSteps.fillHistory`): each piece's place is
 * noted as it is written, so a fill stopped part-way starts after it (BR6).
 * Run by hand only when Anthony says, for one website:
 * `npx convex run googleAnalyticsSteps:fillHistory '{"connectionId": "…"}'`.
 */
export async function fillHistoryStep(ctx: ActionCtx, args: FillHistoryArgs): Promise<FillOutcome> {
  const found = await ctx.runQuery(internal.googleAnalyticsCollect.collectTarget, { connectionId: args.connectionId });
  const coverage = args.country ? found?.countryHistory.find((one) => one.country === args.country) : found;
  if (!found?.property || !coverage?.newestDay) return { ok: false, pieces: 0, rows: 0, requests: 0, problem: "Not connected, or no days collected yet." };
  if (args.country && !found.others.includes(args.country)) return { ok: false, pieces: 0, rows: 0, requests: 0, problem: "Not one of the website's home countries." };
  const target = args.country ? { ...found, country: countryIdOf(args.country) } : found;
  const opened = await openSession(ctx, args.connectionId);
  if (!opened.ok) return { ok: false, pieces: 0, rows: 0, requests: 0, problem: opened.problem };
  const country = args.country ?? "";
  const newest = coverage.newestDay;
  const lists = args.lists ?? dayFactsOf(target);
  const pieces = fillPieces(newest);
  let rows = 0;
  const step = fillStops(
    ctx,
    async (atMs) => await ctx.scheduler.runAfter(atMs, internal.googleAnalyticsSteps.fillHistory, args),
    args.nightFrom,
    () => ({ pieces: pieces.length, rows, requests: opened.session.requests }),
  );
  // The 90 days kept as days, each list back from its oldest day held: a website collected when 60 were kept, a list
  // never kept as days before SF12, a shop's products from before it was found to be one. Carries on from its oldest.
  const floors = historyFloors(newest);
  for (const list of lists) {
    const oldest: string | null = await ctx.runQuery(internal.googleAnalyticsHistory.oldestDayOf, { companyWebsiteId: found.companyWebsiteId, list, device: dayDevice(EVERY_DEVICE, args.country) });
    const last = oldest === null ? newest : oldest > floors.day ? shiftDay(oldest, -1) : null;
    if (!last) continue;
    for (let to = last; to >= floors.day; to = shiftDay(to, -DAYS_PER_STEP)) {
      if (step.timeUp()) return await step.handOn();
      const from = shiftDay(to, -(DAYS_PER_STEP - 1)) > floors.day ? shiftDay(to, -(DAYS_PER_STEP - 1)) : floors.day;
      const days = await collectDays(ctx, opened.session, args.connectionId, target, { from, to }, [list], args.country);
      if (!days.ok) return await step.stopped(days);
      rows += days.rows;
    }
  }
  // Each piece oldest first, each list's place noted with its records, so a piece written is never asked again (BR6).
  const reached = new Map(lists.map((list) => [list, fillReachedOf(found, country, list)]));
  for (const piece of pieces) {
    for (const list of lists) {
      const at = reached.get(list);
      if (at && piece.to <= at) continue;
      if (step.timeUp()) return await step.handOn();
      const asked = await askList(opened.session, target, list, ["date", "deviceCategory"], piece);
      if (!asked.ok) return await step.stopped(failed(opened.session, asked));
      // Each day's rows into its week or month, every device kept as Google adds it up.
      const byRecord = new Map<string, { list: DayFactList; device: string; grain: HistoryGrain; start: string; rows: ListRow[] }>();
      for (const [group, groupRows] of asked.groups) {
        const [day, device] = groupKeys(group);
        const home = homeOf(day, newest);
        if (!home || home.grain === "day") continue;
        const key = `${device}|${home.grain}|${home.start}`;
        const record = byRecord.get(key) ?? { list, device: dayDevice(device ?? EVERY_DEVICE, args.country), grain: home.grain, start: home.start, rows: [] };
        record.rows.push(...groupRows);
        rows += groupRows.length;
        byRecord.set(key, record);
      }
      await ctx.runMutation(internal.googleAnalyticsHistory.writeHistory, {
        connectionId: args.connectionId,
        property: found.property,
        records: [...byRecord.values()].map((record) => ({ list: record.list, device: record.device, grain: record.grain, start: record.start, parts: packList(record.list, merged(record.rows), target.events) })),
        fetchedAt: Date.now(),
        reached: { country, fill: list, to: piece.to },
      });
      reached.set(list, piece.to);
    }
  }
  await ctx.runMutation(internal.googleAnalyticsHistory.noteHistoryFrom, { connectionId: args.connectionId, property: found.property!, from: floors.month, lists, ...(args.country ? { country: args.country } : {}) });
  return { ok: true, pieces: pieces.length, rows, requests: opened.session.requests };
}
