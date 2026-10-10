import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { isTrackedHold } from "./utils/websitePairing";
import { DAYS_KEPT } from "./utils/searchConsolePacks";
import { shiftDay } from "./searchConsoleDays";
import { encodePagesFromAction } from "./holdPageRefs";
import { accessTokenFor } from "./googleAnalyticsConnect";
import { startFirstCollection } from "./googleAnalyticsAgentRun";
import { runReport, type ReportAsk, type Report } from "./googleAnalyticsApi";
import type { GoogleFailure } from "./googleApi";
import {
  EVENT_METRICS,
  EVERY_DEVICE,
  KEPT_BY_DEVICE,
  LIST_DIMENSIONS,
  MAIN_METRICS,
  fingerprint,
  groupKeys,
  joinAsks,
  packList,
  pageAddress,
  type ListRow,
  type PackedPart,
} from "./googleAnalyticsLists";
import {
  analyticsPackedRows,
  type AnalyticsList,
  type AnalyticsPeriod,
  type AnalyticsWhich,
} from "./googleAnalyticsSchema";

/**
 * Collecting a website's Google Analytics (docs/plans/active/google-analytics-plan.md
 * §4): what the Google Analytics: Collector Agent's run for one website does,
 * a step at a time (`googleAnalyticsAgentRun.ts`).
 *
 * - **The days** of the two small lists — the totals and the channels — by
 *   device, for the charts: a website with nothing held gets the 60 days kept
 *   (§4.3), newest week first, a week a step; after that, the newest day and
 *   the last two again while Google's figures settle (GA23).
 * - **The ready-made periods** of all four lists, asked of Google ready-made
 *   and never added up from days (GA23): the 7 and 30 days and the span
 *   before each every day; the 90 days and 12 months, the span before and the
 *   same span a year before (§10, Q2) every week, with the long charts.
 *
 * Only what changed is written (GA23): a day's record whose figures did not
 * move, and a ready-made list whose fingerprint is the same, are left as they
 * are. A ready-made list is written whole into the slot screens are not
 * reading, then the slot flips, so a screen never reads half of one build.
 */

/** The days fetched again each run while Google's figures settle (24 to 48 hours, §2.5): the newest and the two before. */
export const REFETCH_DAYS = 3;

/** Days asked a step: a week. */
export const DAYS_PER_STEP = 7;

/** How long a step works before it hands on: an action stops at ten minutes. */
export const STEP_BUDGET_MS = 4 * 60 * 1000;

/** Waits before asking a busy Google again. */
const BUSY_WAITS_MS = [2_000, 8_000];

/** The weekly periods are asked again once this old. */
const WEEK_MS = 6.5 * 24 * 60 * 60 * 1000;

/** Ready-made parts written a call: each up to 2,000 rows. */
const PARTS_PER_WRITE = 4;

/** Parts of a ready-made list removed a call. */
const PARTS_PER_DELETE = 64;

/** Live lists removed a call. */
const LIVE_PER_DELETE = 200;

/** The newest whole day in the property's own time zone (§2.5): yesterday there. */
export function newestWholeDayIn(now: number, timeZone: string): string {
  let today: string;
  try {
    today = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
  } catch {
    today = new Date(now).toISOString().slice(0, 10);
  }
  return shiftDay(today, -1);
}

/**
 * The days a run fetches: every day after the newest held, up to the newest
 * whole day, and the two before the first of them again while they settle —
 * so a day a run missed is caught by the next. With none held yet (or a first
 * collection that stopped part-way), the 60 days kept.
 */
export function analyticsWindow(newestDay: string | undefined, oldestDay: string | undefined, top: string): { from: string; top: string } {
  const oldest = shiftDay(top, -(DAYS_KEPT - 1));
  if (!newestDay || (oldestDay !== undefined && oldestDay > oldest)) return { from: oldest, top };
  const firstNew = shiftDay(newestDay, 1) < top ? shiftDay(newestDay, 1) : top;
  const from = shiftDay(firstNew, -(REFETCH_DAYS - 1));
  return { from: from > oldest ? from : oldest, top };
}

