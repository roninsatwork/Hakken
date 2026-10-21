import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { adminAction, tenantMutation, tenantQuery } from "./tenantFunctions";
import { getActiveCompanyId } from "./authz";
import { companyHolds, requireMySite } from "./siteAccess";
import { appError } from "./utils/appError";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { clarityKindValidator } from "./claritySchema";
import {
  addTotals,
  clarityAnswerCut,
  clarityOriginFrom,
  clarityTotalsFrom,
  clarityTotalsRowValidator,
  emptyTotals,
  rowOf,
  totalsKey,
  type ClarityAsk,
  type ClarityTotals,
  type ClarityTotalsRow,
} from "./utils/clarityRows";
import { addUpBy, packDaily, packTotals, unpackDaily, unpackDailyRows, unpackTotals, type ClarityDayRow } from "./utils/clarityPacks";
import { clarityRecordingKindValidator, clarityRecordingValidator, clarityRecordingsFrom, projectIdOf, type ClarityRecording, type ClarityRecordingKind } from "./utils/clarityRecordings";
import { shiftDay } from "./utils/insightFacts";
import { CALENDAR_PERIODS, OPENING_PERIOD, periodSpan, shiftMonths, spanBefore, ukDay, type CalendarPeriod } from "./utils/calendarPeriods";

/**
 * Microsoft Clarity, connected and read (docs/plans/active/insights-analyst-plan.md
 * §7b, I24, I27, phase 15). A company admin pastes the project's Data Export
 * token; it is tested with one ask and kept as ciphertext. Each morning the
 * Microsoft Clarity: Collector Agent (`clarityAgentRun.ts`) asks for the last
 * day — by page and device, and by device across the website, then the same
 * by source and by browser — and picks a few recordings, within the
 * project's ten asks a day; each day is kept, since Clarity keeps three.
 *
 * Kept as docs/plans/active/agents-and-clarity-plan.md, Part 0 has it: one
 * packed record a day (`clarityFigures`), totals not averages, and the 7, 30
 * and 90 days the screens read worked out once each morning, so a screen reads
 * one record where it added up as many as 180.
 */

const EXPORT_URL = "https://www.clarity.ms/export-data/api/v1/project-live-insights";
/**
 * Clarity's recordings, as Microsoft's own Clarity connector lists them
 * (github.com/microsoft/clarity-mcp-server): the same Data Export token, a
 * filter and a sort. Microsoft does not say whether these asks count against
 * the export's ten a day, so the Collector counts them as if they do.
 */
const RECORDINGS_URL = "https://clarity.microsoft.com/mcp/recordings/sample";
/** Days kept day by day: twice the longest any screen shows, so the 90 days can be set against the 90 before ("Finishing Parts 3 and 4", decision 3). */
export const CLARITY_DAYS_KEPT = 180;
/** A day's sources and browsers are kept the 90 days a screen shows: no comparison reads them. */
export const CLARITY_SPLIT_DAYS_KEPT = 90;
/** Recordings picked are kept 30 days, as Clarity keeps its recordings: past it, the link no longer plays. */
export const CLARITY_RECORDING_DAYS_KEPT = 30;
/**
 * Months kept as months: 13 (Anthony, 2026-10-12, "13 is good"), enough to set a
 * month against the same month a year before — the counting check's second witness.
 */
export const CLARITY_MONTHS_KEPT = 13;
/**
 * The ready-made periods the screens read: each calendar period of the date
 * menu (`PERIOD`, keyed by the period: "lastMonth") and what it is set against
 * (`PERIOD_BEFORE`), worked out each morning (calendar-periods-plan.md, phase
 * 3). The 7, 30 and 90 days before them (`LAST_*`, `BEFORE_*`) are no longer
 * built; those kept wait to be cleared on Anthony's word.
 */
type Span = "DAY" | "MONTH" | "PERIOD" | "PERIOD_BEFORE";
/** A record's kind: the day's or period's own figures (none), or the visits by source or by browser. */
export type ClarityKind = Doc<"clarityFigures">["kind"];
const SPLIT_KINDS = ["SOURCES", "BROWSERS"] as const;
/**
 * Pages a record holds at most: a period's pages beyond it go in further parts
 * of the same period, so no record nears Convex's 1 MiB however many pages a
 * website has (about 200 KB at this many, measured 2026-10-16).
 */
