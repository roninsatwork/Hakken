import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { adminAction, tenantMutation, tenantQuery } from "./tenantFunctions";
import { getActiveCompanyId } from "./authz";
import { companyHolds, requireMySite } from "./siteAccess";
import { appError } from "./utils/appError";
import { decryptConnectorToken, encryptConnectorToken } from "./connectorTokenCrypto";
import {
  DEVICE_JOIN,
  SCROLL_STEP,
  addTotals,
  clarityRowValidator,
  clarityTotalsFrom,
  clarityTotalsRowValidator,
  emptyTotals,
  rowOf,
  type ClarityRow,
  type ClarityTotals,
  type ClarityTotalsRow,
} from "./utils/clarityRows";
import { addUpBy, packDaily, packTotals, unpackDaily, unpackTotals } from "./utils/clarityPacks";
import { shiftDay } from "./utils/insightFacts";

/**
 * Microsoft Clarity, connected and read (docs/plans/active/insights-analyst-plan.md
 * §7b, I24, I27, phase 15). A company admin pastes the project's Data Export
 * token; it is tested with one ask, kept as ciphertext, and each morning the
 * last day is asked twice — by page and device, and by device across the
 * website — two of the project's ten asks a day, each day kept, since Clarity
 * keeps three.
 *
 * Kept as docs/plans/active/agents-and-clarity-plan.md, Part 0 has it: one
 * packed record a day (`clarityFigures`), totals not averages, and the 7, 30
 * and 90 days the screens read worked out once each morning, so a screen reads
 * one record where it added up as many as 180.
 */

const EXPORT_URL = "https://www.clarity.ms/export-data/api/v1/project-live-insights";
/** When each connected website's morning is asked (`crons.ts`, "clarity-morning"); a website's Schedules page shows it. */
export const CLARITY_MORNING_UTC = { hourUTC: 4, minuteUTC: 50 } as const;
/** Days kept day by day: the longest any screen shows (agents-and-clarity-plan.md, Part 0). */
export const CLARITY_DAYS_KEPT = 90;
/**
 * Months kept as months: 13 (Anthony, 2026-10-12, "13 is good"), enough to set a
 * month against the same month a year before — the counting check's second witness.
 */
export const CLARITY_MONTHS_KEPT = 13;
/** The ready-made periods the screens read, and their days. */
const PERIODS = [["LAST_7", 7], ["LAST_30", 30], ["LAST_90", 90]] as const;
type PeriodSpan = (typeof PERIODS)[number][0];
type Span = "DAY" | "MONTH" | PeriodSpan;
/**
 * Pages a record holds at most: a period's pages beyond it go in further parts
 * of the same period, so no record nears Convex's 1 MiB however many pages a
 * website has (about 200 KB at this many, measured 2026-10-16).
 */
export const CLARITY_PART_ROWS = 4_000;

type Reader = { db: QueryCtx["db"] };

/** One ask of Clarity's export: the last day, by page and device or by device. */
async function askClarity(token: string, dimension: "URL,Device" | "Device"): Promise<{ ok: true; rows: ClarityTotalsRow[] } | { ok: false; status: number; problem: string }> {
  let response: Response;
  try {
    const dimensions = dimension.split(",").map((name, at) => `&dimension${at + 1}=${name}`).join("");
    response = await fetch(`${EXPORT_URL}?numOfDays=1${dimensions}`, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(30_000) });
  } catch {
    return { ok: false, status: 0, problem: "Clarity could not be reached." };
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return { ok: false, status: response.status, problem: response.status === 401 || response.status === 403 ? "Clarity refused the token: generate a new one in Clarity's Settings → Data Export." : response.status === 429 ? "Clarity's ten asks a day are used up for today." : `Clarity answered ${response.status}. ${text.slice(0, 200)}` };
  }
  return { ok: true, rows: clarityTotalsFrom(await response.json(), dimension) };
}

/** A span's records, newest first: a period's parts, or one day's or month's record. */
async function recordsOf(ctx: Reader, holdId: Id<"companyWebsites">, span: Span, key?: string): Promise<Array<Doc<"clarityFigures">>> {
  return await ctx.db.query("clarityFigures")
    .withIndex("by_hold_span_key", (q) => (key === undefined ? q.eq("companyWebsiteId", holdId).eq("span", span) : q.eq("companyWebsiteId", holdId).eq("span", span).eq("key", key)))
    .order("desc")
    .take(64);
}