/** A ready-made list's dates: the period ending on the newest day, the span before it, or the same span a year (52 weeks) before. */
export function periodRange(period: AnalyticsPeriod, which: AnalyticsWhich, top: string): { from: string; to: string } {
  const days = Number(period);
  const to = which === "NOW" ? top : which === "BEFORE" ? shiftDay(top, -days) : shiftDay(top, -364);
  return { from: shiftDay(to, -(days - 1)), to };
}

/** A ready-made list's name: the list, the period, which span, and the device (empty for every device). */
export function slotKey(list: AnalyticsList, period: AnalyticsPeriod, which: AnalyticsWhich, device: string): string {
  return `${list}|${period}|${which}|${device}`;
}

export type PeriodJob = { list: AnalyticsList; period: AnalyticsPeriod; which: AnalyticsWhich };

const PAGE_LISTS: readonly AnalyticsList[] = ["total", "channel", "landing", "page"];

/**
 * The ready-made lists a run asks for: the 7 and 30 days every run, and the
 * 90 days and 12 months once a week (§4.1) — with their long charts. The
 * same span a year before is asked for the long periods (§10, Q2); for the
 * short ones it waits for the "Compare with" choice to be drawn (§4.1).
 */
export function dueJobs(connection: Pick<Doc<"googleAnalyticsConnections">, "weeklyPeriodsAt">, now: number): PeriodJob[] {
  const jobs: PeriodJob[] = [];
  for (const period of ["7", "30"] as const) {
    for (const which of ["NOW", "BEFORE"] as const) for (const list of PAGE_LISTS) jobs.push({ list, period, which });
  }
  if (connection.weeklyPeriodsAt === undefined || now - connection.weeklyPeriodsAt >= WEEK_MS) {
    for (const period of ["90", "365"] as const) {
      for (const which of ["NOW", "BEFORE", "YEAR"] as const) for (const list of PAGE_LISTS) jobs.push({ list, period, which });
      jobs.push({ list: "series", period, which: "NOW" });
    }
  }
  return jobs;
}

// ---------------------------------------------------------------------------
// What a step needs
// ---------------------------------------------------------------------------

/** What collecting a website needs: its property, addresses, key events and where its figures stand. */
export type CollectTarget = {
  status: Doc<"googleAnalyticsConnections">["status"];
  clearing: boolean;
  owned: boolean;
  companyWebsiteId: Id<"companyWebsites">;
  property: string | null;
  addresses: string[];
  origin: string;
  timeZone: string;
  events: string[];
  newestDay: string | undefined;
  oldestDay: string | undefined;
  weeklyPeriodsAt: number | undefined;
};

export const collectTarget = internalQuery({
  args: { connectionId: v.id("googleAnalyticsConnections") },
  handler: async (ctx, args): Promise<CollectTarget | null> => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) return null;
    const hold = await ctx.db.get(connection.companyWebsiteId);
    const website = await ctx.db.get(connection.websiteId);
    const addresses = connection.addresses ?? (website ? [website.host] : []);
    return {
      status: connection.status,
      clearing: connection.clearing === true,
      owned: hold !== null && !isTrackedHold(hold),
      companyWebsiteId: connection.companyWebsiteId,
      property: connection.property ?? null,
      addresses,
      origin: connection.stream ? new URL(connection.stream).origin : `https://${addresses[0] ?? website?.host ?? ""}`,
      timeZone: connection.timeZone ?? "Europe/London",
      events: (connection.events ?? []).map((event) => event.eventName),
      newestDay: connection.newestDay,
      oldestDay: connection.oldestDay,
      weeklyPeriodsAt: connection.weeklyPeriodsAt,
    };
  },
});

/** A step's hold on Google: the token, renewed once when it has just expired. */
export type Session = {
  ctx: ActionCtx;
  connectionId: Id<"googleAnalyticsConnections">;
  accessToken: string;
  requests: number;
  /** Set when renewing the token failed; the problem is already noted on the connection. */
  stopped: string | null;
};

export async function openSession(
  ctx: ActionCtx,
  connectionId: Id<"googleAnalyticsConnections">,
): Promise<{ ok: true; session: Session } | { ok: false; problem: string }> {
  const token = await accessTokenFor(ctx, connectionId);
  if (!token.ok) return { ok: false, problem: token.problem };
  return { ok: true, session: { ctx, connectionId, accessToken: token.accessToken, requests: 0, stopped: null } };
}

