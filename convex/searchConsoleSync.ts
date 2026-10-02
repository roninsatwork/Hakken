import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { appError } from "./utils/appError";
import { accessTokenFor, type ConnectionProblem } from "./searchConsoleConnect";
import { GOOGLE_DIMENSIONS, LISTS_OF, queryAnalytics, type AnalyticsRow, type GoogleFailure } from "./searchConsoleApi";
import {
  SEARCH_TYPES,
  listValidator,
  searchTypeValidator,
  type SearchConsoleGrain,
  type SearchConsoleList,
  type SearchType,
} from "./searchConsoleSchema";
import { daysNewestFirst, newestWholeDay, shiftDay } from "./searchConsoleDays";
import { isTrackedHold } from "./utils/websitePairing";
import {
  addUp,
  firstDayKept,
  firstWeekKept,
  fromGoogle,
  monthStart,
  pack,
  rowsOf,
  weekStart,
  DAYS_KEPT,
  type Packed,
} from "./utils/searchConsolePacks";

/**
 * Collecting a connected site's Search Console figures, and keeping them as
 * the screens read them (docs/plans/active/search-console-plan.md §14).
 *
 * **Started only by the Search Console Collector** (§12): each website's own
 * run (`searchConsoleAgentRun.ts`) runs the steps here. Nothing is collected
 * on connecting, and nothing on a hidden job.
 *
 * **What a run fetches**: the days since the newest held and the last four
 * again — Google's figures settle over two to three days — so a day is
 * replaced until it is final. A website with no days held yet gets its last
 * 90 days, a week a step (§14.3, item 7). Nothing older, ever.
 *
 * **Three asks a day for each kind of result** (§14.3, item 1): the totals by
 * date; each search with the page it brought people to (a pair); each page —
 * plus countries, devices and kinds of search appearance. A search's own
 * totals are added up from its pairs, never asked apart. A page is asked
 * apart because Google folds the rare searches it hides into a page's
 * totals.
 *
 * **Kept packed** (§14.3, item 2): one record per website, kind of result,
 * list and day, in parts of 2,000 rows (`utils/searchConsolePacks.ts`). Days
 * past 90 roll into their week, weeks past 12 months into their month; the
 * website's totals by day stay as days.
 *
 * Every write names the connection and the property it was fetched for, and
 * is dropped if either changed while the step ran: two properties' figures
 * are never mixed, and a disconnected site's figures stop where they were.
 */

/** Days fetched again each day, until Google's figures for them settle. */
const REFETCH_DAYS = 4;

/** Days in one step of a collection. */
const DAYS_PER_STEP = 7;

/** A step stops starting new days after this, and hands the rest to the next step. */
export const STEP_BUDGET_MS = 4 * 60 * 1000;

/** Asks to Google at once for one site; its limit is 1,200 a minute a site. */
const PARALLEL_ASKS = 4;

/** Waits before asking a busy Google again, within a step. */
const BUSY_WAITS_MS = [2_000, 8_000];

/** Records removed per mutation when a site's figures are cleared: a kept list's record can be large. */
const PURGE_BATCH = 20;
const PURGE_ROWS = 500;

/** Keys noted as seen per mutation. */
const SEEN_CHUNK = 500;

/** Days rolled into weeks, or weeks into months, per site run at most; the rest roll next run. */
export const ROLLUPS_PER_RUN = 200;

const kindValidator = v.union(v.literal("DAILY"), v.literal("HISTORY"));
const figuresValidator = { clicks: v.number(), impressions: v.number(), ctr: v.number(), position: v.number() };

type Figures = { clicks: number; impressions: number; ctr: number; position: number };

const figuresOf = (row: AnalyticsRow): Figures => ({
  clicks: row.clicks,
  impressions: row.impressions,
  ctr: row.ctr,
  position: row.position,
});

const laterDay = (left: string, right: string) => (left > right ? left : right);

const packedValidator = {
  keys: v.array(v.string()),
  pages: v.optional(v.array(v.string())),
  clicks: v.array(v.number()),
  impressions: v.array(v.number()),
  positionSums: v.array(v.number()),
};

// ---------------------------------------------------------------------------
// What a run fetches
// ---------------------------------------------------------------------------

/**
 * The days a run fetches: from the newest held, and the last four again, up
 * to Google's newest whole day — or, with none held yet, the last 90 days
 * (§14.3, item 7). Never further back than the days kept as days.
 */