/** The ready-made period a screen's days are read from: 7, 30 or 90. */
const periodFor = (days: number): PeriodSpan => (days <= 7 ? "LAST_7" : days <= 30 ? "LAST_30" : "LAST_90");

/**
 * A ready-made period, as kept: its first part, which carries the website's
 * figures and its days, and every part's pages, unpacked. Read by the screens
 * and by Insights; nothing adds up days when it is read.
 */
export async function clarityPeriod(ctx: Reader, holdId: Id<"companyWebsites">, days: number, withPages = true): Promise<{ first: Doc<"clarityFigures">; pages: ClarityTotalsRow[] } | null> {
  const span = periodFor(days);
  const first = await ctx.db.query("clarityFigures").withIndex("by_hold_span_part", (q) => q.eq("companyWebsiteId", holdId).eq("span", span).eq("part", 0)).order("desc").first();
  if (!first) return null;
  if (!withPages) return { first, pages: [] };
  const parts = (await recordsOf(ctx, holdId, span, first.key)).sort((a, b) => a.part - b.part);
  return { first, pages: parts.flatMap((part) => unpackTotals(part.pages)) };
}

/** A record's website totals, every device added up. */
const siteTotals = (record: Doc<"clarityFigures">): ClarityTotals => unpackTotals(record.site).reduce((sum, row) => addTotals(sum, row), emptyTotals());

/** The website's figures a day for a period's charts, as the screens read them. */
export function clarityDays(record: Doc<"clarityFigures">): Array<{ day: string; totals: ClarityTotals }> {
  return record.daily ? unpackDaily(record.daily) : [];
}

/** The website's Clarity connection, as its screens show it: never the token. */
export const clarityStatus = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.object({
    host: v.string(),
    owned: v.boolean(),
    ownSites: v.array(v.object({ siteId: v.id("companyWebsites"), host: v.string() })),
    connection: v.union(v.null(), v.object({ status: v.string(), projectName: v.union(v.string(), v.null()), problem: v.union(v.string(), v.null()), newestDay: v.union(v.string(), v.null()), oldestDay: v.union(v.string(), v.null()), lastCollectedAt: v.union(v.number(), v.null()) })),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId).catch(() => null);
    if (!site) return null;
    const holds = ctx.companyId ? await companyHolds(ctx, ctx.companyId) : [];
    const own = holds.filter((entry) => entry.summary.relationship === "OWNED").map((entry) => ({ siteId: entry.hold._id, host: entry.summary.host }));
    const row = await ctx.db.query("clarityConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", site.hold._id)).first();
    return {
      host: site.website.displayHost ?? site.website.host,
      owned: site.hold.relationship === "OWNED",
      ownSites: own,
      connection: row ? { status: row.status, projectName: row.projectName ?? null, problem: row.problem ?? null, newestDay: row.newestDay ?? null, oldestDay: row.oldestDay ?? null, lastCollectedAt: row.lastCollectedAt ?? null } : null,
    };
  },
});

/** The company's own websites, each with its Clarity connection and its last 30 days, read from the ready-made period. */
export const claritySites = tenantQuery({
  args: {},
  returns: v.array(v.object({ siteId: v.id("companyWebsites"), host: v.string(), status: v.string(), sessions: v.union(v.number(), v.null()), scroll: v.union(v.number(), v.null()), lastCollectedAt: v.union(v.number(), v.null()) })),
  handler: async (ctx) => {
    if (!ctx.companyId) return [];
    const holds = (await companyHolds(ctx, ctx.companyId)).filter((entry) => entry.summary.relationship === "OWNED");
    const out = [];
    for (const entry of holds) {
      const row = await ctx.db.query("clarityConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", entry.hold._id)).first();
      const period = row ? await clarityPeriod(ctx, entry.hold._id, 30, false) : null;
      const whole = period ? rowOf("all", siteTotals(period.first)) : null;
      out.push({ siteId: entry.hold._id, host: entry.summary.host, status: row?.status ?? "NOT_CONNECTED", sessions: row ? whole?.sessions ?? 0 : null, scroll: whole?.scroll ?? null, lastCollectedAt: row?.lastCollectedAt ?? null });
    }
    return out;
  },
});

/**
 * A website's figures over the days chosen, for its screens: each page (on
 * each device, or across them) or each device, and each day's totals for the
 * charts — all read from the period worked out each morning. `days` says how
 * many of them Clarity recorded, so a screen never says 30 days of four.
 */