/** One report, renewing the token once if it has just expired and waiting a little when Google is busy. */
async function ask(session: Session, property: string, report: ReportAsk): Promise<({ ok: true } & Report) | GoogleFailure> {
  let renewed = false;
  for (let wait = 0; ;) {
    const answer = await runReport(session.accessToken, property, report);
    session.requests += answer.ok ? answer.requests : 1;
    if (answer.ok) return answer;
    if (answer.reason === "EXPIRED" && !renewed) {
      renewed = true;
      const token = await accessTokenFor(session.ctx, session.connectionId, true);
      if (!token.ok) {
        session.stopped = token.problem;
        return answer;
      }
      session.accessToken = token.accessToken;
      continue;
    }
    if ((answer.reason === "BUSY" || answer.reason === "UNREACHABLE") && wait < BUSY_WAITS_MS.length) {
      await new Promise((resolve) => setTimeout(resolve, BUSY_WAITS_MS[wait]));
      wait += 1;
      continue;
    }
    return answer;
  }
}

type Asked = { ok: true; groups: Map<string, ListRow[]>; flags: { folded: boolean; thresholded: boolean; cut: boolean } } | GoogleFailure;

/** A list's two asks — its figures and its key events — joined (`joinAsks`). */
async function askList(
  session: Session,
  target: CollectTarget,
  list: AnalyticsList,
  lead: readonly ("date" | "deviceCategory")[],
  range: { from: string; to: string },
): Promise<Asked> {
  const dimensions = [...lead, ...LIST_DIMENSIONS[list]];
  const base = { startDate: range.from, endDate: range.to, hostNames: target.addresses };
  const main = await ask(session, target.property!, { ...base, dimensions, metrics: [...MAIN_METRICS] });
  if (!main.ok) return main;
  let events: ({ ok: true } & Report) | null = null;
  if (target.events.length > 0) {
    const answer = await ask(session, target.property!, {
      ...base,
      dimensions: [...dimensions, "eventName"],
      metrics: [...EVENT_METRICS],
      eventNames: target.events,
    });
    if (!answer.ok) return answer;
    events = answer;
  }
  return {
    ok: true,
    groups: joinAsks(list, lead, main.rows, events?.rows ?? []),
    flags: {
      folded: main.folded || (events?.folded ?? false),
      thresholded: main.thresholded || (events?.thresholded ?? false),
      cut: main.cut || (events?.cut ?? false),
    },
  };
}

/** A page list's addresses as the website's page numbers (`holdPageRefs.ts`), shared with Search Console (§4.6). */
async function numberPages(ctx: ActionCtx, target: CollectTarget, rows: ListRow[]): Promise<ListRow[]> {
  const addresses = rows.map((row) => pageAddress(target.origin, row.key));
  const numbered = await encodePagesFromAction(ctx, target.companyWebsiteId, addresses.filter((address) => address !== "(not set)"));
  const refs = new Map<string, string>();
  let at = 0;
  for (const address of addresses) if (address !== "(not set)") refs.set(address, numbered[at++]);
  // Two paths that are one address once cleaned are one row.
  const merged = new Map<string, ListRow>();
  rows.forEach((row, index) => {
    const key = refs.get(addresses[index]) ?? "(not set)";
    const held = merged.get(key);
    if (!held) {
      merged.set(key, { ...row, key });
      return;
    }
    for (const field of ["visits", "engaged", "seconds", "views", "purchases", "revenue"] as const) held[field] += row[field];
    for (const [event, count] of row.counts) held.counts.set(event, (held.counts.get(event) ?? 0) + count);
    for (const [event, value] of row.values) held.values.set(event, (held.values.get(event) ?? 0) + value);
  });
  return [...merged.values()];
}

// ---------------------------------------------------------------------------
// The days
// ---------------------------------------------------------------------------

export type StepResult = { ok: true; rows: number; requests: number } | { ok: false; reason: string; access: boolean; busy: boolean; requests: number };

function failed(session: Session, failure: GoogleFailure | null): StepResult {
  return {
    ok: false,
    reason: session.stopped ?? (failure ? `${failure.reason} ${failure.status}: ${failure.detail}` : "No detail given."),
    access: failure?.reason === "ACCESS",
    busy: session.stopped === "GOOGLE_BUSY" || failure?.reason === "BUSY" || failure?.reason === "UNREACHABLE",
    requests: session.requests,
  };
}