export function recentWindow(newestDay: string | undefined, now: number): { from: string; top: string } {
  const top = newestWholeDay(now);
  const oldest = shiftDay(top, -(DAYS_KEPT - 1));
  if (!newestDay) return { from: oldest, top };
  const newest = newestDay < top ? newestDay : top;
  return { from: laterDay(oldest, shiftDay(newest, -(REFETCH_DAYS - 1))), top };
}

/**
 * What the Search Console Collector's run collects (§12): every connected
 * website, with its recent days — the one longest since it was collected
 * first, so one a run did not reach goes first in the next.
 */
/** Connections read per page when listing every connected website. */
const CONNECTIONS_PER_READ = 500;

export const agentCollections = internalQuery({
  args: {},
  returns: v.array(v.object({
    connectionId: v.id("searchConsoleConnections"),
    companyId: v.id("companies"),
    host: v.string(),
    property: v.string(),
    from: v.string(),
    top: v.string(),
  })),
  handler: async (ctx) => {
    // One row per owned website at most: every connected one, a page at a time.
    const connected: Doc<"searchConsoleConnections">[] = [];
    for (let after = 0; ;) {
      const page = await ctx.db
        .query("searchConsoleConnections")
        .withIndex("by_status", (q) => q.eq("status", "CONNECTED").gt("_creationTime", after))
        .take(CONNECTIONS_PER_READ);
      connected.push(...page);
      if (page.length < CONNECTIONS_PER_READ) break;
      after = page[page.length - 1]._creationTime;
    }
    const now = Date.now();
    const out = [];
    for (const connection of connected.sort((left, right) => (left.lastCollectedAt ?? 0) - (right.lastCollectedAt ?? 0))) {
      if (!connection.property || connection.clearing) continue;
      const website = await ctx.db.get(connection.websiteId);
      out.push({
        connectionId: connection._id,
        companyId: connection.companyId,
        host: website?.displayHost ?? website?.host ?? connection.property,
        property: connection.property,
        ...recentWindow(connection.newestDay, now),
      });
    }
    return out;
  },
});

// ---------------------------------------------------------------------------
// One step
// ---------------------------------------------------------------------------

export const stepState = internalQuery({
  args: { connectionId: v.id("searchConsoleConnections") },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) return null;
    const hold = await ctx.db.get(connection.companyWebsiteId);
    return {
      status: connection.status,
      property: connection.property ?? null,
      clearing: connection.clearing === true,
      companyWebsiteId: connection.companyWebsiteId,
      owned: hold !== null && !isTrackedHold(hold),
      oldestDay: connection.oldestDay ?? null,
      newestDay: connection.newestDay ?? null,
    };
  },
});

type Session = {
  ctx: ActionCtx;
  connectionId: Id<"searchConsoleConnections">;
  accessToken: string;
  /** Set when renewing the token failed; the problem is already noted on the connection. */
  stopped: ConnectionProblem | null;
};

/**
 * Ask Google, renewing the token once if it has just expired and waiting a
 * little when Google is busy, before giving the failure back.
 */
async function ask<T extends { ok: true }>(
  session: Session,
  call: (accessToken: string) => Promise<T | GoogleFailure>,
): Promise<T | GoogleFailure> {
  let renewed = false;
  for (let wait = 0; ; ) {
    const answer = await call(session.accessToken);
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

/** Run each item, a few at a time. */
async function inTurns<T>(items: readonly T[], width: number, run: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await run(item);
    }
  }));
}

type StepArgs = {
  connectionId: Id<"searchConsoleConnections">;
  property: string;
  /** The oldest day this collection goes back to. */
  from: string;
  /** The newest day of the whole collection: what the held days reach once it is done. */
  top: string;
  /** The newest day of this step. */
  to: string;
};

/**
 * How a step ended. `DONE`: the collection reached its oldest day. `MORE`:
 * days are left, from `nextTo` down — the step covers a week at most, and
 * stops starting days at its time budget. `BUSY`: Google or the sign-in was
 * too busy. `NO_ACCESS`: the account can no longer read the property.
 * `STOPPED`: the sign-in failed, or Google answered with an error. `SKIPPED`:
 * the connection changed before the step began. `NOT_OWNED`: the website is
 * no longer the company's own. The connection carries any problem already.
 */
export type StepOutcome = {
  ended: "DONE" | "MORE" | "BUSY" | "NO_ACCESS" | "STOPPED" | "SKIPPED" | "NOT_OWNED";
  fromDay: string;
  toDay: string;
  processedFrom: string | null;
  nextTo: string;
  requests: number;
  rows: number;
  refused: string[];
  error: string | null;
};

