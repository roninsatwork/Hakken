import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { accessTokenFor, type ConnectionProblem } from "./searchConsoleConnect";
import { GOOGLE_DIMENSIONS, LISTS_OF, queryAnalytics, type AnalyticsRow, type GoogleFailure } from "./searchConsoleApi";
import {
  SEARCH_TYPES,
  listValidator,
  searchTypeValidator,
  seenType,
  type SearchConsoleList,
  type SearchType,
} from "./searchConsoleSchema";
import { daysNewestFirst, newestWholeDay, shiftDay } from "./searchConsoleDays";
import { isTrackedHold } from "./utils/websitePairing";
import { fromGoogle, pack, rowsOf, DAYS_KEPT, type Packed } from "./utils/searchConsolePacks";
import { slotParts } from "./searchConsoleRollups";
import { deletePageRefs, encodePages } from "./searchConsolePageRefs";
import { countriesKeptReady, heldFor, stillKeptReady, withHeld, type HeldRange } from "./searchConsoleCountries";

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
 * past 90 roll into their week, weeks past 12 months into their month
 * (`searchConsoleRollups.ts`); the website's totals by day stay as days.
 *
 * **Each country kept ready** (§16) is collected the same way after all
 * countries, in the same run: the same asks with Google's country filter,
 * no country list inside a country, filed with `country` set. Its held days
 * are kept on the connection (`countriesHeld`), so a country new to the list
 * gets the same 90 days a newly connected website does.
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

/** Kept or ready-made parts cleared per mutation: each can be most of a megabyte. */
const PURGE_BATCH = 5;
const PURGE_ROWS = 500;

/** Keys noted as seen per mutation. */
export const SEEN_CHUNK = 500;

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
export function recentWindow(newestDay: string | undefined, now: number, oldestDay?: string): { from: string; top: string } {
  const top = newestWholeDay(now);
  const oldest = shiftDay(top, -(DAYS_KEPT - 1));
  // Nothing held, or a first 90 days that stopped part-way: the 90 days from their start.
  if (!newestDay || (oldestDay !== undefined && oldestDay > oldest)) return { from: oldest, top };
  const newest = newestDay < top ? newestDay : top;
  return { from: laterDay(oldest, shiftDay(newest, -(REFETCH_DAYS - 1))), top };
}

/** Connections read per page when listing every connected website. */
const CONNECTIONS_PER_READ = 500;

/**
 * What the Search Console Collector's run collects (§12): every connected
 * website, with its recent days — the one longest since it was collected
 * first, so one a run did not reach goes first in the next — and each
 * country it keeps ready (§16), from that country's own held days: a country
 * new to the list holds none, so it goes back the whole 90 days.
 */