export const CLARITY_PART_ROWS = 4_000;
/**
 * A day's pages a part: its rows — at most Clarity's 1,000 an answer — in
 * four or so parts, so a page's own screen reads a day's part holding that
 * page rather than the whole day, for each of 90 days.
 */
export const CLARITY_DAY_PART_ROWS = 250;
/** Parts of one span and kind read or replaced at once: at 4,000 rows a part, a million rows. */
const PARTS_READ = 256;

/** Rows in the pages' order — then the device's, then the source's or browser's — so one page's rows sit together. */
const byPage = (left: ClarityTotalsRow, right: ClarityTotalsRow) => (left.page ?? "").localeCompare(right.page ?? "") || left.device.localeCompare(right.device) || (left.split ?? "").localeCompare(right.split ?? "");

/** Rows cut into parts of about `size`, in the pages' order, never cutting one page's rows in two. */
export function pageParts(rows: readonly ClarityTotalsRow[], size: number): ClarityTotalsRow[][] {
  const sorted = [...rows].sort(byPage);
  const parts: ClarityTotalsRow[][] = [];
  let part: ClarityTotalsRow[] = [];
  for (const row of sorted) {
    if (part.length >= size && part[part.length - 1].page !== row.page) {
      parts.push(part);
      part = [];
    }
    part.push(row);
  }
  if (part.length > 0) parts.push(part);
  return parts;
}

/**
 * One page's rows of a record — a day's, or a period's of a kind — read from
 * the part that holds them alone: the part whose first page is the last at or
 * before it. A record kept whole before 2026-10-16 is its first part.
 */
export async function readPageRows(ctx: Reader, holdId: Id<"companyWebsites">, span: Span, kind: ClarityKind, key: string, page: string): Promise<ClarityTotalsRow[]> {
  const part = await ctx.db.query("clarityFigures")
    .withIndex("by_hold_span_kind_key_page", (q) => q.eq("companyWebsiteId", holdId).eq("span", span).eq("kind", kind).eq("key", key).lte("firstPage", page))
    .order("desc")
    .first();
  return part ? unpackTotals(part.pages).filter((row) => row.page === page) : [];
}

type Reader = { db: QueryCtx["db"] };
type Failure = { ok: false; status: number; problem: string };

/** One ask of Clarity's export: the last 1, 2 or 3 days together, split as asked. Each counts against the project's ten a day. */
export async function askClarity(token: string, dimension: ClarityAsk, days = 1): Promise<{ ok: true; rows: ClarityTotalsRow[]; origin: string | null; cut: boolean } | Failure> {
  let response: Response;
  try {
    const dimensions = dimension.split(",").map((name, at) => `&dimension${at + 1}=${name}`).join("");
    response = await fetch(`${EXPORT_URL}?numOfDays=${days}${dimensions}`, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(30_000) });
  } catch {
    return { ok: false, status: 0, problem: "Clarity could not be reached." };
  }
  if (!response.ok) return await failureOf(response);
  const json: unknown = await response.json();
  return { ok: true, rows: clarityTotalsFrom(json, dimension), origin: dimension.startsWith("URL") ? clarityOriginFrom(json) : null, cut: clarityAnswerCut(json) };
}

async function failureOf(response: Response): Promise<Failure> {
  const text = await response.text().catch(() => "");
  return { ok: false, status: response.status, problem: response.status === 401 || response.status === 403 ? "Clarity refused the token: generate a new one in Clarity's Settings → Data Export." : response.status === 429 ? "Clarity's ten asks a day are used up for today." : `Clarity answered ${response.status}. ${text.slice(0, 200)}` };
}

/** What each kind of recording is asked for: Clarity's filter, and its sort — the newest first, the longest for the longest reads. */
const RECORDING_ASKS: Record<ClarityRecordingKind, { filters: Record<string, unknown>; sortBy: number }> = {
  ERRORS: { filters: { javascriptErrors: [""] }, sortBy: 0 },
  ERROR_CLICKS: { filters: { clickErrors: [""] }, sortBy: 0 },
  RAGE: { filters: { rageClickPresent: true }, sortBy: 0 },
  DEAD: { filters: { deadClickPresent: true }, sortBy: 0 },
  QUICK_BACK: { filters: { quickbackClickPresent: true }, sortBy: 0 },
  LONGEST: { filters: {}, sortBy: 3 },
};