/**
 * One step: up to a week of days, newest first — each kind of result's
 * totals for the step's days, then, day by day, each list of each kind that
 * had impressions, kept as one record a day. Says how it ended; the
 * Collector's run goes on from there (`searchConsoleAgentRun.ts`).
 */
export async function runStep(ctx: ActionCtx, args: StepArgs, budgetMs: number): Promise<StepOutcome> {
  const stepFrom = laterDay(args.from, shiftDay(args.to, -(DAYS_PER_STEP - 1)));
  const ended = (end: StepOutcome["ended"]): StepOutcome =>
    ({ ended: end, fromDay: stepFrom, toDay: args.to, processedFrom: null, nextTo: args.to, requests: 0, rows: 0, refused: [], error: null });
  const state = await ctx.runQuery(internal.searchConsoleSync.stepState, { connectionId: args.connectionId });
  if (!state || state.status !== "CONNECTED" || state.property !== args.property || state.clearing) return ended("SKIPPED");
  if (!state.owned) {
    await ctx.runMutation(internal.searchConsoleConnect.noteProblem, { connectionId: args.connectionId, problem: "NOT_OWNED" });
    return ended("NOT_OWNED");
  }

  const startedAt = Date.now();
  const runId = await ctx.runMutation(internal.searchConsoleSync.startRun, {
    connectionId: args.connectionId,
    companyWebsiteId: state.companyWebsiteId,
    kind: "DAILY",
    fromDay: stepFrom,
    toDay: args.to,
    startedAt,
  });
  const finish = async (processedFrom: string | null, error: string | null, counts: { requests: number; rows: number; refused: string[] }) =>
    await ctx.runMutation(internal.searchConsoleSync.finishStep, {
      connectionId: args.connectionId,
      property: args.property,
      runId,
      top: args.top,
      processedFrom,
      error,
      ...counts,
    });

  const token = await accessTokenFor(ctx, args.connectionId);
  if (!token.ok) {
    await finish(null, token.problem, { requests: 0, rows: 0, refused: [] });
    return { ...ended(token.problem === "GOOGLE_BUSY" ? "BUSY" : "STOPPED"), error: token.problem };
  }
  const session: Session = { ctx, connectionId: args.connectionId, accessToken: token.accessToken, stopped: null };
  const counts = { requests: 0, rows: 0, refused: [] as string[] };
  const where = {
    connectionId: args.connectionId,
    property: args.property,
    companyWebsiteId: state.companyWebsiteId,
  };
  const held = (day: string) => state.oldestDay !== null && state.newestDay !== null && day >= state.oldestDay && day <= state.newestDay;
  let failure: GoogleFailure | null = null;

  // Each kind of result's totals, a row a day: one ask covers the step.
  const totals = new Map<SearchType, Map<string, Figures>>();
  for (const type of SEARCH_TYPES) {
    const answer = await ask(session, (accessToken) => queryAnalytics(accessToken, args.property, {
      startDate: stepFrom,
      endDate: args.to,
      type,
      dimensions: ["date"],
    }));
    if (!answer.ok) {
      if (answer.reason === "REFUSED") {
        counts.refused.push(`${type}/date`);
        continue;
      }
      failure = answer;
      break;
    }
    counts.requests += answer.requests;
    totals.set(type, new Map(answer.rows.map((row) => [row.keys[0], figuresOf(row)])));
  }

  // Searches and pages seen in the step's web results: noted once for the step, not once a day.
  const seen = { query: new Map<string, { first: string; last: string }>(), page: new Map<string, { first: string; last: string }>() };
  const see = (kind: "query" | "page", key: string, day: string) => {
    const was = seen[kind].get(key);
    if (!was) seen[kind].set(key, { first: day, last: day });
    else {
      if (day < was.first) was.first = day;
      if (day > was.last) was.last = day;
    }
  };

  let processedFrom: string | null = null;
  for (const day of failure || session.stopped ? [] : daysNewestFirst(stepFrom, args.to)) {
    if (Date.now() - startedAt > budgetMs) break;
    const fetchedAt = Date.now();
    const again = held(day);
    const named = new Map<SearchType, number>();
    const asks: { type: SearchType; list: SearchConsoleList; shown: boolean }[] = [];
    for (const [type, byDay] of totals) {
      const shown = (byDay.get(day)?.impressions ?? 0) > 0;
      // A day fetched again drops what it no longer has, even when the kind now has nothing.
      if (!shown && !again) continue;
      for (const list of LISTS_OF[type]) asks.push({ type, list, shown });
    }
    await inTurns(asks, PARALLEL_ASKS, async ({ type, list, shown }) => {
      if (failure || session.stopped) return;
      let parts: Packed[] = pack([], list === "pair");
      if (shown) {
        const answer = await ask(session, (accessToken) => queryAnalytics(accessToken, args.property, {
          startDate: day,
          endDate: day,
          type,
          dimensions: [...GOOGLE_DIMENSIONS[list]],
        }));
        if (!answer.ok) {
          if (answer.reason === "REFUSED") counts.refused.push(`${type}/${list}`);
          else failure = answer;
          return;
        }
        counts.requests += answer.requests;
        counts.rows += answer.rows.length;
        const rows = fromGoogle(answer.rows, list === "pair");
        if (list === "pair") named.set(type, rows.reduce((sum, row) => sum + row.clicks, 0));
        if (type === "web" && list === "pair") for (const row of rows) see("query", row.key, day);
        if (type === "web" && list === "page") for (const row of rows) see("page", row.key, day);
        parts = pack(rows, list === "pair");
      }
      for (const [index, part] of parts.entries()) {
        await ctx.runMutation(internal.searchConsoleSync.writeList, {
          ...where,
          searchType: type,
          list,
          day,
          part: index,
          fetchedAt,
          ...part,
        });
      }
    });
    if (failure || session.stopped) break;
    await ctx.runMutation(internal.searchConsoleSync.writeDayTotals, {
      ...where,
      day,
      fetchedAt,
      types: [...totals.keys()],
      totals: [...totals].flatMap(([type, byDay]) => {
        const figures = byDay.get(day);
        const namedClicks = named.get(type);
        return figures ? [{ searchType: type, ...figures, ...(namedClicks === undefined ? {} : { namedClicks }) }] : [];
      }),
    });
    processedFrom = day;
  }

  for (const kind of ["query", "page"] as const) {
    const entries = [...seen[kind]].map(([key, days]) => ({ key, ...days }));
    for (let start = 0; start < entries.length; start += SEEN_CHUNK) {
      await ctx.runMutation(internal.searchConsoleSync.noteSeen, {
        ...where,
        kind,
        entries: entries.slice(start, start + SEEN_CHUNK),
      });
    }
  }

  const stoppedBy: GoogleFailure | null = failure;
  const error = session.stopped ?? (stoppedBy ? `${stoppedBy.reason} ${stoppedBy.status}: ${stoppedBy.detail}` : null);
  await finish(processedFrom, error, counts);
  const outcome = { fromDay: stepFrom, toDay: args.to, processedFrom, ...counts, error };
  const nextTo = processedFrom === null ? args.to : shiftDay(processedFrom, -1);

  if (stoppedBy?.reason === "ACCESS") {
    await ctx.runMutation(internal.searchConsoleConnect.noteProblem, { connectionId: args.connectionId, problem: "NO_ACCESS" });
    return { ...outcome, ended: "NO_ACCESS", nextTo };
  }
  const busy = session.stopped === "GOOGLE_BUSY" || stoppedBy?.reason === "BUSY" || stoppedBy?.reason === "UNREACHABLE";
  if (busy) {
    await ctx.runMutation(internal.searchConsoleConnect.noteProblem, { connectionId: args.connectionId, problem: "GOOGLE_BUSY" });
    return { ...outcome, ended: "BUSY", nextTo };
  }
  if (session.stopped || stoppedBy) return { ...outcome, ended: "STOPPED", nextTo };
  return { ...outcome, ended: nextTo >= args.from ? "MORE" : "DONE", nextTo };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

const whereArgs = {
  connectionId: v.id("searchConsoleConnections"),
  property: v.string(),
  companyWebsiteId: v.id("companyWebsites"),
};

/** Whether a write still belongs: the connection is there, on the property it was fetched for. */
async function stillCollecting(
  ctx: { db: MutationCtx["db"] },
  connectionId: Id<"searchConsoleConnections">,
  property: string,
) {
  const connection = await ctx.db.get(connectionId);
  return connection !== null && connection.property === property && connection.clearing !== true && connection.status === "CONNECTED";
}

export const startRun = internalMutation({
  args: {
    connectionId: v.id("searchConsoleConnections"),
    companyWebsiteId: v.id("companyWebsites"),
    kind: kindValidator,
    fromDay: v.string(),
    toDay: v.string(),
    startedAt: v.number(),
  },
  returns: v.id("searchConsoleRuns"),
  handler: async (ctx, args) => await ctx.db.insert("searchConsoleRuns", { ...args, requests: 0, rows: 0 }),
});

/**
 * A step's end: its run finished, and the days it brought joined to the days
 * held when they meet them. A collection works newest first without gaps, so
 * the days it has done so far are always one run of days down from its top.
 */
export const finishStep = internalMutation({
  args: {
    connectionId: v.id("searchConsoleConnections"),
    property: v.string(),
    runId: v.id("searchConsoleRuns"),
    top: v.string(),
    processedFrom: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
    requests: v.number(),
    rows: v.number(),
    refused: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.runId, {
      finishedAt: now,
      requests: args.requests,
      rows: args.rows,
      ...(args.refused.length > 0 ? { refused: args.refused } : {}),
      ...(args.error ? { error: args.error } : {}),
    });
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.property !== args.property || connection.clearing) return null;
    const patch: Partial<typeof connection> = { lastCollectedAt: now, updatedAt: now };
    if (!args.error) {
      patch.problem = undefined;
      patch.problemAt = undefined;
    }
    if (args.processedFrom !== null) {
      const from = args.processedFrom;
      if (!connection.newestDay || !connection.oldestDay) {
        patch.newestDay = args.top;
        patch.oldestDay = from;
      } else if (from <= shiftDay(connection.newestDay, 1)) {
        if (args.top > connection.newestDay) patch.newestDay = args.top;
        if (from < connection.oldestDay) patch.oldestDay = from;
      }
    }
    await ctx.db.patch(connection._id, patch);
    return null;
  },
});