export const agentCollections = internalQuery({
  args: {},
  returns: v.array(v.object({
    connectionId: v.id("searchConsoleConnections"),
    companyId: v.id("companies"),
    host: v.string(),
    property: v.string(),
    from: v.string(),
    top: v.string(),
    countries: v.array(v.object({ code: v.string(), from: v.string() })),
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
      const hold = await ctx.db.get(connection.companyWebsiteId);
      const kept = hold ? await countriesKeptReady(ctx, hold) : [];
      out.push({
        connectionId: connection._id,
        companyId: connection.companyId,
        host: website?.displayHost ?? website?.host ?? connection.property,
        property: connection.property,
        ...recentWindow(connection.newestDay, now, connection.oldestDay),
        countries: kept.map((code) => {
          const held = heldFor(connection, code);
          return { code, from: recentWindow(held?.newestDay, now, held?.oldestDay).from };
        }),
      });
    }
    return out;
  },
});

// ---------------------------------------------------------------------------
// One step
// ---------------------------------------------------------------------------

/**
 * Where a collection stands: the connection, and the days held — all
 * countries', or one country's when one is named. `kept` is false once that
 * country is no longer kept ready; `countries` are the countries kept ready
 * with days held, the ones a settle adds up after all countries.
 */
export const stepState = internalQuery({
  args: { connectionId: v.id("searchConsoleConnections"), country: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) return null;
    const hold = await ctx.db.get(connection.companyWebsiteId);
    const kept = hold ? await countriesKeptReady(ctx, hold) : [];
    const held = args.country === undefined
      ? { newestDay: connection.newestDay, oldestDay: connection.oldestDay }
      : heldFor(connection, args.country);
    return {
      status: connection.status,
      property: connection.property ?? null,
      clearing: connection.clearing === true,
      companyWebsiteId: connection.companyWebsiteId,
      owned: hold !== null && !isTrackedHold(hold),
      oldestDay: held?.oldestDay ?? null,
      newestDay: held?.newestDay ?? null,
      kept: args.country === undefined || kept.includes(args.country),
      countries: kept.filter((code) => heldFor(connection, code) !== null),
      /** Nearly all of the website's searches: no search-and-page lines of its own (`searchConsoleShrink.ts`). */
      asAll: args.country !== undefined && (connection.countriesAsAll ?? []).includes(args.country),
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
  /** One country kept ready (§16), asked with Google's country filter; missing for all countries. */
  country?: string;
};

/**
 * How a step ended. `DONE`: the collection reached its oldest day. `MORE`:
 * days are left, from `nextTo` down — the step covers a week at most, and
 * stops starting days at its time budget. `BUSY`: Google or the sign-in was
 * too busy. `NO_ACCESS`: the account can no longer read the property.
 * `STOPPED`: the sign-in failed, or Google answered with an error. `SKIPPED`:
 * the connection changed before the step began. `NOT_OWNED`: the website is
 * no longer the company's own. `NOT_KEPT`: the country the step was for is
 * no longer kept ready, so the run goes on without it. The connection
 * carries any problem already.
 */
export type StepOutcome = {
  ended: "DONE" | "MORE" | "BUSY" | "NO_ACCESS" | "STOPPED" | "SKIPPED" | "NOT_OWNED" | "NOT_KEPT";
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
 * had impressions, kept as one record a day. For one country kept ready,
 * every ask carries Google's country filter and there is no country list.
 * Says how it ended; the Collector's run goes on from there
 * (`searchConsoleAgentRun.ts`).
 */
export async function runStep(ctx: ActionCtx, args: StepArgs, budgetMs: number): Promise<StepOutcome> {
  const stepFrom = laterDay(args.from, shiftDay(args.to, -(DAYS_PER_STEP - 1)));
  const ended = (end: StepOutcome["ended"]): StepOutcome =>
    ({ ended: end, fromDay: stepFrom, toDay: args.to, processedFrom: null, nextTo: args.to, requests: 0, rows: 0, refused: [], error: null });
  const country = args.country === undefined ? {} : { country: args.country };
  const state = await ctx.runQuery(internal.searchConsoleSync.stepState, { connectionId: args.connectionId, ...country });
  if (!state || state.status !== "CONNECTED" || state.property !== args.property || state.clearing) return ended("SKIPPED");
  if (!state.owned) {
    await ctx.runMutation(internal.searchConsoleConnect.noteProblem, { connectionId: args.connectionId, problem: "NOT_OWNED" });
    return ended("NOT_OWNED");
  }
  if (!state.kept) return ended("NOT_KEPT");

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
      ...country,
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
    ...country,
  };
  const held = (day: string) => state.oldestDay !== null && state.newestDay !== null && day >= state.oldestDay && day <= state.newestDay;
  // One country's figures: every ask filtered to it, and no country list inside it.
  const filter = args.country === undefined
    ? {}
    : { dimensionFilterGroups: [{ filters: [{ dimension: "country", operator: "equals", expression: args.country }] }] };
  // A country nearly all of the searches asks for no search-and-page lines: they would be all countries' again.
  const listsOf = (type: SearchType) => LISTS_OF[type].filter((list) => args.country === undefined
    || (list !== "country" && !(state.asAll && (list === "pair" || list === "page"))));
  let failure: GoogleFailure | null = null;

  // Each kind of result's totals, a row a day: one ask covers the step.
  const totals = new Map<SearchType, Map<string, Figures>>();
  for (const type of SEARCH_TYPES) {
    const answer = await ask(session, (accessToken) => queryAnalytics(accessToken, args.property, {
      startDate: stepFrom,
      endDate: args.to,
      type,
      dimensions: ["date"],
      ...filter,
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

  // Searches and pages seen in the step, for each kind of result: noted once for the step, not once a day.
  type Seen = Record<"query" | "page", Map<string, { first: string; last: string }>>;
  const seen = new Map<SearchType, Seen>();
  const see = (type: SearchType, kind: "query" | "page", key: string, day: string) => {
    const lists = seen.get(type) ?? { query: new Map(), page: new Map() };
    seen.set(type, lists);
    const was = lists[kind].get(key);
    if (!was) lists[kind].set(key, { first: day, last: day });
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
      for (const list of listsOf(type)) asks.push({ type, list, shown });
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
          ...filter,
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
        if (list === "pair") for (const row of rows) see(type, "query", row.key, day);
        if (list === "page") for (const row of rows) see(type, "page", row.key, day);
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

  for (const [searchType, lists] of seen) {
    for (const kind of ["query", "page"] as const) {
      const entries = [...lists[kind]].map(([key, days]) => ({ key, ...days }));
      for (let start = 0; start < entries.length; start += SEEN_CHUNK) {
        await ctx.runMutation(internal.searchConsoleSync.noteSeen, {
          ...where,
          searchType,
          kind,
          entries: entries.slice(start, start + SEEN_CHUNK),
        });
      }
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
  /** One country kept ready (§16); missing for all countries. */
  country: v.optional(v.string()),
};

/**
 * Whether a write still belongs: the connection is there, on the property it
 * was fetched for — and, for one country, that country is still kept ready,
 * so a country taken off while a step ran is not filed again behind its
 * clearing.
 */
async function stillCollecting(
  ctx: { db: MutationCtx["db"] },
  connectionId: Id<"searchConsoleConnections">,
  property: string,
  country?: string,
) {
  const connection = await ctx.db.get(connectionId);
  if (connection === null || connection.property !== property || connection.clearing === true || connection.status !== "CONNECTED") return false;
  return await stillKeptReady(ctx, connection.companyWebsiteId, country);
}

/** A field set only for one country: all countries' records carry none. */
const countryField = (country: string | undefined) => (country === undefined ? {} : { country });

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
 * held when they meet them — all countries', or the one country's. A
 * collection works newest first without gaps, so the days it has done so far
 * are always one run of days down from its top.
 */
export const finishStep = internalMutation({
  args: {
    connectionId: v.id("searchConsoleConnections"),
    property: v.string(),
    country: v.optional(v.string()),
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
      const was = args.country === undefined ? { newestDay: connection.newestDay, oldestDay: connection.oldestDay } : heldFor(connection, args.country);
      const joined = joinHeld(was, args.processedFrom, args.top);
      if (joined && args.country === undefined) {
        patch.newestDay = joined.newestDay;
        patch.oldestDay = joined.oldestDay;
      } else if (joined && args.country !== undefined && await stillKeptReady(ctx, connection.companyWebsiteId, args.country)) {
        patch.countriesHeld = withHeld(connection.countriesHeld, args.country, joined);
      }
    }
    await ctx.db.patch(connection._id, patch);
    return null;
  },
});

/** The days held once a step's days from `from` to `top` are in: joined when they meet, else as they were (null). */
function joinHeld(was: { newestDay?: string; oldestDay?: string } | null, from: string, top: string): HeldRange | null {
  if (!was?.newestDay || !was.oldestDay) return { newestDay: top, oldestDay: from };
  if (from > shiftDay(was.newestDay, 1)) return null;
  return { newestDay: top > was.newestDay ? top : was.newestDay, oldestDay: from < was.oldestDay ? from : was.oldestDay };
}

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
    if (!(await stillCollecting(ctx, args.connectionId, args.property, args.country))) return null;
    for (const type of args.types) {
      const existing = await ctx.db
        .query("searchConsoleDays")
        .withIndex("by_hold_country_type_day", (q) => q
          .eq("companyWebsiteId", args.companyWebsiteId).eq("country", args.country).eq("searchType", type).eq("day", args.day))
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
      else await ctx.db.insert("searchConsoleDays", { companyWebsiteId: args.companyWebsiteId, ...countryField(args.country), searchType: type, day: args.day, ...row });
    }
    return null;
  },
});

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
    if (!(await stillCollecting(ctx, args.connectionId, args.property, args.country))) return null;
    if (args.part === 0) {
      for (const old of await slotParts(ctx, args.companyWebsiteId, args.country, args.searchType, args.list, "DAY", args.day)) await ctx.db.delete(old._id);
    }
    if (args.keys.length === 0) return null;
    // Each page address kept once, the lines pointing to it (`searchConsolePageRefs.ts`).
    const keys = args.list === "page" ? await encodePages(ctx, args.companyWebsiteId, args.keys) : args.keys;
    const pages = args.pages ? await encodePages(ctx, args.companyWebsiteId, args.pages) : undefined;
    await ctx.db.insert("searchConsoleLists", {
      companyWebsiteId: args.companyWebsiteId,
      ...countryField(args.country),
      searchType: args.searchType,
      list: args.list,
      grain: "DAY",
      start: args.day,
      part: args.part,
      keys,
      ...(pages ? { pages } : {}),
      clicks: args.clicks,
      impressions: args.impressions,
      positionSums: args.positionSums,
      fetchedAt: args.fetchedAt,
    });
    return null;
  },
});

/**
 * Every connection whose figures are kept — connected, or waiting to be
 * connected again, which keeps its figures — for the one-off changes to what
 * is kept (`searchConsolePageRefs.ts`, `searchConsoleTidy.ts`).
 */
export const connectionsWithFigures = internalQuery({
  args: {},
  returns: v.array(v.object({ connectionId: v.id("searchConsoleConnections"), holdId: v.id("companyWebsites") })),
  handler: async (ctx) => {
    const found: Array<{ connectionId: Id<"searchConsoleConnections">; holdId: Id<"companyWebsites"> }> = [];
    for (const status of ["CONNECTED", "NEEDS_RECONNECT"] as const) {
      for (let after = 0; ;) {
        const page = await ctx.db
          .query("searchConsoleConnections")
          .withIndex("by_status", (q) => q.eq("status", status).gt("_creationTime", after))
          .take(CONNECTIONS_PER_READ);
        found.push(...page.map((connection) => ({ connectionId: connection._id, holdId: connection.companyWebsiteId })));
        if (page.length < CONNECTIONS_PER_READ) break;
        after = page[page.length - 1]._creationTime;
      }
    }
    return found;
  },
});

/** When each search and page was first and last shown (§14.3, item 6), for one kind of result in all countries or one: widened, never narrowed. */
export const noteSeen = internalMutation({
  args: {
    ...whereArgs,
    searchType: searchTypeValidator,
    kind: v.union(v.literal("query"), v.literal("page")),
    entries: v.array(v.object({ key: v.string(), first: v.string(), last: v.string() })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await stillCollecting(ctx, args.connectionId, args.property, args.country))) return null;
    const searchType = seenType(args.searchType);
    for (const entry of args.entries) {
      const held = await ctx.db
        .query("searchConsoleSeen")
        .withIndex("by_hold_country_type_kind_key", (q) => q
          .eq("companyWebsiteId", args.companyWebsiteId).eq("country", args.country).eq("searchType", searchType).eq("kind", args.kind).eq("key", entry.key))
        .unique();
      if (!held) {
        await ctx.db.insert("searchConsoleSeen", {
          companyWebsiteId: args.companyWebsiteId,
          ...countryField(args.country),
          ...(searchType === undefined ? {} : { searchType }),
          kind: args.kind,
          key: entry.key,
          firstDay: entry.first,
          lastDay: entry.last,
        });
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
// Clearing
// ---------------------------------------------------------------------------

/**
 * Remove a batch of a site's figures and the periods worked out from them —
 * all countries' and every country's, the hold alone leading each index —
 * true once none are left.
 */
async function clearSome(ctx: MutationCtx, companyWebsiteId: Id<"companyWebsites">): Promise<boolean> {
  const lists = await ctx.db
    .query("searchConsoleLists")
    .withIndex("by_hold_country_type_list_grain_start", (q) => q.eq("companyWebsiteId", companyWebsiteId))
    .take(PURGE_BATCH);
  for (const record of lists) await ctx.db.delete(record._id);
  const periods = await ctx.db
    .query("searchConsolePeriods")
    .withIndex("by_hold_country_type_list_period", (q) => q.eq("companyWebsiteId", companyWebsiteId))
    .take(PURGE_BATCH);
  for (const record of periods) await ctx.db.delete(record._id);
  const days = await ctx.db
    .query("searchConsoleDays")
    .withIndex("by_hold_country_type_day", (q) => q.eq("companyWebsiteId", companyWebsiteId))
    .take(PURGE_ROWS);
  for (const row of days) await ctx.db.delete(row._id);
  const seen = await ctx.db
    .query("searchConsoleSeen")
    .withIndex("by_hold_country_type_kind_key", (q) => q.eq("companyWebsiteId", companyWebsiteId))
    .take(PURGE_ROWS);
  for (const row of seen) await ctx.db.delete(row._id);
  const weeks = await ctx.db
    .query("searchConsoleWeeks")
    .withIndex("by_hold_country_type_week", (q) => q.eq("companyWebsiteId", companyWebsiteId))
    .take(PURGE_ROWS);
  for (const row of weeks) await ctx.db.delete(row._id);
  const seenDays = await ctx.db
    .query("searchConsoleSeenDays")
    .withIndex("by_hold_country_type_kind_day", (q) => q.eq("companyWebsiteId", companyWebsiteId))
    .take(PURGE_ROWS);
  for (const row of seenDays) await ctx.db.delete(row._id);
  // Its page addresses go last, once no kept list points to them.
  const refsGone = lists.length < PURGE_BATCH ? await deletePageRefs(ctx, companyWebsiteId, PURGE_ROWS) : false;
  return lists.length < PURGE_BATCH && periods.length < PURGE_BATCH && days.length < PURGE_ROWS && seen.length < PURGE_ROWS && weeks.length < PURGE_ROWS
    && seenDays.length < PURGE_ROWS && refsGone;
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
      countriesHeld: undefined,
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