export const clarityFigures = tenantQuery({
  args: { siteId: v.id("companyWebsites"), by: v.union(v.literal("PAGE"), v.literal("DEVICE"), v.literal("PAGE_DEVICE")), days: v.number() },
  returns: v.object({
    from: v.union(v.string(), v.null()),
    to: v.union(v.string(), v.null()),
    days: v.number(),
    rows: v.array(clarityRowValidator),
    byDay: v.array(v.object({ day: v.string(), sessions: v.number(), dead: v.union(v.number(), v.null()), rage: v.union(v.number(), v.null()), scroll: v.union(v.number(), v.null()) })),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const period = await clarityPeriod(ctx, site.hold._id, args.days, args.by !== "DEVICE");
    if (!period) return { from: null, to: null, days: 0, rows: [], byDay: [] };
    const sums = args.by === "DEVICE"
      ? addUpBy(unpackTotals(period.first.site), (row) => row.device)
      : addUpBy(period.pages, (row) => (args.by === "PAGE" ? row.page ?? "" : `${row.page ?? ""}${DEVICE_JOIN}${row.device}`));
    const rows: ClarityRow[] = [...sums].map(([key, totals]) => rowOf(key, totals)).sort((a, b) => b.sessions - a.sessions);
    const byDay = clarityDays(period.first).map(({ day, totals }) => {
      const row = rowOf(day, totals);
      return { day, sessions: row.sessions, dead: row.dead, rage: row.rage, scroll: row.scroll };
    });
    return { from: period.first.from, to: period.first.to, days: period.first.days, rows, byDay };
  },
});

/** Paste a project's Data Export token: tested with one ask, kept as ciphertext, read each morning from then. */
export const connectClarity = adminAction({
  args: { siteId: v.id("companyWebsites"), token: v.string() },
  returns: v.object({ ok: v.boolean(), problem: v.union(v.string(), v.null()) }),
  handler: async (ctx, args): Promise<{ ok: boolean; problem: string | null }> => {
    const token = args.token.trim();
    if (token.length < 20) return { ok: false, problem: "That doesn't look like a Clarity Data Export token." };
    const allowed: { ok: boolean; problem: string | null; companyId: Id<"companies"> | null } = await ctx.runQuery(internal.clarity.canConnect, { siteId: args.siteId, companyId: getActiveCompanyId(ctx.user) ?? undefined, userId: ctx.userId });
    if (!allowed.ok) return { ok: false, problem: allowed.problem };
    const tested = await askClarity(token, "Device");
    if (!tested.ok) return { ok: false, problem: tested.problem };
    const tokenCiphertext = await encryptConnectorToken(token);
    await ctx.runMutation(internal.clarity.saveConnection, { siteId: args.siteId, companyId: allowed.companyId!, tokenCiphertext, connectedBy: ctx.userId });
    await ctx.scheduler.runAfter(0, internal.clarity.collectWebsite, { holdId: args.siteId });
    return { ok: true, problem: null };
  },
});

/** Only a company admin connects, and only one of its own websites. */
export const canConnect = internalQuery({
  args: { siteId: v.id("companyWebsites"), companyId: v.optional(v.id("companies")), userId: v.optional(v.id("users")) },
  returns: v.object({ ok: v.boolean(), problem: v.union(v.string(), v.null()), companyId: v.union(v.id("companies"), v.null()) }),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.siteId);
    const user = args.userId ? await ctx.db.get(args.userId) : null;
    if (!hold || !args.companyId || hold.companyId !== args.companyId || hold.relationship !== "OWNED") return { ok: false, problem: "Only your company's own website can be connected.", companyId: null };
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) return { ok: false, problem: "Only a company admin can connect Clarity.", companyId: null };
    return { ok: true, problem: null, companyId: hold.companyId };
  },
});