/** A day's totals for the kinds that answered: kept, replaced, or gone when the kind had nothing. */
export const writeDayTotals = internalMutation({
  args: {
    ...whereArgs,
    day: v.string(),
    fetchedAt: v.number(),
    types: v.array(searchTypeValidator),
    totals: v.array(v.object({ searchType: searchTypeValidator, ...figuresValidator, namedClicks: v.optional(v.number()) })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await stillCollecting(ctx, args.connectionId, args.property))) return null;
    for (const type of args.types) {
      const existing = await ctx.db
        .query("searchConsoleDays")
        .withIndex("by_hold_type_day", (q) => q.eq("companyWebsiteId", args.companyWebsiteId).eq("searchType", type).eq("day", args.day))
        .unique();
      const fresh = args.totals.find((entry) => entry.searchType === type);
      if (!fresh) {
        if (existing) await ctx.db.delete(existing._id);
        continue;
      }
      const row = {
        clicks: fresh.clicks,
        impressions: fresh.impressions,
        ctr: fresh.ctr,
        position: fresh.position,
        namedClicks: fresh.namedClicks,
        fetchedAt: args.fetchedAt,
      };
      if (existing) await ctx.db.patch(existing._id, row);
      else await ctx.db.insert("searchConsoleDays", { companyWebsiteId: args.companyWebsiteId, searchType: type, day: args.day, ...row });
    }
    return null;
  },
});

