import { v, type ObjectType } from "convex/values";
import { internal } from "./_generated/api";
import { memoryNow } from "./utils/stepMemory";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import { DAY_FACT_LISTS, analyticsPackedRows, dayFactListValidator, type DayFactList } from "./googleAnalyticsSchema";
import { EVERY_DEVICE, groupKeys, packList, unpackPart, type ListRow, type PackedPart } from "./googleAnalyticsLists";
import { addInto, blank } from "./googleAnalyticsRows";
import { DAYS_PER_STEP, SPLIT_ROWS, STEP_BUDGET_MS, askList, collectDays, countryIdOf, dayFactsOf, failed, openSession, slotKey, type StepResult } from "./googleAnalyticsCollect";
import { PART_ROWS } from "./utils/searchConsolePacks";
import { NIGHT_MS, afterTheHour } from "./googleAnalyticsBudget";
import { fillStepKey, fillReachedOf, withoutReached } from "./googleAnalyticsFillAfter";
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
const ROLL_PER_CALL = 20;
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
  for (const row of rows) mergeInto(by, row);
  return [...by.values()];
}

/** One row added into rows held by key, as `merged` adds them: a fill's piece added up as its answers arrive (RR2). */
export function mergeInto(by: Map<string, ListRow>, row: ListRow): void {
  const into = by.get(row.key) ?? blank(row.key);
  addInto(into, row);
  if (row.times !== undefined) into.times = (into.times ?? 0) + row.times;
  if (row.basket !== undefined) into.basket = (into.basket ?? 0) + row.basket;
  by.set(row.key, into);
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
 *
 * One list and device a call, `ROLL_PER_CALL` records (collection-reliability-plan.md,
 * RR3): six lists' hundred days each, every device mixed, read every week and
 * month they rolled into — a big shop's, past a call's 16 MB after missed nights.
 */
export const rollHistory = internalMutation({
  args: { companyWebsiteId: v.id("companyWebsites"), newest: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const holdId = args.companyWebsiteId;
    const floors = historyFloors(args.newest);
    const again = async () => {
      await ctx.scheduler.runAfter(0, internal.googleAnalyticsHistory.rollHistory, args);
      return null;
    };

    // A day fact's days past 90, for one device: into their weeks (or months, or gone), a day's every part together.
    for (const list of DAY_FACT_LISTS) {
      const first = await ctx.db
        .query("googleAnalyticsDays")
        .withIndex("by_hold_list_day_device", (q) => q.eq("companyWebsiteId", holdId).eq("list", list).lt("day", floors.day))
        .first();
      if (!first) continue;
      const days = await ctx.db
        .query("googleAnalyticsDays")
        .withIndex("by_hold_list_device_day", (q) => q.eq("companyWebsiteId", holdId).eq("list", list).eq("device", first.device).lt("day", floors.day))
        .take(ROLL_PER_CALL);
      const groups = new Map<string, { home: { grain: Grain; start: string } | null; parts: PackedPart[] }>();
      for (const day of days) {
        const home = homeOf(day.day, args.newest);
        const key = `${home?.grain ?? "gone"}|${home?.start ?? ""}`;
        const group = groups.get(key) ?? { home, parts: [] };
        group.parts.push(day as PackedPart);
        groups.set(key, group);
      }
      for (const group of groups.values()) {
        if (!group.home || group.home.grain === "day") continue;
        await addIntoRecord(ctx, holdId, list, first.device, group.home.grain, group.home.start, rowsOfParts(group.parts), eventsOf(group.parts));
      }
      for (const day of days) await ctx.db.delete(day._id);
      return await again();
    }

    // Weeks past a year, for one list and device: into the month each starts in.
    const firstWeek = await ctx.db
      .query("googleAnalyticsHistory")
      .withIndex("by_hold_grain_start", (q) => q.eq("companyWebsiteId", holdId).eq("grain", "week").lt("start", floors.week))
      .first();
    if (firstWeek) {
      const weeks = await ctx.db
        .query("googleAnalyticsHistory")
        .withIndex("by_hold_device_grain_start", (q) => q.eq("companyWebsiteId", holdId).eq("list", firstWeek.list).eq("device", firstWeek.device).eq("grain", "week").lt("start", floors.week))
        .take(ROLL_PER_CALL);
      const byMonth = new Map<string, PackedPart[]>();
      for (const week of weeks) byMonth.set(monthOfWeek(week.start), [...(byMonth.get(monthOfWeek(week.start)) ?? []), week as PackedPart]);
      for (const [month, parts] of byMonth) {
        if (month < floors.month) continue;
        await addIntoRecord(ctx, holdId, firstWeek.list, firstWeek.device, "month", month, rowsOfParts(parts), eventsOf(parts));
      }
      for (const week of weeks) await ctx.db.delete(week._id);
      return await again();
    }

    // Months past two years: gone.
    const months = await ctx.db
      .query("googleAnalyticsHistory")
      .withIndex("by_hold_grain_start", (q) => q.eq("companyWebsiteId", holdId).eq("grain", "month").lt("start", floors.month))
      .take(ROLL_PER_CALL);
    for (const month of months) await ctx.db.delete(month._id);
    if (months.length === ROLL_PER_CALL) return await again();
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

/** A fill's week and month records written a call: a big shop's month of products is a few parts each (RR3). */
const HISTORY_RECORDS_A_WRITE = 4;

/** A fill's arguments (ga-big-site-reliability-plan.md BR6, BR7): the lists still to fill, the home country, the night. */
export const fillArgs = {
  connectionId: v.id("googleAnalyticsConnections"),
  /** Another home country kept ready (SF7), by its code (`fra`): its own two years. */
  country: v.optional(v.string()),
  /** When the night's run began: a fill that spends the hour's budget waits for the hour while the night lasts (BR7). */
  nightFrom: v.optional(v.number()),
  /** The booking this step is (`collectionSteps.ts`, RR1): missing on a step booked before the watch, or by hand. */
  booking: v.optional(v.number()),
  /** Its watch gave up carrying it on: it stops for tonight, and the next night carries on from its place (BR6). */
  closeOnly: v.optional(v.boolean()),
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
export function fillStops(ctx: ActionCtx, again: (atMs: number) => Promise<unknown>, nightFrom: number | undefined, outcome: () => Omit<FillOutcome, "ok" | "problem" | "handedOn">, watched?: FillWatch) {
  const started = Date.now();
  let pieces = 0;
  const ended = async (result: FillOutcome): Promise<FillOutcome> => {
    if (watched) await ctx.runMutation(internal.collectionSteps.closeChain, { ...memoryNow(), key: watched.key });
    return result;
  };
  return {
    // The second try after the platform stopped a step: one piece alone in it (RR1).
    timeUp: () => Date.now() - started >= STEP_BUDGET_MS || (watched?.careful === true && pieces > 0),
    /** A piece written: the fill's place saved, so its watch starts it again past it (RR1). */
    piece: async (place: string, args: Record<string, unknown>) => {
      pieces += 1;
      if (watched) await ctx.runMutation(internal.collectionSteps.notePlace, { ...memoryNow(), key: watched.key, ...(watched.booking !== undefined ? { booking: watched.booking } : {}), args, place });
    },
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
      return await ended({ ok: false, ...outcome(), problem: result.reason });
    },
    done: ended,
  };
}

/** A fill's watch (`collectionSteps.ts`): its chain, its booking, and whether this step goes carefully. */
export type FillWatch = { key: string; booking?: number; careful: boolean };

/**
 * A fill's step begins (RR1): told whether to go on — a superseded booking
 * does not — and how; stopped three times at one place, or given up by its
 * watch, it stops for tonight and the next night carries on from its place.
 */
export async function beginFillStep(
  ctx: ActionCtx,
  chain: "GA_FILL_DAYS" | "GA_FILL_PAGES",
  args: FillArgs,
): Promise<{ go: true; watched: FillWatch; again: (atMs: number) => Promise<unknown> } | { go: false; outcome: FillOutcome }> {
  const key = fillStepKey(chain, args.connectionId, args.country ?? "");
  const begun = await ctx.runMutation(internal.collectionSteps.stepStarted, { key, ...(args.booking !== undefined ? { booking: args.booking } : {}) });
  const nothing = { pieces: 0, rows: 0, requests: 0 };
  if (!begun.go) return { go: false, outcome: { ok: false, ...nothing, problem: "Carried on by a newer step." } };
  if (args.closeOnly || begun.skip) {
    await ctx.runMutation(internal.collectionSteps.closeChain, { ...memoryNow(), key });
    return { go: false, outcome: { ok: false, ...nothing, problem: "The platform kept stopping this fill, so it stopped for tonight; the next night carries on from where it got." } };
  }
  const again = async (atMs: number) => await ctx.runMutation(internal.collectionSteps.handOn, { ...memoryNow(),
    key, chain, args, place: "the next piece", delayMs: Math.max(0, atMs), ...(args.booking !== undefined ? { from: args.booking } : {}),
  });
  return { go: true, watched: { key, ...(args.booking !== undefined ? { booking: args.booking } : {}), careful: begun.careful }, again };
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
  const begun = await beginFillStep(ctx, "GA_FILL_DAYS", args);
  if (!begun.go) return begun.outcome;
  const close = async (outcome: FillOutcome) => {
    await ctx.runMutation(internal.collectionSteps.closeChain, { ...memoryNow(), key: begun.watched.key });
    return outcome;
  };
  const found = await ctx.runQuery(internal.googleAnalyticsCollect.collectTarget, { connectionId: args.connectionId });
  const coverage = args.country ? found?.countryHistory.find((one) => one.country === args.country) : found;
  if (!found?.property || !coverage?.newestDay) return await close({ ok: false, pieces: 0, rows: 0, requests: 0, problem: "Not connected, or no days collected yet." });
  if (args.country && !found.others.includes(args.country)) return await close({ ok: false, pieces: 0, rows: 0, requests: 0, problem: "Not one of the website's home countries." });
  const target = args.country ? { ...found, country: countryIdOf(args.country) } : found;
  const opened = await openSession(ctx, args.connectionId);
  if (!opened.ok) return await close({ ok: false, pieces: 0, rows: 0, requests: 0, problem: opened.problem });
  const country = args.country ?? "";
  const newest = coverage.newestDay;
  const lists = args.lists ?? dayFactsOf(target);
  const pieces = fillPieces(newest);
  let rows = 0;
  const step = fillStops(
    ctx,
    begun.again,
    args.nightFrom,
    () => ({ pieces: pieces.length, rows, requests: opened.session.requests }),
    begun.watched,
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
      await step.piece(`${list}, the days from ${from}`, args);
    }
  }
  // Each piece oldest first, each list's place noted with its records, so a piece written is never asked again (BR6).
  // A big list — a big shop's products — asked a few days at a time, its rows added up into their weeks and months
  // as they arrive, and written a few records a call (collection-reliability-plan.md, RR2, RR3).
  const reached = new Map(lists.map((list) => [list, fillReachedOf(found, country, list)]));
  const weeks: Record<string, { parts: number }> = await ctx.runQuery(internal.googleAnalyticsCollect.slotsOf, {
    companyWebsiteId: found.companyWebsiteId,
    keys: lists.map((list) => slotKey(list, "7", "NOW", EVERY_DEVICE, country)),
  });
  const daysAnAsk = (list: DayFactList) => {
    const perDay = ((weeks[slotKey(list, "7", "NOW", EVERY_DEVICE, country)]?.parts ?? 0) * PART_ROWS) / 7;
    // Four devices beside every device's own: an ask's rows are about five a key a day.
    return perDay <= 0 ? 31 : Math.max(1, Math.min(31, Math.floor(SPLIT_ROWS / (perDay * 5))));
  };
  for (const piece of pieces) {
    for (const list of lists) {
      const at = reached.get(list);
      if (at && piece.to <= at) continue;
      if (step.timeUp()) return await step.handOn();
      // Each day's rows into its week or month, every device kept as Google adds it up.
      const byRecord = new Map<string, { device: string; grain: HistoryGrain; start: string; rows: Map<string, ListRow> }>();
      const span = begun.watched.careful ? 1 : daysAnAsk(list);
      for (let from = piece.from; from <= piece.to; from = shiftDay(from, span)) {
        const to = shiftDay(from, span - 1) < piece.to ? shiftDay(from, span - 1) : piece.to;
        const asked = await askList(opened.session, target, list, ["date", "deviceCategory"], { from, to });
        if (!asked.ok) return await step.stopped(failed(opened.session, asked));
        for (const [group, groupRows] of asked.groups) {
          const [day, device] = groupKeys(group);
          const home = homeOf(day, newest);
          if (!home || home.grain === "day") continue;
          const key = `${device}|${home.grain}|${home.start}`;
          const record = byRecord.get(key) ?? { device: dayDevice(device ?? EVERY_DEVICE, args.country), grain: home.grain, start: home.start, rows: new Map<string, ListRow>() };
          for (const row of groupRows) mergeInto(record.rows, row);
          rows += groupRows.length;
          byRecord.set(key, record);
        }
      }
      const records = [...byRecord.values()].map((record) => ({ list, device: record.device, grain: record.grain, start: record.start, parts: packList(list, [...record.rows.values()], target.events) }));
      byRecord.clear();
      for (let first = 0; first < Math.max(1, records.length); first += HISTORY_RECORDS_A_WRITE) {
        const last = first + HISTORY_RECORDS_A_WRITE >= records.length;
        await ctx.runMutation(internal.googleAnalyticsHistory.writeHistory, {
          connectionId: args.connectionId,
          property: found.property,
          records: records.slice(first, first + HISTORY_RECORDS_A_WRITE),
          fetchedAt: Date.now(),
          ...(last ? { reached: { country, fill: list, to: piece.to } } : {}),
        });
      }
      reached.set(list, piece.to);
      await step.piece(`${list}, to ${piece.to}`, args);
    }
  }
  await ctx.runMutation(internal.googleAnalyticsHistory.noteHistoryFrom, { connectionId: args.connectionId, property: found.property!, from: floors.month, lists, ...(args.country ? { country: args.country } : {}) });
  return await step.done({ ok: true, pieces: pieces.length, rows, requests: opened.session.requests });
}