/**
 * A week of days, newest first: the totals and the channels by day and
 * device, each day written as one record per list and device. A day Google
 * has nothing for is written with its totals at nought, so it reads as held.
 */
export async function collectDays(
  ctx: ActionCtx,
  session: Session,
  connectionId: Id<"googleAnalyticsConnections">,
  target: CollectTarget,
  range: { from: string; to: string },
): Promise<StepResult> {
  const totals = await askList(session, target, "total", ["date", "deviceCategory"], range);
  if (!totals.ok) return failed(session, totals);
  const channels = await askList(session, target, "channel", ["date", "deviceCategory"], range);
  if (!channels.ok) return failed(session, channels);
  let rows = 0;
  const days: string[] = [];
  for (let day = range.to; day >= range.from; day = shiftDay(day, -1)) days.push(day);
  for (const day of days) {
    const records: { list: "total" | "channel"; device: string; parts: PackedPart[]; folded: boolean; thresholded: boolean; cut: boolean }[] = [];
    for (const [list, asked] of [["total", totals], ["channel", channels]] as const) {
      const devices = new Map<string, ListRow[]>();
      for (const [group, groupRows] of asked.groups) {
        const [groupDay, device] = groupKeys(group);
        if (groupDay === day) devices.set(device, groupRows);
      }
      if (!devices.has(EVERY_DEVICE)) devices.set(EVERY_DEVICE, []);
      for (const [device, groupRows] of devices) {
        rows += groupRows.length;
        records.push({ list, device, parts: packList(list, groupRows, target.events), ...asked.flags });
      }
    }
    await ctx.runMutation(internal.googleAnalyticsCollect.writeDay, {
      connectionId,
      property: target.property!,
      day,
      records,
      fetchedAt: Date.now(),
    });
  }
  return { ok: true, rows, requests: session.requests };
}

const packedPartValidator = v.object(analyticsPackedRows);

/** A day's records, written only where their figures moved; a device Google no longer names that day goes. */
export const writeDay = internalMutation({
  args: {
    connectionId: v.id("googleAnalyticsConnections"),
    property: v.string(),
    day: v.string(),
    records: v.array(v.object({
      list: v.union(v.literal("total"), v.literal("channel")),
      device: v.string(),
      parts: v.array(packedPartValidator),
      folded: v.boolean(),
      thresholded: v.boolean(),
      cut: v.boolean(),
    })),
    fetchedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    // Disconnected, or another property chosen, while the step ran: what it fetched is not this connection's.
    if (!connection || connection.status !== "CONNECTED" || connection.property !== args.property || connection.clearing) return null;
    const hold = connection.companyWebsiteId;
    for (const list of ["total", "channel"] as const) {
      const fresh = args.records.filter((record) => record.list === list);
      const held = await ctx.db
        .query("googleAnalyticsDays")
        .withIndex("by_hold_list_day_device", (q) => q.eq("companyWebsiteId", hold).eq("list", list).eq("day", args.day))
        .collect();
      for (const record of fresh) {
        for (const [part, packed] of record.parts.entries()) {
          const before = held.find((row) => row.device === record.device && row.part === part);
          const flags = { folded: record.folded || undefined, thresholded: record.thresholded || undefined, cut: record.cut || undefined };
          if (!before) {
            await ctx.db.insert("googleAnalyticsDays", { companyWebsiteId: hold, list, device: record.device, day: args.day, part, ...packed, ...flags, fetchedAt: args.fetchedAt });
          } else if (!samePart(before, packed)) {
            await ctx.db.patch(before._id, { ...packed, ...flags, fetchedAt: args.fetchedAt });
          }
        }
      }
      for (const row of held) {
        const kept = fresh.find((record) => record.device === row.device);
        if (!kept || row.part >= kept.parts.length) await ctx.db.delete(row._id);
      }
    }
    const newestDay = !connection.newestDay || args.day > connection.newestDay ? args.day : connection.newestDay;
    const oldestDay = !connection.oldestDay || args.day < connection.oldestDay ? args.day : connection.oldestDay;
    await ctx.db.patch(connection._id, { newestDay, oldestDay, updatedAt: Date.now() });
    return null;
  },
});