/** A kept list's records for one slot: one day, week or month of one list. */
/**
 * The most parts one slot is read in: 2,000 rows each, so a million rows — a
 * week of pairs for a very large website is a few hundred thousand.
 */
export const PARTS_MOST = 500;

async function slotParts(
  ctx: { db: MutationCtx["db"] },
  companyWebsiteId: Id<"companyWebsites">,
  searchType: SearchType,
  list: SearchConsoleList,
  grain: SearchConsoleGrain,
  start: string,
) {
  return await ctx.db
    .query("searchConsoleLists")
    .withIndex("by_hold_type_list_grain_start", (q) => q
      .eq("companyWebsiteId", companyWebsiteId)
      .eq("searchType", searchType)
      .eq("list", list)
      .eq("grain", grain)
      .eq("start", start))
    .take(PARTS_MOST);
}

/**
 * One part of a day's list. The first part replaces whatever the day held
 * for that list — a day fetched again drops what it no longer has — and an
 * empty first part leaves the day with nothing for it.
 */
export const writeList = internalMutation({
  args: {
    ...whereArgs,
    searchType: searchTypeValidator,
    list: listValidator,
    day: v.string(),
    part: v.number(),
    fetchedAt: v.number(),
    ...packedValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await stillCollecting(ctx, args.connectionId, args.property))) return null;
    if (args.part === 0) {
      for (const old of await slotParts(ctx, args.companyWebsiteId, args.searchType, args.list, "DAY", args.day)) await ctx.db.delete(old._id);
    }
    if (args.keys.length === 0) return null;
    await ctx.db.insert("searchConsoleLists", {
      companyWebsiteId: args.companyWebsiteId,
      searchType: args.searchType,
      list: args.list,
      grain: "DAY",
      start: args.day,
      part: args.part,
      keys: args.keys,
      ...(args.pages ? { pages: args.pages } : {}),
      clicks: args.clicks,
      impressions: args.impressions,
      positionSums: args.positionSums,
      fetchedAt: args.fetchedAt,
    });
    return null;
  },
});

