import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { accessTokenFor, type ConnectionProblem } from "./searchConsoleConnect";
import { DIMENSIONS_OF, GOOGLE_DIMENSION, queryAnalytics, type AnalyticsRow, type GoogleFailure } from "./searchConsoleApi";
import {
  SEARCH_TYPES,
  dimensionValidator,
  searchTypeValidator,
  type SearchConsoleDimension,
  type SearchType,
} from "./searchConsoleSchema";
import { daysNewestFirst, historyLimitDay, newestWholeDay, shiftDay } from "./searchConsoleDays";
import { isTrackedHold } from "./utils/websitePairing";
import { dropHoldCopies } from "./searchConsoleCopies";

/**
 * Collecting a connected site's Search Console figures
 * (docs/plans/active/search-console-plan.md §4; SC5, SC6).
 *
 * **Nothing starts it for now** (§12, 2026-10-02). The hidden daily job and
 * the pull on connecting are gone: collecting is to be a Search Console
 * agent's work, timed by its own row in Admin → Schedules, and nothing is
 * collected in bulk until Anthony is happy with the screens. What is here is
 * the collecting itself, for that agent to start.
 *
 * **A collection** (`collectRecent`) fetches the days since the newest held
 * and the last four again — Google's figures settle over two to three days —
 * so a day is replaced until it is final; then the sixteen months before,
 * worked back a week at a time, so no step outlasts an action and the screens
 * fill in as it goes. A history that stops is taken up by the next collection.
 *
 * **Every search and every page, every day** (SC6): for each day and each kind
 * of result that had any impressions, the day's figures for every search,
 * page, country, device and search appearance, up to Google's 50,000 rows a
 * day, as well as the day's totals — which count the rare searches Google
 * hides for privacy, and so are more than the searches add up to.
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
const STEP_BUDGET_MS = 4 * 60 * 1000;

/** A history quiet this long has stopped: the next collection takes it up again. */
const HISTORY_STALL_MS = 60 * 60 * 1000;

/** Rows written per mutation, and checked per mutation when dropping what a fetch no longer returned. */
const WRITE_CHUNK = 1_000;
const SWEEP_CHUNK = 2_000;

/** Asks to Google at once for one site; its limit is 1,200 a minute a site. */
const PARALLEL_ASKS = 4;

/** Waits before asking a busy Google again, within a step. */
const BUSY_WAITS_MS = [2_000, 8_000];

/** A step Google was too busy for is tried again this much later, this many times. */
const RETRY_LATER_MS = 15 * 60 * 1000;
const MAX_RETRIES = 3;

/** Rows removed per mutation when a site's figures are cleared. */
const PURGE_BATCH = 500;

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

// ---------------------------------------------------------------------------
// Starting
// ---------------------------------------------------------------------------

/** One collection: the days since the newest held, and the last four again, newest first; then the history. */
export const collectRecent = internalMutation({
  args: { connectionId: v.id("searchConsoleConnections") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.status !== "CONNECTED" || !connection.property || connection.clearing) return null;
    const now = Date.now();
    const top = newestWholeDay(now);
    const newest = connection.newestDay && connection.newestDay < top ? connection.newestDay : top;
    const from = laterDay(historyLimitDay(now), shiftDay(newest, -(REFETCH_DAYS - 1)));
    await ctx.scheduler.runAfter(0, internal.searchConsoleSync.collectStep, {
      connectionId: connection._id,
      property: connection.property,
      kind: "DAILY",
      from,
      top,
      to: top,
      attempt: 0,
    });
    return null;
  },
});

/**
 * After the recent days: the history, back to the sixteen months Google
 * keeps, unless it is all in or a history is still going.
 */