/** One ask of Clarity's recordings: a kind's recordings over the hours given, the few asked for. */
export async function askRecordings(token: string, kind: ClarityRecordingKind, window: { start: number; end: number }, count: number): Promise<{ ok: true; recordings: ClarityRecording[] } | Failure> {
  const start = new Date(window.start).toISOString();
  const end = new Date(window.end).toISOString();
  const ask = RECORDING_ASKS[kind];
  let response: Response;
  try {
    response = await fetch(RECORDINGS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sortBy: ask.sortBy, start, end, filters: { ...ask.filters, date: { start, end } }, count }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return { ok: false, status: 0, problem: "Clarity's recordings could not be reached." };
  }
  if (!response.ok) return await failureOf(response);
  return { ok: true, recordings: clarityRecordingsFrom(await response.json(), kind) };
}

/** A span's records of a kind, newest first: a period's parts, or one day's or month's record. */
async function recordsOf(ctx: Reader, holdId: Id<"companyWebsites">, span: Span, kind: ClarityKind, key?: string): Promise<Array<Doc<"clarityFigures">>> {
  return await ctx.db.query("clarityFigures")
    .withIndex("by_hold_span_kind_key", (q) => (key === undefined ? q.eq("companyWebsiteId", holdId).eq("span", span).eq("kind", kind) : q.eq("companyWebsiteId", holdId).eq("span", span).eq("kind", kind).eq("key", key)))
    .order("desc")
    .take(PARTS_READ);
}

/** The ready-made span a screen reads: the period chosen, or what it is set against. */
export const periodSpanName = (before = false): "PERIOD" | "PERIOD_BEFORE" => (before ? "PERIOD_BEFORE" : "PERIOD");

export type ClarityPeriodRead = { first: Doc<"clarityFigures">; pages: ClarityTotalsRow[] };

/**
 * A ready-made period of a kind, as kept: its first part, which carries the
 * website's figures (and, for the period's own figures, its days), and every
 * part's pages, unpacked. Nothing adds up days when it is read.
 */
export async function readClarityPeriod(ctx: Reader, holdId: Id<"companyWebsites">, period: CalendarPeriod, options: { kind?: ClarityKind; before?: boolean; withPages?: boolean } = {}): Promise<ClarityPeriodRead | null> {
  const span = periodSpanName(options.before);
  // The first parts of the period's kinds: one each a kind, read alone so the website's figures never read a page.
  const firsts = await ctx.db.query("clarityFigures").withIndex("by_hold_span_part", (q) => q.eq("companyWebsiteId", holdId).eq("span", span).eq("part", 0).eq("key", period)).take(SPLIT_KINDS.length + 2);
  const first = firsts.find((record) => record.kind === options.kind);
  if (!first) return null;
  if (options.withPages === false) return { first, pages: [] };
  const parts = (await recordsOf(ctx, holdId, span, options.kind, first.key)).filter((part) => part.part > 0).sort((a, b) => a.part - b.part);
  return { first, pages: parts.flatMap((part) => unpackTotals(part.pages)) };
}

/**
 * The period's own figures, read by the screens and by Insights: its first
 * part and, unless left out, every page — as Insights has read them since
 * Part 0 (insightsConversion.ts, insightsPeriod.ts).
 */
export async function clarityPeriod(ctx: Reader, holdId: Id<"companyWebsites">, period: CalendarPeriod, withPages = true): Promise<ClarityPeriodRead | null> {
  return await readClarityPeriod(ctx, holdId, period, { withPages });
}

/** A record's website totals, every device added up. */
const siteTotals = (record: Doc<"clarityFigures">): ClarityTotals => unpackTotals(record.site).reduce((sum, row) => addTotals(sum, row), emptyTotals());

/** The website's figures a day for a period's charts, across every device or on one, as the screens and Insights read them. */
export function clarityDays(record: Doc<"clarityFigures">, device?: string): Array<{ day: string; totals: ClarityTotals }> {
  return record.daily ? unpackDaily(record.daily, device) : [];
}