/** When each search and page was first and last shown (§14.3, item 6): widened, never narrowed. */
export const noteSeen = internalMutation({
  args: {
    ...whereArgs,
    kind: v.union(v.literal("query"), v.literal("page")),
    entries: v.array(v.object({ key: v.string(), first: v.string(), last: v.string() })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await stillCollecting(ctx, args.connectionId, args.property))) return null;
    for (const entry of args.entries) {
      const held = await ctx.db
        .query("searchConsoleSeen")
        .withIndex("by_hold_kind_key", (q) => q.eq("companyWebsiteId", args.companyWebsiteId).eq("kind", args.kind).eq("key", entry.key))
        .unique();
      if (!held) {
        await ctx.db.insert("searchConsoleSeen", { companyWebsiteId: args.companyWebsiteId, kind: args.kind, key: entry.key, firstDay: entry.first, lastDay: entry.last });
        continue;
      }
      if (entry.first < held.firstDay || entry.last > held.lastDay) {
        await ctx.db.patch(held._id, {
          firstDay: entry.first < held.firstDay ? entry.first : held.firstDay,
          lastDay: entry.last > held.lastDay ? entry.last : held.lastDay,
        });
      }
    }
    return null;
  },
});

// ---------------------------------------------------------------------------
// Rolling up: days past 90 into weeks, weeks past 12 months into months
// ---------------------------------------------------------------------------

type Slot = { searchType: SearchType; list: SearchConsoleList; start: string };

/**
 * The records old enough to roll up, oldest first: days before the first day
 * kept as a day, and weeks before the first week kept as a week.
 */
export const rollUpsDue = internalQuery({
  args: { companyWebsiteId: v.id("companyWebsites"), newest: v.string() },
  returns: v.object({
    days: v.array(v.object({ searchType: searchTypeValidator, list: listValidator, start: v.string() })),
    weeks: v.array(v.object({ searchType: searchTypeValidator, list: listValidator, start: v.string() })),
  }),
  handler: async (ctx, args) => {
    const dayLine = firstDayKept(args.newest);
    const weekLine = firstWeekKept(args.newest);
    const days = new Map<string, Slot>();
    const weeks = new Map<string, Slot>();
    for (const searchType of SEARCH_TYPES) {
      for (const list of LISTS_OF[searchType]) {
        for (const [grain, line, into] of [["DAY", dayLine, days], ["WEEK", weekLine, weeks]] as const) {
          const old = await ctx.db
            .query("searchConsoleLists")
            .withIndex("by_hold_type_list_grain_start", (q) => q
              .eq("companyWebsiteId", args.companyWebsiteId)
              .eq("searchType", searchType)
              .eq("list", list)
              .eq("grain", grain)
              .lt("start", line))
            .take(ROLLUPS_PER_RUN);
          for (const record of old) into.set(`${searchType}|${list}|${record.start}`, { searchType, list, start: record.start });
        }
      }
    }
    return { days: [...days.values()].slice(0, ROLLUPS_PER_RUN), weeks: [...weeks.values()].slice(0, ROLLUPS_PER_RUN) };
  },
});

/**
 * One day into its week, or one week into its month: the two added up and
 * kept as the larger, the smaller gone — in one mutation, so a figure is
 * never in both or in neither.
 */