export const continueHistory = internalMutation({
  args: { connectionId: v.id("searchConsoleConnections"), property: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.status !== "CONNECTED" || connection.property !== args.property) return null;
    if (connection.backfilledAt !== undefined || !connection.oldestDay || connection.clearing) return null;
    const now = Date.now();
    if (connection.historyAt !== undefined && now - connection.historyAt < HISTORY_STALL_MS) return null;
    const limit = historyLimitDay(now);
    const top = shiftDay(connection.oldestDay, -1);
    if (top < limit) {
      await ctx.db.patch(connection._id, { backfilledAt: now, updatedAt: now });
      return null;
    }
    await ctx.db.patch(connection._id, { historyAt: now, updatedAt: now });
    await ctx.scheduler.runAfter(0, internal.searchConsoleSync.collectStep, {
      connectionId: connection._id,
      property: args.property,
      kind: "HISTORY",
      from: limit,
      top,
      to: top,
      attempt: 0,
    });
    return null;
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

/**
 * One step: up to a week of days, newest first — each kind of result's
 * totals for the step's days, then, day by day, every split of every kind
 * that had impressions. A step that runs long hands its remaining days to the
 * next; one Google refused or was too busy for is tried again later.
 */
export const collectStep = internalAction({
  args: {
    connectionId: v.id("searchConsoleConnections"),
    property: v.string(),
    kind: kindValidator,
    /** The oldest day this collection goes back to. */
    from: v.string(),
    /** The newest day of the whole collection: what the held days reach once it is done. */
    top: v.string(),
    /** The newest day of this step. */
    to: v.string(),
    attempt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await ctx.runQuery(internal.searchConsoleSync.stepState, { connectionId: args.connectionId });
    if (!state || state.status !== "CONNECTED" || state.property !== args.property || state.clearing) return null;
    if (!state.owned) {
      await ctx.runMutation(internal.searchConsoleConnect.noteProblem, { connectionId: args.connectionId, problem: "NOT_OWNED" });
      return null;
    }

    const stepFrom = laterDay(args.from, shiftDay(args.to, -(DAYS_PER_STEP - 1)));
    const startedAt = Date.now();
    const runId = await ctx.runMutation(internal.searchConsoleSync.startRun, {
      connectionId: args.connectionId,
      companyWebsiteId: state.companyWebsiteId,
      kind: args.kind,
      fromDay: stepFrom,
      toDay: args.to,
      startedAt,
    });
    const finish = async (processedFrom: string | null, error: string | null, counts: { requests: number; rows: number; refused: string[] }) =>
      await ctx.runMutation(internal.searchConsoleSync.finishStep, {
        connectionId: args.connectionId,
        property: args.property,
        runId,
        kind: args.kind,
        top: args.top,
        processedFrom,
        error,
        ...counts,
      });

    const token = await accessTokenFor(ctx, args.connectionId);
    if (!token.ok) {
      await finish(null, token.problem, { requests: 0, rows: 0, refused: [] });
      if (token.problem === "GOOGLE_BUSY") await retryLater(ctx, args, args.to);
      return null;
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

    let processedFrom: string | null = null;
    for (const day of failure || session.stopped ? [] : daysNewestFirst(stepFrom, args.to)) {
      if (Date.now() - startedAt > STEP_BUDGET_MS) break;
      const fetchedAt = Date.now();
      const again = held(day);
      const named = new Map<SearchType, number>();
      const asks: { type: SearchType; dimension: SearchConsoleDimension; shown: boolean }[] = [];
      for (const [type, byDay] of totals) {
        const shown = (byDay.get(day)?.impressions ?? 0) > 0;
        // A day fetched again drops what it no longer has, even when the kind now has nothing.
        if (!shown && !again) continue;
        for (const dimension of DIMENSIONS_OF[type]) asks.push({ type, dimension, shown });
      }
      await inTurns(asks, PARALLEL_ASKS, async ({ type, dimension, shown }) => {
        if (failure || session.stopped) return;
        if (shown) {
          const answer = await ask(session, (accessToken) => queryAnalytics(accessToken, args.property, {
            startDate: day,
            endDate: day,
            type,
            dimensions: [GOOGLE_DIMENSION[dimension]],
          }));
          if (!answer.ok) {
            if (answer.reason === "REFUSED") counts.refused.push(`${type}/${dimension}`);
            else failure = answer;
            return;
          }
          counts.requests += answer.requests;
          counts.rows += answer.rows.length;
          if (dimension === "query") named.set(type, answer.rows.reduce((sum, row) => sum + row.clicks, 0));
          for (let start = 0; start < answer.rows.length; start += WRITE_CHUNK) {
            await ctx.runMutation(internal.searchConsoleSync.writeRows, {
              ...where,
              searchType: type,
              dimension,
              day,
              fetchedAt,
              rows: answer.rows.slice(start, start + WRITE_CHUNK).map((row) => ({ key: row.keys[0] ?? "", ...figuresOf(row) })),
            });
          }
        }
        if (!again) return;
        for (let cursor: string | null = null, first = true; first || cursor !== null; first = false) {
          cursor = await ctx.runMutation(internal.searchConsoleSync.dropUnfetched, {
            ...where,
            searchType: type,
            dimension,
            day,
            fetchedAt,
            cursor,
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

    const stoppedBy: GoogleFailure | null = failure;
    const error = session.stopped ?? (stoppedBy ? `${stoppedBy.reason} ${stoppedBy.status}: ${stoppedBy.detail}` : null);
    await finish(processedFrom, error, counts);

    if (stoppedBy?.reason === "ACCESS") {
      await ctx.runMutation(internal.searchConsoleConnect.noteProblem, { connectionId: args.connectionId, problem: "NO_ACCESS" });
      return null;
    }
    const busy = session.stopped === "GOOGLE_BUSY" || stoppedBy?.reason === "BUSY" || stoppedBy?.reason === "UNREACHABLE";
    const nextTo = processedFrom === null ? args.to : shiftDay(processedFrom, -1);
    if (busy) {
      await ctx.runMutation(internal.searchConsoleConnect.noteProblem, { connectionId: args.connectionId, problem: "GOOGLE_BUSY" });
      await retryLater(ctx, args, nextTo);
      return null;
    }
    if (session.stopped || stoppedBy) return null;

    if (nextTo >= args.from) {
      await ctx.scheduler.runAfter(0, internal.searchConsoleSync.collectStep, { ...args, to: nextTo, attempt: 0 });
    } else if (args.kind === "DAILY") {
      await ctx.runMutation(internal.searchConsoleSync.continueHistory, { connectionId: args.connectionId, property: args.property });
    } else {
      await ctx.runMutation(internal.searchConsoleSync.historyDone, { connectionId: args.connectionId, property: args.property });
    }
    return null;
  },
});

async function retryLater(
  ctx: ActionCtx,
  args: { connectionId: Id<"searchConsoleConnections">; property: string; kind: "DAILY" | "HISTORY"; from: string; top: string; to: string; attempt: number },
  to: string,
) {
  // Given up for today after this: the next daily run starts again from the newest held day.
  if (args.attempt >= MAX_RETRIES || to < args.from) return;
  await ctx.scheduler.runAfter(RETRY_LATER_MS, internal.searchConsoleSync.collectStep, { ...args, to, attempt: args.attempt + 1 });
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
    kind: kindValidator,
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
      if (args.kind === "HISTORY") {
        patch.historyAt = now;
        if (!connection.oldestDay || from < connection.oldestDay) patch.oldestDay = from;
      } else if (!connection.newestDay || !connection.oldestDay) {
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

/** The history reached the oldest day Google keeps. */
export const historyDone = internalMutation({
  args: { connectionId: v.id("searchConsoleConnections"), property: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.property !== args.property) return null;
    const now = Date.now();
    await ctx.db.patch(connection._id, { backfilledAt: now, historyAt: now, updatedAt: now });
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

/** A chunk of one day's rows for one split: each kept or replaced. */
export const writeRows = internalMutation({
  args: {
    ...whereArgs,
    searchType: searchTypeValidator,
    dimension: dimensionValidator,
    day: v.string(),
    fetchedAt: v.number(),
    rows: v.array(v.object({ key: v.string(), ...figuresValidator })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await stillCollecting(ctx, args.connectionId, args.property))) return null;
    for (const row of args.rows) {
      const existing = await ctx.db
        .query("searchConsoleRows")
        .withIndex("by_hold_type_dimension_key_day", (q) => q
          .eq("companyWebsiteId", args.companyWebsiteId)
          .eq("searchType", args.searchType)
          .eq("dimension", args.dimension)
          .eq("key", row.key)
          .eq("day", args.day))
        .unique();
      const figures = { clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position, fetchedAt: args.fetchedAt };
      if (existing) {
        await ctx.db.patch(existing._id, figures);
      } else {
        await ctx.db.insert("searchConsoleRows", {
          companyWebsiteId: args.companyWebsiteId,
          searchType: args.searchType,
          dimension: args.dimension,
          key: row.key,
          day: args.day,
          ...figures,
        });
      }
    }
    return null;
  },
});

/** A day fetched again: the rows this fetch did not return are gone, a page at a time. */
export const dropUnfetched = internalMutation({
  args: {
    ...whereArgs,
    searchType: searchTypeValidator,
    dimension: dimensionValidator,
    day: v.string(),
    fetchedAt: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    if (!(await stillCollecting(ctx, args.connectionId, args.property))) return null;
    const page = await ctx.db
      .query("searchConsoleRows")
      .withIndex("by_hold_type_dimension_day", (q) => q
        .eq("companyWebsiteId", args.companyWebsiteId)
        .eq("searchType", args.searchType)
        .eq("dimension", args.dimension)
        .eq("day", args.day))
      .paginate({ numItems: SWEEP_CHUNK, cursor: args.cursor });
    for (const row of page.page) {
      if (row.fetchedAt < args.fetchedAt) await ctx.db.delete(row._id);
    }
    return page.isDone ? null : page.continueCursor;
  },
});

// ---------------------------------------------------------------------------
// Clearing
// ---------------------------------------------------------------------------

/** Remove a batch of a site's figures and the lists worked out from them; true once none are left. */
async function clearSome(ctx: MutationCtx, companyWebsiteId: Id<"companyWebsites">): Promise<boolean> {
  const rows = await ctx.db
    .query("searchConsoleRows")
    .withIndex("by_hold_type_dimension_day", (q) => q.eq("companyWebsiteId", companyWebsiteId))
    .take(PURGE_BATCH);
  for (const row of rows) await ctx.db.delete(row._id);
  const days = await ctx.db
    .query("searchConsoleDays")
    .withIndex("by_hold_type_day", (q) => q.eq("companyWebsiteId", companyWebsiteId))
    .take(PURGE_BATCH);
  for (const row of days) await ctx.db.delete(row._id);
  // And the tables' lists worked out from them.
  const copiesLeft = await dropHoldCopies(ctx, companyWebsiteId);
  return rows.length < PURGE_BATCH && days.length < PURGE_BATCH && !copiesLeft;
}

/**
 * A site's figures go, a batch at a time — another property chosen, or what
 * was collected cleared (`clearCollected`). Nothing is collected afterwards
 * until a collection is started (§12).
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
 * ronins.co.uk's sixteen months were cleared (§12). The run log stays: it is
 * what was asked of Google, not the figures.
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
 * for it, its runs and its connection, a batch at a time. Its grant has
 * already been given back (`searchConsoleConnect.forgetHold`).
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
      .take(PURGE_BATCH);
    for (const run of runs) await ctx.db.delete(run._id);
    if (!cleared || runs.length === PURGE_BATCH) {
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