function samePart(held: PackedPart, fresh: PackedPart): boolean {
  return held.visits === fresh.visits && held.engaged === fresh.engaged && held.seconds === fresh.seconds && held.views === fresh.views
    && held.purchases === fresh.purchases && held.revenue === fresh.revenue
    && JSON.stringify(held.keys) === JSON.stringify(fresh.keys) && JSON.stringify(held.events) === JSON.stringify(fresh.events)
    && JSON.stringify(held.counts) === JSON.stringify(fresh.counts) && JSON.stringify(held.values) === JSON.stringify(fresh.values);
}

/** The days older than the 60 kept (§4.3), a few hundred at a time; true when none is left. */
export async function dropOldDays(ctx: MutationCtx, companyWebsiteId: Id<"companyWebsites">, newest: string): Promise<boolean> {
  const first = shiftDay(newest, -(DAYS_KEPT - 1));
  let left = true;
  for (const list of ["total", "channel"] as const) {
    const old = await ctx.db
      .query("googleAnalyticsDays")
      .withIndex("by_hold_list_day_device", (q) => q.eq("companyWebsiteId", companyWebsiteId).eq("list", list).lt("day", first))
      .take(200);
    for (const row of old) await ctx.db.delete(row._id);
    if (old.length === 200) left = false;
  }
  return left;
}

// ---------------------------------------------------------------------------
// The ready-made periods
// ---------------------------------------------------------------------------

/** Where each ready-made list stands: the slot screens read, and the fingerprint and dates of what is in it. */
export const slotsOf = internalQuery({
  args: { companyWebsiteId: v.id("companyWebsites"), keys: v.array(v.string()) },
  handler: async (ctx, args) => {
    const out: Record<string, { slot: number; hash: string; from: string; to: string }> = {};
    for (const key of args.keys) {
      const slot = await ctx.db
        .query("googleAnalyticsPeriodSlots")
        .withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", args.companyWebsiteId).eq("key", key))
        .first();
      if (slot) out[key] = { slot: slot.slot, hash: slot.hash, from: slot.from, to: slot.to };
    }
    return out;
  },
});

/** A few parts of a build, into the slot screens are not reading. */
export const putPeriodParts = internalMutation({
  args: {
    connectionId: v.id("googleAnalyticsConnections"),
    property: v.string(),
    key: v.string(),
    slot: v.number(),
    first: v.number(),
    parts: v.array(packedPartValidator),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.status !== "CONNECTED" || connection.property !== args.property || connection.clearing) return false;
    const hold = connection.companyWebsiteId;
    for (const [at, packed] of args.parts.entries()) {
      const part = args.first + at;
      const held = await ctx.db
        .query("googleAnalyticsPeriods")
        .withIndex("by_hold_key_slot_part", (q) => q.eq("companyWebsiteId", hold).eq("key", args.key).eq("slot", args.slot).eq("part", part))
        .first();
      if (held) await ctx.db.patch(held._id, packed);
      else await ctx.db.insert("googleAnalyticsPeriods", { companyWebsiteId: hold, key: args.key, slot: args.slot, part, ...packed });
    }
    return true;
  },
});

/**
 * The build complete: screens read it from now on, and the build it replaces
 * goes. A query reads a slot and its parts at one moment, so no screen reads
 * half of one build.
 */