export const rollUp = internalMutation({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    searchType: searchTypeValidator,
    list: listValidator,
    from: v.union(v.literal("DAY"), v.literal("WEEK")),
    start: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const into: SearchConsoleGrain = args.from === "DAY" ? "WEEK" : "MONTH";
    const intoStart = args.from === "DAY" ? weekStart(args.start) : monthStart(args.start);
    const small = await slotParts(ctx, args.companyWebsiteId, args.searchType, args.list, args.from, args.start);
    if (small.length === 0) return null;
    const large = await slotParts(ctx, args.companyWebsiteId, args.searchType, args.list, into, intoStart);
    const pairs = args.list === "pair";
    const merged = pack(addUp([...small, ...large]), pairs);
    for (const record of [...small, ...large]) await ctx.db.delete(record._id);
    const fetchedAt = Math.max(...small.map((record) => record.fetchedAt), ...large.map((record) => record.fetchedAt));
    for (const [part, packed] of merged.entries()) {
      if (packed.keys.length === 0) continue;
      await ctx.db.insert("searchConsoleLists", {
        companyWebsiteId: args.companyWebsiteId,
        searchType: args.searchType,
        list: args.list,
        grain: into,
        start: intoStart,
        part,
        ...packed,
        fetchedAt,
      });
    }
    return null;
  },
});

/** The rollups a site's run makes after collecting: how many it made. */
export async function rollUpSite(ctx: ActionCtx, companyWebsiteId: Id<"companyWebsites">, newest: string): Promise<number> {
  const due = await ctx.runQuery(internal.searchConsoleSync.rollUpsDue, { companyWebsiteId, newest });
  for (const slot of due.days) await ctx.runMutation(internal.searchConsoleSync.rollUp, { companyWebsiteId, ...slot, from: "DAY" });
  for (const slot of due.weeks) await ctx.runMutation(internal.searchConsoleSync.rollUp, { companyWebsiteId, ...slot, from: "WEEK" });
  return due.days.length + due.weeks.length;
}

// ---------------------------------------------------------------------------
// Reading what is kept, for the ready-made periods
// ---------------------------------------------------------------------------

/**
 * A list's kept records with any day from `from` to `to`: its days in the
 * span, and the weeks and months that hold the rest — counted whole, so a
 * span reaching past the 90 days held as days is counted in whole weeks
 * (§14.3, item 4). Days, weeks and months never hold the same day twice.
 */
/** Kept records one read returns at most. */
const KEPT_READ = 900;

export const keptBetween = internalQuery({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    searchType: searchTypeValidator,
    list: listValidator,
    grain: v.union(v.literal("DAY"), v.literal("WEEK"), v.literal("MONTH")),
    from: v.string(),
    to: v.string(),
  },
  returns: v.array(v.object({ start: v.string(), ...packedValidator })),
  handler: async (ctx, args) => {
    const from = args.grain === "DAY" ? args.from : args.grain === "WEEK" ? weekStart(args.from) : monthStart(args.from);
    const records = await ctx.db
      .query("searchConsoleLists")
      .withIndex("by_hold_type_list_grain_start", (q) => q
        .eq("companyWebsiteId", args.companyWebsiteId)
        .eq("searchType", args.searchType)
        .eq("list", args.list)
        .eq("grain", args.grain)
        .gte("start", from)
        .lte("start", args.to))
      .take(KEPT_READ + 1);
    // Asked a span short enough to hold far fewer: one this long is a website past what a run adds up (§14.3, item 9).
    if (records.length > KEPT_READ) throw appError("INVALID_INPUT", `More than ${KEPT_READ} kept records of one list from ${from} to ${args.to}: ask a shorter span.`);
    return records.map((record) => ({
      start: record.start,
      keys: record.keys,
      ...(record.pages ? { pages: record.pages } : {}),
      clicks: record.clicks,
      impressions: record.impressions,
      positionSums: record.positionSums,
    }));
  },
});

/** Which kinds of result a website has any days of: the ones worth building periods for. */
export const typesHeld = internalQuery({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.array(searchTypeValidator),
  handler: async (ctx, args) => {
    const out: SearchType[] = [];
    for (const searchType of SEARCH_TYPES) {
      const any = await ctx.db
        .query("searchConsoleDays")
        .withIndex("by_hold_type_day", (q) => q.eq("companyWebsiteId", args.companyWebsiteId).eq("searchType", searchType))
        .first();
      if (any) out.push(searchType);
    }
    return out;
  },
});

// ---------------------------------------------------------------------------
// Clearing
// ---------------------------------------------------------------------------