/** The website's Clarity connection, as its screens show it: never the token. */
export const clarityStatus = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.object({
    host: v.string(),
    owned: v.boolean(),
    ownSites: v.array(v.object({ siteId: v.id("companyWebsites"), host: v.string() })),
    connection: v.union(v.null(), v.object({ status: v.string(), projectName: v.union(v.string(), v.null()), projectId: v.union(v.string(), v.null()), origin: v.union(v.string(), v.null()), problem: v.union(v.string(), v.null()), newestDay: v.union(v.string(), v.null()), oldestDay: v.union(v.string(), v.null()), lastCollectedAt: v.union(v.number(), v.null()), asksToday: v.number() })),
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
      connection: row ? { status: row.status, projectName: row.projectName ?? null, projectId: row.projectId ?? null, origin: row.origin ?? null, problem: row.problem ?? null, newestDay: row.newestDay ?? null, oldestDay: row.oldestDay ?? null, lastCollectedAt: row.lastCollectedAt ?? null, asksToday: row.asks?.day === new Date().toISOString().slice(0, 10) ? row.asks.used : 0 } : null,
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
      // The opening period, as every section's front page shows it (calendar-periods-plan.md, rule 7).
      const period = row ? await clarityPeriod(ctx, entry.hold._id, OPENING_PERIOD, false) : null;
      const whole = period ? rowOf("all", siteTotals(period.first)) : null;
      out.push({ siteId: entry.hold._id, host: entry.summary.host, status: row?.status ?? "NOT_CONNECTED", sessions: row ? whole?.sessions ?? 0 : null, scroll: whole?.scroll ?? null, lastCollectedAt: row?.lastCollectedAt ?? null });
    }
    return out;
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
    // The test ask was one of today's ten; then the Collector's first run for this website (agents-and-clarity-plan.md, CC6).
    await ctx.runMutation(internal.clarityAgentRun.countAsks, { holdId: args.siteId, asks: 1 });
    await ctx.runMutation(internal.clarityAgentRun.startFirstCollection, { holdId: args.siteId });
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

/** Whether Clarity recorded anything that day: a visit by a person or a bot. */
const recorded = (site: readonly ClarityTotalsRow[]) => site.some((row) => row.visits + row.bots > 0);

const splitAnswerValidator = v.object({ site: v.array(clarityTotalsRowValidator), pages: v.array(clarityTotalsRowValidator), cut: v.optional(v.boolean()) });

/** A day's records of a kind kept, in place of any kept before: the website's figures, then its pages in parts. */
async function keepDay(ctx: MutationCtx, holdId: Id<"companyWebsites">, day: string, kind: ClarityKind, rows: { site: readonly ClarityTotalsRow[]; pages: readonly ClarityTotalsRow[]; cut?: boolean }, now: number) {
  for (const held of await recordsOf(ctx, holdId, "DAY", kind, day)) await ctx.db.delete(held._id);
  const common = { companyWebsiteId: holdId, span: "DAY" as const, ...(kind ? { kind } : {}), key: day, from: day, to: day, days: recorded(rows.site) ? 1 : 0, builtAt: now };
  await ctx.db.insert("clarityFigures", { ...common, ...(rows.cut ? { cut: true } : {}), part: 0, pages: packTotals([]), site: packTotals(rows.site) });
  for (const [at, part] of pageParts(rows.pages, CLARITY_DAY_PART_ROWS).entries()) {
    await ctx.db.insert("clarityFigures", { ...common, part: at + 1, firstPage: part[0].page ?? "", pages: packTotals(part), site: packTotals([]) });
  }
}

/**
 * A morning's answers kept as the day's records — its own figures, and the
 * sources and browsers when they were asked — then the month and the periods
 * worked out from the days (`rebuildFigures`), each in its own step.
 */
export const saveDay = internalMutation({
  args: {
    holdId: v.id("companyWebsites"),
    day: v.string(),
    pages: v.union(v.array(clarityTotalsRowValidator), v.null()),
    site: v.union(v.array(clarityTotalsRowValidator), v.null()),
    /** The day's pages were cut at Clarity's 1,000 rows, even after asking for them without their devices. */
    pagesCut: v.optional(v.boolean()),
    sources: v.optional(splitAnswerValidator),
    browsers: v.optional(splitAnswerValidator),
    origin: v.optional(v.string()),
    problem: v.union(v.string(), v.null()),
    refused: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const connection = await ctx.db.query("clarityConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first();
    if (!connection) return null;
    const saved = Boolean(args.pages || args.site);
    if (saved) {
      await keepDay(ctx, args.holdId, args.day, undefined, { site: args.site ?? [], pages: args.pages ?? [], cut: args.pagesCut }, now);
      if (args.sources) await keepDay(ctx, args.holdId, args.day, "SOURCES", args.sources, now);
      if (args.browsers) await keepDay(ctx, args.holdId, args.day, "BROWSERS", args.browsers, now);
    }
    const newestDay = saved && (!connection.newestDay || connection.newestDay < args.day) ? args.day : connection.newestDay;
    await ctx.db.patch(connection._id, {
      ...(args.refused ? { status: "NEEDS_RECONNECT" as const } : {}),
      problem: args.problem ?? undefined,
      ...(args.origin ? { origin: args.origin } : {}),
      ...(saved ? { newestDay, oldestDay: connection.oldestDay && connection.oldestDay < args.day ? connection.oldestDay : args.day, lastCollectedAt: now } : {}),
      updatedAt: now,
    });
    if (saved) await ctx.scheduler.runAfter(0, internal.clarity.rebuildFigures, { holdId: args.holdId, day: args.day });
    return null;
  },
});

/**
 * The recordings picked for a day kept, in place of those of the same kinds
 * picked for it before, and Clarity's id for the project, read from their
 * links, kept with the connection.
 */
export const saveRecordings = internalMutation({
  args: { holdId: v.id("companyWebsites"), day: v.string(), kinds: v.array(clarityRecordingKindValidator), recordings: v.array(clarityRecordingValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const kinds = new Set(args.kinds);
    for (const held of await ctx.db.query("clarityRecordings").withIndex("by_hold_day", (q) => q.eq("companyWebsiteId", args.holdId).eq("day", args.day)).take(200)) {
      if (kinds.has(held.kind)) await ctx.db.delete(held._id);
    }
    for (const recording of args.recordings) await ctx.db.insert("clarityRecordings", { companyWebsiteId: args.holdId, day: args.day, ...recording, createdAt: now });
    const projectId = args.recordings.map((recording) => projectIdOf(recording.link)).find((id) => id !== null);
    const connection = projectId ? await ctx.db.query("clarityConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first() : null;
    if (connection && projectId && connection.projectId !== projectId) await ctx.db.patch(connection._id, { projectId, updatedAt: now });
    return null;
  },
});

const spanValidator = v.union(v.literal("MONTH"), v.literal("PERIOD"), v.literal("PERIOD_BEFORE"));

/**
 * After a day is kept: its month of each kind, the seven calendar periods of
 * each kind and what each is set against, and what is past keeping, each its
 * own step so none reads more than it needs. A period Clarity has sent none of
 * yet — This week on a Monday — is cleared, so its screens say so.
 */
export const rebuildFigures = internalMutation({
  args: { holdId: v.id("companyWebsites"), day: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.query("clarityConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first();
    const newest = connection?.newestDay;
    if (!newest) return null;
    const month = args.day.slice(0, 7);
    // Sources and browsers keep months too, so a year's are read from them once their days are past keeping.
    for (const kind of [undefined, ...SPLIT_KINDS]) {
      await ctx.scheduler.runAfter(0, internal.clarity.buildSpan, { holdId: args.holdId, span: "MONTH", ...(kind ? { kind } : {}), key: month, from: `${month}-01`, to: `${month}-31` });
    }
    const today = ukDay();
    for (const period of CALENDAR_PERIODS) {
      const span = periodSpan(period, today, newest);
      // None of it sent yet: an empty span clears what was kept for it.
      const days = span ?? { from: shiftDay(newest, 1), to: newest };
      for (const kind of [undefined, ...SPLIT_KINDS]) {
        await ctx.scheduler.runAfter(0, internal.clarity.buildSpan, { holdId: args.holdId, span: "PERIOD", ...(kind ? { kind } : {}), key: period, from: days.from, to: days.to });
      }
      // The comparisons read the period's own figures only: no sources or browsers before.
      const before = span ? spanBefore(period, span) : days;
      await ctx.scheduler.runAfter(0, internal.clarity.buildSpan, { holdId: args.holdId, span: "PERIOD_BEFORE", key: period, from: before.from, to: before.to });
    }
    await ctx.scheduler.runAfter(0, internal.clarity.tidyFigures, { holdId: args.holdId });
    return null;
  },
});

/**
 * The records a period's span is added up from: each day held, and — for a
 * whole month whose days are past keeping (180 days, sources and browsers 90)
 * — its month instead. A month the span cuts whose days are gone is left out,
 * so the span counts fewer days than it covers and its comparison is not shown
 * (`readBefore`: like is set against like).
 */
async function spanRecords(ctx: Reader, holdId: Id<"companyWebsites">, kind: ClarityKind, from: string, to: string, newest: string): Promise<Array<Doc<"clarityFigures">>> {
  const floor = shiftDay(newest, -((kind ? CLARITY_SPLIT_DAYS_KEPT : CLARITY_DAYS_KEPT) - 1));
  const out: Array<Doc<"clarityFigures">> = [];
  for (let first = `${from.slice(0, 7)}-01`; first <= to; first = shiftMonths(first, 1)) {
    const last = shiftDay(shiftMonths(first, 1), -1);
    if (first < floor && from <= first && to >= last) {
      const month = await recordsOf(ctx, holdId, "MONTH", kind, first.slice(0, 7));
      if (month.length > 0) {
        out.push(...month);
        continue;
      }
    }
    const a = from > first ? from : first;
    const b = to < last ? to : last;
    out.push(...await ctx.db.query("clarityFigures")
      .withIndex("by_hold_span_kind_key", (q) => q.eq("companyWebsiteId", holdId).eq("span", "DAY").eq("kind", kind).gte("key", a).lte("key", b))
      .take(32 * 8));
  }
  return out;
}

/**
 * Days' records added up into one span: every page on every device (and
 * source or browser), every device across the website, and the website a day
 * on each device.
 */
export function addUpDays(days: ReadonlyArray<Doc<"clarityFigures">>): { pages: ClarityTotalsRow[]; site: ClarityTotalsRow[]; daily: ClarityDayRow[]; recorded: number; pageDays: number; pagesFrom: string | null; cutDays: number } {
  const pages = new Map<string, ClarityTotalsRow>();
  const withPages = new Set<string>();
  // A month's record stands in for its days (`spanRecords`): its days with pages, and the first, as it kept them.
  let monthPageDays = 0;
  let monthPagesFrom: string | null = null;
  const site = new Map<string, ClarityTotalsRow>();
  const daily: ClarityDayRow[] = [];
  const into = (map: Map<string, ClarityTotalsRow>, row: ClarityTotalsRow) => {
    const key = totalsKey(row);
    const held = map.get(key);
    if (held) addTotals(held, row);
    else map.set(key, { ...row });
  };
  // A day's parts: its website's figures in the first, its pages in the rest (or all in one, kept before 2026-10-16).
  for (const part of [...days].sort((a, b) => a.key.localeCompare(b.key) || a.part - b.part)) {
    const month = part.span === "MONTH";
    for (const row of unpackTotals(part.pages)) {
      into(pages, row);
      if (!month) withPages.add(part.key);
    }
    if (part.part !== 0) continue;
    const devices = unpackTotals(part.site);
    for (const row of devices) into(site, row);
    if (month) {
      daily.push(...(part.daily ? unpackDailyRows(part.daily) : []));
      monthPageDays += part.pageDays ?? part.days;
      const from = part.pagesFrom ?? part.from;
      if (monthPagesFrom === null || from < monthPagesFrom) monthPagesFrom = from;
      continue;
    }
    for (const [device, totals] of addUpBy(devices, (row) => row.device)) daily.push({ day: part.key, device, totals });
  }
  const firstDay = [...withPages].sort()[0] ?? null;
  return {
    pages: [...pages.values()].sort((a, b) => b.visits - a.visits),
    site: [...site.values()].sort((a, b) => b.visits - a.visits),
    daily: daily.sort((a, b) => a.day.localeCompare(b.day)),
    recorded: days.reduce((sum, part) => sum + (part.part === 0 ? part.days : 0), 0),
    pageDays: withPages.size + monthPageDays,
    pagesFrom: monthPagesFrom !== null && (firstDay === null || monthPagesFrom < firstDay) ? monthPagesFrom : firstDay,
    cutDays: days.reduce((sum, part) => sum + (part.part !== 0 ? 0 : part.span === "MONTH" ? part.cutDays ?? 0 : part.cut ? 1 : 0), 0),
  };
}

/** One month or period of a kind worked out from its days and kept in place of the last: the website's figures (and its days) as part 0, then its pages in parts of `CLARITY_PART_ROWS`. */
export const buildSpan = internalMutation({
  args: { holdId: v.id("companyWebsites"), span: spanValidator, kind: v.optional(clarityKindValidator), key: v.string(), from: v.string(), to: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const old = await recordsOf(ctx, args.holdId, args.span, args.kind, args.key);
    const connection = await ctx.db.query("clarityConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first();
    const newest = connection?.newestDay;
    if (args.span === "MONTH" && old.length > 0) {
      // A month whose first days are past keeping day by day is left as it was worked out, never redone from what is left of it.
      if (newest && args.from < shiftDay(newest, -((args.kind ? CLARITY_SPLIT_DAYS_KEPT : CLARITY_DAYS_KEPT) - 1))) return null;
    }
    // A month from its days; a period from its days held and the months whose days are past keeping. Each day's parts: a few each, at most Clarity's 1,000 rows a day between them.
    const days = args.span === "MONTH" || !newest
      ? await ctx.db.query("clarityFigures")
        .withIndex("by_hold_span_kind_key", (q) => q.eq("companyWebsiteId", args.holdId).eq("span", "DAY").eq("kind", args.kind).gte("key", args.from).lte("key", args.to))
        .take(32 * 8)
      : await spanRecords(ctx, args.holdId, args.kind, args.from, args.to, newest);
    for (const record of old) await ctx.db.delete(record._id);
    if (days.length === 0) return null;
    const summed = addUpDays(days);
    const builtAt = Date.now();
    // A month's record covers its own days: its first and last held, not its key.
    const from = days.reduce((first, day) => (day.from < first ? day.from : first), days[0].from);
    const to = days.reduce((last, day) => (day.to > last ? day.to : last), days[0].to);
    const common = { companyWebsiteId: args.holdId, span: args.span, ...(args.kind ? { kind: args.kind } : {}), key: args.key, from, to, days: summed.recorded, builtAt };
    // Said only where fewer days hold pages than hold figures.
    const pagesHeld = summed.pageDays < summed.recorded ? { pageDays: summed.pageDays, ...(summed.pagesFrom ? { pagesFrom: summed.pagesFrom } : {}) } : {};
    // The website's figures and its days on their own, so Overview and Insights read a few kilobytes however many pages there are.
    await ctx.db.insert("clarityFigures", { ...common, ...pagesHeld, ...(summed.cutDays > 0 ? { cutDays: summed.cutDays } : {}), part: 0, pages: packTotals([]), site: packTotals(summed.site), ...(args.kind ? {} : { daily: packDaily(summed.daily) }) });
    for (const [at, part] of pageParts(summed.pages, CLARITY_PART_ROWS).entries()) {
      await ctx.db.insert("clarityFigures", { ...common, part: at + 1, firstPage: part[0].page ?? "", pages: packTotals(part), site: packTotals([]) });
    }
    return null;
  },
});

/**
 * What is past keeping, a few at a time — each morning catches up: days older
 * than 180 (their month is kept), sources and browsers by day older than 90,
 * months older than 13, and recordings older than 30 days.
 */
export const tidyFigures = internalMutation({
  args: { holdId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.query("clarityConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first();
    const newest = connection?.newestDay;
    if (!newest) return null;
    const pastKeeping = async (kind: ClarityKind, kept: number) => await ctx.db.query("clarityFigures")
      .withIndex("by_hold_span_kind_key", (q) => q.eq("companyWebsiteId", args.holdId).eq("span", "DAY").eq("kind", kind).lt("key", shiftDay(newest, -(kept - 1))))
      .take(60);
    const days = [...(await pastKeeping(undefined, CLARITY_DAYS_KEPT)), ...(await pastKeeping("SOURCES", CLARITY_SPLIT_DAYS_KEPT)), ...(await pastKeeping("BROWSERS", CLARITY_SPLIT_DAYS_KEPT))];
    for (const day of days) await ctx.db.delete(day._id);
    const [year, monthNumber] = newest.slice(0, 7).split("-").map(Number);
    const firstKept = new Date(Date.UTC(year, monthNumber - 1 - (CLARITY_MONTHS_KEPT - 1), 1)).toISOString().slice(0, 7);
    for (const kind of [undefined, ...SPLIT_KINDS]) {
      const months = await ctx.db.query("clarityFigures").withIndex("by_hold_span_kind_key", (q) => q.eq("companyWebsiteId", args.holdId).eq("span", "MONTH").eq("kind", kind).lt("key", firstKept)).take(10);
      for (const month of months) await ctx.db.delete(month._id);
    }
    const recordings = await ctx.db.query("clarityRecordings").withIndex("by_hold_day", (q) => q.eq("companyWebsiteId", args.holdId).lt("day", shiftDay(newest, -(CLARITY_RECORDING_DAYS_KEPT - 1)))).take(50);
    for (const recording of recordings) await ctx.db.delete(recording._id);
    return null;
  },
});