export const flipSlot = internalMutation({
  args: {
    connectionId: v.id("googleAnalyticsConnections"),
    property: v.string(),
    key: v.string(),
    slot: v.number(),
    parts: v.number(),
    from: v.string(),
    to: v.string(),
    hash: v.string(),
    folded: v.boolean(),
    thresholded: v.boolean(),
    cut: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.status !== "CONNECTED" || connection.property !== args.property || connection.clearing) return null;
    const hold = connection.companyWebsiteId;
    const flags = { folded: args.folded || undefined, thresholded: args.thresholded || undefined, cut: args.cut || undefined };
    const held = await ctx.db
      .query("googleAnalyticsPeriodSlots")
      .withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", hold).eq("key", args.key))
      .first();
    const now = Date.now();
    if (held) {
      await ctx.db.patch(held._id, { slot: args.slot, parts: args.parts, from: args.from, to: args.to, hash: args.hash, ...flags, builtAt: now });
    } else {
      await ctx.db.insert("googleAnalyticsPeriodSlots", {
        companyWebsiteId: hold, key: args.key, slot: args.slot, parts: args.parts, from: args.from, to: args.to, hash: args.hash, ...flags, builtAt: now,
      });
    }
    // This build's parts past its own count, and the whole of the build it replaces.
    const stale = [
      ...await ctx.db
        .query("googleAnalyticsPeriods")
        .withIndex("by_hold_key_slot_part", (q) => q.eq("companyWebsiteId", hold).eq("key", args.key).eq("slot", args.slot).gte("part", args.parts))
        .take(PARTS_PER_DELETE),
      ...await ctx.db
        .query("googleAnalyticsPeriods")
        .withIndex("by_hold_key_slot_part", (q) => q.eq("companyWebsiteId", hold).eq("key", args.key).eq("slot", 1 - args.slot))
        .take(PARTS_PER_DELETE),
    ];
    for (const part of stale) await ctx.db.delete(part._id);
    return null;
  },
});

/**
 * One ready-made list, asked of Google ready-made: for every device, and for
 * each device when the list is kept by device. Each device's build is written
 * into the slot screens are not reading, then flipped — unless its figures
 * did not move since the last build (GA23).
 */
export async function collectPeriod(
  ctx: ActionCtx,
  session: Session,
  connectionId: Id<"googleAnalyticsConnections">,
  target: CollectTarget,
  job: PeriodJob,
  top: string,
): Promise<StepResult> {
  const range = periodRange(job.period, job.which, top);
  const lead = KEPT_BY_DEVICE[job.list] ? (["deviceCategory"] as const) : ([] as const);
  const asked = await askList(session, target, job.list, lead, range);
  if (!asked.ok) return failed(session, asked);
  const devices = new Map<string, ListRow[]>();
  for (const [group, rows] of asked.groups) devices.set(lead.length > 0 ? groupKeys(group)[0] : EVERY_DEVICE, rows);
  if (!devices.has(EVERY_DEVICE)) devices.set(EVERY_DEVICE, []);
  const keys = [...devices.keys()].map((device) => slotKey(job.list, job.period, job.which, device));
  const slots: Record<string, { slot: number; hash: string; from: string; to: string }> =
    await ctx.runQuery(internal.googleAnalyticsCollect.slotsOf, { companyWebsiteId: target.companyWebsiteId, keys });
  let rows = 0;
  for (const [device, deviceRows] of devices) {
    const listRows = job.list === "landing" || job.list === "page" ? await numberPages(ctx, target, deviceRows) : deviceRows;
    rows += listRows.length;
    const parts = packList(job.list, listRows, target.events);
    const key = slotKey(job.list, job.period, job.which, device);
    const hash = await fingerprint(parts);
    const held = slots[key];
    if (held && held.hash === hash && held.from === range.from && held.to === range.to) continue;
    const slot = held ? 1 - held.slot : 0;
    for (let first = 0; first < parts.length; first += PARTS_PER_WRITE) {
      const written: boolean = await ctx.runMutation(internal.googleAnalyticsCollect.putPeriodParts, {
        connectionId, property: target.property!, key, slot, first, parts: parts.slice(first, first + PARTS_PER_WRITE),
      });
      if (!written) return { ok: true, rows, requests: session.requests };
    }
    await ctx.runMutation(internal.googleAnalyticsCollect.flipSlot, {
      connectionId, property: target.property!, key, slot, parts: parts.length, from: range.from, to: range.to, hash, ...asked.flags,
    });
  }
  return { ok: true, rows, requests: session.requests };
}