export const saveConnection = internalMutation({
  args: { siteId: v.id("companyWebsites"), companyId: v.id("companies"), tokenCiphertext: v.string(), connectedBy: v.optional(v.id("users")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const held = await ctx.db.query("clarityConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.siteId)).first();
    const fields = { companyId: args.companyId, companyWebsiteId: args.siteId, status: "CONNECTED" as const, tokenCiphertext: args.tokenCiphertext, problem: undefined, connectedBy: args.connectedBy, updatedAt: now };
    if (held) await ctx.db.patch(held._id, fields);
    else await ctx.db.insert("clarityConnections", { ...fields, createdAt: now });
    return null;
  },
});

/** Disconnect: the token goes; the figures kept stay, as a disconnected Analytics' do. */
export const disconnectClarity = tenantMutation({
  args: { siteId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const user = ctx.userId ? await ctx.db.get(ctx.userId) : null;
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) throw appError("UNAUTHORIZED", "Only a company admin can disconnect Clarity.");
    const held = await ctx.db.query("clarityConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", site.hold._id)).first();
    if (held) await ctx.db.patch(held._id, { status: "DISCONNECTED", tokenCiphertext: "", updatedAt: Date.now() });
    return null;
  },
});

/** Each connected website, for the morning's asks: not one switched off on its Schedules page (website-schedules-plan.md, WS4). */
export const connectedWebsites = internalQuery({
  args: {},
  returns: v.array(v.id("companyWebsites")),
  handler: async (ctx) => (await ctx.db.query("clarityConnections").withIndex("by_status", (q) => q.eq("status", "CONNECTED")).take(500))
    .filter((row) => !row.switchedOff)
    .map((row) => row.companyWebsiteId),
});