/** Remove a batch of a site's figures and the periods worked out from them; true once none are left. */
async function clearSome(ctx: MutationCtx, companyWebsiteId: Id<"companyWebsites">): Promise<boolean> {
  const lists = await ctx.db
    .query("searchConsoleLists")
    .withIndex("by_hold_type_list_grain_start", (q) => q.eq("companyWebsiteId", companyWebsiteId))
    .take(PURGE_BATCH);
  for (const record of lists) await ctx.db.delete(record._id);
  const periods = await ctx.db
    .query("searchConsolePeriods")
    .withIndex("by_hold_type_list_period", (q) => q.eq("companyWebsiteId", companyWebsiteId))
    .take(PURGE_BATCH);
  for (const record of periods) await ctx.db.delete(record._id);
  const days = await ctx.db
    .query("searchConsoleDays")
    .withIndex("by_hold_type_day", (q) => q.eq("companyWebsiteId", companyWebsiteId))
    .take(PURGE_ROWS);
  for (const row of days) await ctx.db.delete(row._id);
  const seen = await ctx.db
    .query("searchConsoleSeen")
    .withIndex("by_hold_kind_key", (q) => q.eq("companyWebsiteId", companyWebsiteId))
    .take(PURGE_ROWS);
  for (const row of seen) await ctx.db.delete(row._id);
  const weeks = await ctx.db
    .query("searchConsoleWeeks")
    .withIndex("by_hold_type_week", (q) => q.eq("companyWebsiteId", companyWebsiteId))
    .take(PURGE_ROWS);
  for (const row of weeks) await ctx.db.delete(row._id);
  return lists.length < PURGE_BATCH && periods.length < PURGE_BATCH && days.length < PURGE_ROWS && seen.length < PURGE_ROWS && weeks.length < PURGE_ROWS;
}

/**
 * A site's figures go, a batch at a time — another property chosen, or what
 * was collected cleared (`clearCollected`). Nothing is collected afterwards
 * until the Collector's next run.
 */
export const clearFigures = internalMutation({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await clearSome(ctx, args.companyWebsiteId))) {
      await ctx.scheduler.runAfter(0, internal.searchConsoleSync.clearFigures, args);
      return null;
    }
    const connection = await ctx.db
      .query("searchConsoleConnections")
      .withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.companyWebsiteId))
      .first();
    if (!connection) return null;
    await ctx.db.patch(connection._id, { clearing: undefined, updatedAt: Date.now() });
    return null;
  },
});

/**
 * Everything collected for a site cleared, its connection kept: the Google
 * sign-in stays, so a later collection needs no new one. Run by hand
 * (`npx convex run searchConsoleSync:clearCollected`), as on 2026-10-02 when
 * the first website's sixteen months were cleared (§12). The run log and the
 * company's tracked lists stay: they are not figures.
 */
export const clearCollected = internalMutation({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("searchConsoleConnections")
      .withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.companyWebsiteId))
      .first();
    if (!connection) return null;
    // Marked as clearing first: a step still running drops what it fetched.
    await ctx.db.patch(connection._id, {
      clearing: true,
      newestDay: undefined,
      oldestDay: undefined,
      backfilledAt: undefined,
      historyAt: undefined,
      lastCollectedAt: undefined,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.searchConsoleSync.clearFigures, args);
    return null;
  },
});

/**
 * A website the company no longer holds: everything Search Console brought
 * for it, its runs, its tracked lists and its connection, a batch at a time.
 * Its grant has already been given back (`searchConsoleConnect.forgetHold`).
 */
export const purgeHold = internalMutation({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("searchConsoleConnections")
      .withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.companyWebsiteId))
      .first();
    // Stop anything still collecting before the figures go.
    if (connection && connection.status !== "DISCONNECTED") {
      await ctx.db.patch(connection._id, { status: "DISCONNECTED", disconnectedAt: Date.now() });
    }
    const cleared = await clearSome(ctx, args.companyWebsiteId);
    const runs = await ctx.db
      .query("searchConsoleRuns")
      .withIndex("by_hold_started", (q) => q.eq("companyWebsiteId", args.companyWebsiteId))
      .take(PURGE_ROWS);
    for (const run of runs) await ctx.db.delete(run._id);
    const tracked = await ctx.db
      .query("searchConsoleTracked")
      .withIndex("by_hold_kind_key", (q) => q.eq("companyWebsiteId", args.companyWebsiteId))
      .take(PURGE_ROWS);
    for (const row of tracked) await ctx.db.delete(row._id);
    if (!cleared || runs.length === PURGE_ROWS || tracked.length === PURGE_ROWS) {
      await ctx.scheduler.runAfter(0, internal.searchConsoleSync.purgeHold, args);
      return null;
    }
    if (connection) {
      for (const token of await ctx.db
        .query("searchConsoleTokens")
        .withIndex("by_connection", (q) => q.eq("connectionId", connection._id))
        .take(10)) {
        await ctx.db.delete(token._id);
      }
      await ctx.db.delete(connection._id);
    }
    return null;
  },
});

export { rowsOf };