/** The run's last word on the connection: when it was collected, and the weekly lists when they were asked. */
export const finishCollection = internalMutation({
  args: {
    connectionId: v.id("googleAnalyticsConnections"),
    property: v.string(),
    weekly: v.boolean(),
    firstDone: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.property !== args.property) return null;
    const now = Date.now();
    await ctx.db.patch(connection._id, {
      lastCollectedAt: now,
      dailyPeriodsAt: now,
      ...(args.weekly ? { weeklyPeriodsAt: now } : {}),
      ...(args.firstDone && connection.backfilledAt === undefined ? { backfilledAt: now } : {}),
      collecting: undefined,
      problem: undefined,
      problemAt: undefined,
      updatedAt: now,
    });
    if (connection.newestDay) await dropOldDays(ctx, connection.companyWebsiteId, connection.newestDay);
    // What screens asked of Google live is held until now (GA23): the ready-made lists are fresher.
    await ctx.scheduler.runAfter(0, internal.googleAnalyticsCollect.dropLive, { companyWebsiteId: connection.companyWebsiteId });
    return null;
  },
});

/** Lists a screen asked of Google live, held until the next collection (GA23), a few hundred at a time. */
export const dropLive = internalMutation({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const held = await ctx.db
      .query("googleAnalyticsLive")
      .withIndex("by_hold_ask_part", (q) => q.eq("companyWebsiteId", args.companyWebsiteId))
      .take(LIVE_PER_DELETE);
    for (const row of held) await ctx.db.delete(row._id);
    if (held.length === LIVE_PER_DELETE) await ctx.scheduler.runAfter(0, internal.googleAnalyticsCollect.dropLive, args);
    return null;
  },
});

// ---------------------------------------------------------------------------
// Clearing
// ---------------------------------------------------------------------------

/** Records removed a call when a website's figures go. */
const CLEAR_PER_CALL = 200;

/** Some of a website's figures gone — its days, ready-made lists and live lists; true when none is left. */
async function clearSome(ctx: MutationCtx, companyWebsiteId: Id<"companyWebsites">): Promise<boolean> {
  let done = true;
  const days = await ctx.db.query("googleAnalyticsDays").withIndex("by_hold_list_day_device", (q) => q.eq("companyWebsiteId", companyWebsiteId)).take(CLEAR_PER_CALL);
  const periods = await ctx.db.query("googleAnalyticsPeriods").withIndex("by_hold_key_slot_part", (q) => q.eq("companyWebsiteId", companyWebsiteId)).take(PARTS_PER_DELETE);
  const slots = await ctx.db.query("googleAnalyticsPeriodSlots").withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", companyWebsiteId)).take(CLEAR_PER_CALL);
  const live = await ctx.db.query("googleAnalyticsLive").withIndex("by_hold_ask_part", (q) => q.eq("companyWebsiteId", companyWebsiteId)).take(CLEAR_PER_CALL);
  for (const row of [...days, ...periods, ...slots, ...live]) await ctx.db.delete(row._id);
  if (days.length === CLEAR_PER_CALL || periods.length === PARTS_PER_DELETE || slots.length === CLEAR_PER_CALL || live.length === CLEAR_PER_CALL) done = false;
  return done;
}

/**
 * A website's figures go, a batch at a time — another property chosen, whose
 * figures are never mixed with the last one's. The connection is collected
 * again once they are gone.
 */
export const clearFigures = internalMutation({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await clearSome(ctx, args.companyWebsiteId))) {
      await ctx.scheduler.runAfter(0, internal.googleAnalyticsCollect.clearFigures, args);
      return null;
    }
    const connection = await ctx.db
      .query("googleAnalyticsConnections")
      .withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.companyWebsiteId))
      .first();
    if (connection?.clearing) {
      await ctx.db.patch(connection._id, {
        clearing: undefined, newestDay: undefined, oldestDay: undefined, backfilledAt: undefined,
        dailyPeriodsAt: undefined, weeklyPeriodsAt: undefined, updatedAt: Date.now(),
      });
      // The new property's figures start coming in at once (§10, Q15).
      if (connection.status === "CONNECTED") await startFirstCollection(ctx, (await ctx.db.get(connection._id))!);
    }
    return null;
  },
});

/** A website the company no longer holds: every figure Analytics brought, then its connection. */
export const purgeFigures = internalMutation({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await clearSome(ctx, args.companyWebsiteId))) {
      await ctx.scheduler.runAfter(0, internal.googleAnalyticsCollect.purgeFigures, args);
      return null;
    }
    const connection = await ctx.db
      .query("googleAnalyticsConnections")
      .withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.companyWebsiteId))
      .first();
    if (connection) await ctx.db.delete(connection._id);
    return null;
  },
});