export const tokenOf = internalQuery({
  args: { holdId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const row = await ctx.db.query("clarityConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first();
    // Switched off, a website is asked nothing, whoever starts its morning.
    return row?.status === "CONNECTED" && !row.switchedOff && row.tokenCiphertext ? row.tokenCiphertext : null;
  },
});

/** Whether Clarity recorded anything that day: a visit by a person or a bot. */
const recorded = (site: readonly ClarityTotalsRow[]) => site.some((row) => row.visits + row.bots > 0);

/**
 * A morning's answers kept as the day's one record, then the month and the
 * periods worked out from the days (`rebuildFigures`), each in its own step.
 */
export const saveDay = internalMutation({
  args: { holdId: v.id("companyWebsites"), day: v.string(), pages: v.union(v.array(clarityTotalsRowValidator), v.null()), site: v.union(v.array(clarityTotalsRowValidator), v.null()), problem: v.union(v.string(), v.null()), refused: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const connection = await ctx.db.query("clarityConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first();
    if (!connection) return null;
    const saved = Boolean(args.pages || args.site);
    if (saved) {
      const site = args.site ?? [];
      const record = { companyWebsiteId: args.holdId, span: "DAY" as const, key: args.day, part: 0, from: args.day, to: args.day, days: recorded(site) ? 1 : 0, pages: packTotals(args.pages ?? []), site: packTotals(site), builtAt: now };
      const [held] = await recordsOf(ctx, args.holdId, "DAY", args.day);
      if (held) await ctx.db.replace(held._id, record);
      else await ctx.db.insert("clarityFigures", record);
    }
    const newestDay = saved && (!connection.newestDay || connection.newestDay < args.day) ? args.day : connection.newestDay;
    await ctx.db.patch(connection._id, {
      ...(args.refused ? { status: "NEEDS_RECONNECT" as const } : {}),
      problem: args.problem ?? undefined,
      ...(saved ? { newestDay, oldestDay: connection.oldestDay && connection.oldestDay < args.day ? connection.oldestDay : args.day, lastCollectedAt: now } : {}),
      updatedAt: now,
    });
    if (saved) await ctx.scheduler.runAfter(0, internal.clarity.rebuildFigures, { holdId: args.holdId, day: args.day });
    return null;
  },
});

/** After a day is kept: its month, the three periods, and what is past keeping, each its own step so none reads more than it needs. */
export const rebuildFigures = internalMutation({
  args: { holdId: v.id("companyWebsites"), day: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.query("clarityConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first();
    const newest = connection?.newestDay;
    if (!newest) return null;
    const month = args.day.slice(0, 7);
    await ctx.scheduler.runAfter(0, internal.clarity.buildSpan, { holdId: args.holdId, span: "MONTH", key: month, from: `${month}-01`, to: `${month}-31` });
    for (const [span, length] of PERIODS) {
      await ctx.scheduler.runAfter(0, internal.clarity.buildSpan, { holdId: args.holdId, span, key: newest, from: shiftDay(newest, -(length - 1)), to: newest });
    }
    await ctx.scheduler.runAfter(0, internal.clarity.tidyFigures, { holdId: args.holdId });
    return null;
  },
});

/** Days' records added up into one span: every page on every device, every device, and the website a day. */
export function addUpDays(days: ReadonlyArray<Doc<"clarityFigures">>): { pages: ClarityTotalsRow[]; site: ClarityTotalsRow[]; daily: Array<{ day: string; totals: ClarityTotals }>; recorded: number } {
  const pages = new Map<string, ClarityTotalsRow>();
  const site = new Map<string, ClarityTotalsRow>();
  const daily: Array<{ day: string; totals: ClarityTotals }> = [];
  const into = (map: Map<string, ClarityTotalsRow>, row: ClarityTotalsRow) => {
    const key = `${row.page ?? ""}${DEVICE_JOIN}${row.device}`;
    const held = map.get(key);
    if (held) addTotals(held, row);
    else map.set(key, { ...row });
  };
  for (const day of [...days].sort((a, b) => a.key.localeCompare(b.key))) {
    for (const row of unpackTotals(day.pages)) into(pages, row);
    const devices = unpackTotals(day.site);
    for (const row of devices) into(site, row);
    daily.push({ day: day.key, totals: devices.reduce((sum, row) => addTotals(sum, row), emptyTotals()) });
  }
  return {
    pages: [...pages.values()].sort((a, b) => b.visits - a.visits),
    site: [...site.values()].sort((a, b) => b.visits - a.visits),
    daily,
    recorded: days.reduce((sum, day) => sum + day.days, 0),
  };
}

/** One month or period worked out from its days and kept in place of the last: the website's figures and its days as part 0, then its pages in parts of `CLARITY_PART_ROWS`. */
export const buildSpan = internalMutation({
  args: { holdId: v.id("companyWebsites"), span: v.union(v.literal("MONTH"), v.literal("LAST_7"), v.literal("LAST_30"), v.literal("LAST_90")), key: v.string(), from: v.string(), to: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const old = args.span === "MONTH" ? await recordsOf(ctx, args.holdId, "MONTH", args.key) : await recordsOf(ctx, args.holdId, args.span);
    if (args.span === "MONTH" && old.length > 0) {
      // A month whose first days are past keeping day by day is left as it was worked out, never redone from what is left of it.
      const connection = await ctx.db.query("clarityConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first();
      if (connection?.newestDay && args.from < shiftDay(connection.newestDay, -(CLARITY_DAYS_KEPT - 1))) return null;
    }
    const days = await ctx.db.query("clarityFigures")
      .withIndex("by_hold_span_key", (q) => q.eq("companyWebsiteId", args.holdId).eq("span", "DAY").gte("key", args.from).lte("key", args.to))
      .take(CLARITY_DAYS_KEPT + 1);
    for (const record of old) await ctx.db.delete(record._id);
    if (days.length === 0) return null;
    const summed = addUpDays(days);
    const builtAt = Date.now();
    const from = days.reduce((first, day) => (day.key < first ? day.key : first), days[0].key);
    const to = days.reduce((last, day) => (day.key > last ? day.key : last), days[0].key);
    const common = { companyWebsiteId: args.holdId, span: args.span, key: args.key, from, to, days: summed.recorded, builtAt };
    // The website's figures and its days on their own, so Overview and Insights read a few kilobytes however many pages there are.
    await ctx.db.insert("clarityFigures", { ...common, part: 0, pages: packTotals([]), site: packTotals(summed.site), daily: packDaily(summed.daily) });
    for (let at = 0; at * CLARITY_PART_ROWS < summed.pages.length; at += 1) {
      await ctx.db.insert("clarityFigures", { ...common, part: at + 1, pages: packTotals(summed.pages.slice(at * CLARITY_PART_ROWS, (at + 1) * CLARITY_PART_ROWS)), site: packTotals([]) });
    }
    return null;
  },
});

/** What is past keeping: days older than 90 (their month is kept), months older than 13. A few at a time; each morning catches up. */
export const tidyFigures = internalMutation({
  args: { holdId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.query("clarityConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first();
    const newest = connection?.newestDay;
    if (!newest) return null;
    const oldestDay = shiftDay(newest, -(CLARITY_DAYS_KEPT - 1));
    const days = await ctx.db.query("clarityFigures").withIndex("by_hold_span_key", (q) => q.eq("companyWebsiteId", args.holdId).eq("span", "DAY").lt("key", oldestDay)).take(20);
    for (const day of days) await ctx.db.delete(day._id);
    const [year, monthNumber] = newest.slice(0, 7).split("-").map(Number);
    const firstKept = new Date(Date.UTC(year, monthNumber - 1 - (CLARITY_MONTHS_KEPT - 1), 1)).toISOString().slice(0, 7);
    const months = await ctx.db.query("clarityFigures").withIndex("by_hold_span_key", (q) => q.eq("companyWebsiteId", args.holdId).eq("span", "MONTH").lt("key", firstKept)).take(10);
    for (const month of months) await ctx.db.delete(month._id);
    return null;
  },
});

/** One website's morning: yesterday by page and device, and by device across the website — two of its ten asks a day. */
export const collectWebsite = internalAction({
  args: { holdId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const ciphertext: string | null = await ctx.runQuery(internal.clarity.tokenOf, { holdId: args.holdId });
    if (!ciphertext) return null;
    const token = await decryptConnectorToken(ciphertext);
    // Clarity's "last day" is the 24 hours to now: filed as yesterday, the day it mostly covers.
    const day = shiftDay(new Date().toISOString().slice(0, 10), -1);
    const pages = await askClarity(token, "URL,Device");
    const site = pages.ok ? await askClarity(token, "Device") : pages;
    const failed = !pages.ok ? pages : !site.ok ? site : null;
    await ctx.runMutation(internal.clarity.saveDay, {
      holdId: args.holdId,
      day,
      pages: pages.ok ? pages.rows : null,
      site: site.ok ? site.rows : null,
      problem: failed ? failed.problem : null,
      refused: Boolean(failed && (failed.status === 401 || failed.status === 403)),
    });
    return null;
  },
});

/** Every connected website's morning, a few seconds apart. */
export const collectAll = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const holds: Array<Id<"companyWebsites">> = await ctx.runQuery(internal.clarity.connectedWebsites, {});
    for (const [index, holdId] of holds.entries()) await ctx.scheduler.runAfter(index * 3_000, internal.clarity.collectWebsite, { holdId });
    return null;
  },
});

/**
 * The records kept before Part 0 (`clarityDays`, three a day, rows of objects),
 * turned into days of the new kind and deleted, a batch at a time. Only the
 * by-device records are carried over: every page in the by-page ones was filed
 * as "/" (2026-10-16 audit), so they are dropped rather than kept wrong. Their
 * visits counted bots too, and say so by holding no bot count.
 */
export const convertOldDays = internalMutation({
  args: {},
  returns: v.object({ converted: v.number(), more: v.boolean() }),
  handler: async (ctx) => {
    const batch = await ctx.db.query("clarityDays").take(60);
    const touched = new Map<Id<"companyWebsites">, string>();
    let converted = 0;
    for (const old of batch) {
      if (old.by === "DEVICE") {
        const site: ClarityTotalsRow[] = old.rows.filter((row) => row.sessions > 0).map((row) => ({
          page: null, device: row.key, visits: row.sessions, bots: 0,
          scrollSum: Math.round((row.scroll ?? 0) * SCROLL_STEP * row.sessions), activeSum: Math.round((row.activeSeconds ?? 0) * row.sessions),
          dead: Math.round(((row.dead ?? 0) / 100) * row.sessions), rage: Math.round(((row.rage ?? 0) / 100) * row.sessions),
          quickBack: Math.round(((row.quickBack ?? 0) / 100) * row.sessions), excessive: Math.round(((row.excessiveScroll ?? 0) / 100) * row.sessions),
          errors: 0, errorClicks: 0, users: 0, pagesSum: 0,
        }));
        const [held] = await recordsOf(ctx, old.companyWebsiteId, "DAY", old.day);
        if (!held) {
          await ctx.db.insert("clarityFigures", { companyWebsiteId: old.companyWebsiteId, span: "DAY", key: old.day, part: 0, from: old.day, to: old.day, days: recorded(site) ? 1 : 0, pages: packTotals([]), site: packTotals(site), builtAt: Date.now() });
          converted += 1;
        }
        const newest = touched.get(old.companyWebsiteId);
        if (!newest || old.day > newest) touched.set(old.companyWebsiteId, old.day);
      }
      await ctx.db.delete(old._id);
    }
    for (const [holdId, day] of touched) await ctx.scheduler.runAfter(0, internal.clarity.rebuildFigures, { holdId, day });
    const more = batch.length === 60;
    if (more) await ctx.scheduler.runAfter(0, internal.clarity.convertOldDays, {});
    return { converted, more };
  },
});
