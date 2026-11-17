import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { accessTokenFor, siteRunGoing } from "./searchConsoleConnect";
import { GOOGLE_DIMENSIONS, LISTS_OF, queryAnalytics, type AnalyticsRow, type GoogleFailure } from "./searchConsoleApi";
import { COLLECTED_SEARCH_TYPES, searchTypeValidator, type SearchType } from "./searchConsoleSchema";
import { shiftDay } from "./searchConsoleDays";
import { DAYS_KEPT, fromGoogle, pack } from "./utils/searchConsolePacks";
import { encodePagesFromAction } from "./holdPageRefs";
import { SEEN_CHUNK } from "./searchConsoleSync";
import { planParts, startParts } from "./searchConsoleSettlePlan";
import { settlingNow } from "./searchConsoleSettling";

/**
 * Every connected website's kept page lists fetched again from Google, once,
 * now that a page's figures are every country's (Anthony, 2026-11-17: "Every
 * country's pages", then "Yes, build it"; `EVERY_COUNTRY_LISTS`). Until then
 * each day's pages were asked with the home country's filter, and Google
 * left the searches it keeps private out of them: More Handles' pages held
 * 68 of the 266 clicks in the United Kingdom on 15 October 2026, and 317 of
 * 315 once asked of no country.
 *
 * Only the page lists: a website's totals, searches, devices and countries
 * are as they were. Its days kept (the last 60, `DAYS_KEPT`) are asked again
 * for each kind of result shown that day, for all countries and each country
 * kept ready, a week of days a step, two asks at a time, a minute between
 * steps, one website after another (AGENTS.md, Google's quotas). Once a
 * website's days are in, its ready-made periods are built again whole,
 * asking Google for every long period again, settled or not (`fresh`).
 *
 * Started by hand, once (`npx convex run searchConsolePageRefetch:refetchPages`).
 * It hands itself on, so it never waits on anyone. Google busy: the step
 * waits half an hour and tries once more, and a website still busy after
 * three waits is left, saying so. A refusal is never asked again.
 */

/** Days asked a step. */
const DAYS_PER_STEP = 7;

/** Asks to Google at once. */
const ASKS_AT_ONCE = 2;

/** Gap between steps, so the asks are spread out. */
const STEP_GAP_MS = 60 * 1000;

/** Wait after Google says it is busy, or while the website's own run or settle is going. */
const BUSY_WAIT_MS = 30 * 60 * 1000;

/** Waits for Google before a website is left. */
const MOST_BUSY_WAITS = 3;

/** The kinds of result that keep a page list. */
const PAGE_KINDS: readonly SearchType[] = COLLECTED_SEARCH_TYPES.filter((type) => LISTS_OF[type].includes("page"));

/** Each day from `from` to `to` that a kind keeping a page list was shown in, newest first, with those kinds. */
export const pageDaysOf = internalQuery({
  args: { companyWebsiteId: v.id("companyWebsites"), country: v.optional(v.string()), from: v.string(), to: v.string() },
  returns: v.array(v.object({ day: v.string(), types: v.array(searchTypeValidator) })),
  handler: async (ctx, args) => {
    const byDay = new Map<string, SearchType[]>();
    for (const searchType of PAGE_KINDS) {
      const days = await ctx.db
        .query("searchConsoleDays")
        .withIndex("by_hold_country_type_day", (q) => q
          .eq("companyWebsiteId", args.companyWebsiteId).eq("country", args.country).eq("searchType", searchType).gte("day", args.from).lte("day", args.to))
        // A step's days: a week at most, a row a day.
        .take(DAYS_PER_STEP);
      for (const day of days) {
        if (day.impressions <= 0) continue;
        byDay.set(day.day, [...(byDay.get(day.day) ?? []), searchType]);
      }
    }
    return [...byDay].sort(([left], [right]) => right.localeCompare(left)).map(([day, types]) => ({ day, types }));
  },
});

/** A step's line in the run log, so a later count of Google's asks includes it (AGENTS.md, Google's quotas). */
export const finishRefetchStep = internalMutation({
  args: {
    runId: v.id("searchConsoleRuns"),
    requests: v.number(),
    rows: v.number(),
    refused: v.array(v.string()),
    error: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      finishedAt: Date.now(),
      requests: args.requests,
      rows: args.rows,
      ...(args.refused.length > 0 ? { refused: args.refused } : {}),
      ...(args.error ? { error: args.error } : {}),
    });
    return null;
  },
});

/** Whether the website's own run or a settle is going: the step waits for it, so nothing is fetched or built twice. */
export const websiteBusy = internalQuery({
  args: { connectionId: v.id("searchConsoleConnections") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) return false;
    return settlingNow(connection) || (await siteRunGoing(ctx, connection));
  },
});

const stepArgs = {
  /** The connections left, this one first; missing on the first step, which lists them. */
  queue: v.optional(v.array(v.id("searchConsoleConnections"))),
  /** Which of the website's scopes — all countries, then each country kept ready — this step is in. */
  scope: v.optional(v.number()),
  /** The newest day this step asks; missing for the scope's newest. */
  nextTo: v.optional(v.string()),
  /** The website's days are all in: only its periods are left to build. */
  build: v.optional(v.boolean()),
  /** Times this step has waited for Google, or for the website's own run. */
  waits: v.optional(v.number()),
};

type StepArgs = {
  queue?: Id<"searchConsoleConnections">[];
  scope?: number;
  nextTo?: string;
  build?: boolean;
  waits?: number;
};

const say = (line: string) => console.log(`[pages every country] ${line}`);

export const refetchPages = internalAction({
  args: stepArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    await refetchStep(ctx, args);
    return null;
  },
});

async function handOn(ctx: ActionCtx, args: StepArgs, delayMs = STEP_GAP_MS) {
  await ctx.scheduler.runAfter(delayMs, internal.searchConsolePageRefetch.refetchPages, args);
}

/** The next website: this one's done, or left. */
async function nextWebsite(ctx: ActionCtx, queue: Id<"searchConsoleConnections">[]) {
  await handOn(ctx, { queue: queue.slice(1) });
}

async function refetchStep(ctx: ActionCtx, args: StepArgs): Promise<void> {
  if (args.queue === undefined) {
    // Every connection holding figures; one waiting to be connected again is left at its turn, below.
    const queue = (await ctx.runQuery(internal.searchConsoleSync.connectionsWithFigures, {})).map((held) => held.connectionId);
    say(`${queue.length} websites' pages to fetch again.`);
    if (queue.length > 0) await handOn(ctx, { queue }, 0);
    return;
  }
  const [connectionId] = args.queue;
  if (connectionId === undefined) {
    say("Every website's pages are in.");
    return;
  }
  const state = await ctx.runQuery(internal.searchConsoleSync.stepState, { connectionId });
  if (!state || state.status !== "CONNECTED" || !state.property || state.clearing || state.switchedOff || !state.owned || !state.newestDay) {
    say(`${connectionId}: no longer collected, left.`);
    return await nextWebsite(ctx, args.queue);
  }
  const waits = args.waits ?? 0;
  if (await ctx.runQuery(internal.searchConsolePageRefetch.websiteBusy, { connectionId })) {
    if (waits >= MOST_BUSY_WAITS) {
      say(`${connectionId}: its own run or settle kept going, left. Its pages come in with each night's days.`);
      return await nextWebsite(ctx, args.queue);
    }
    say(`${connectionId}: its own run or settle is going, waiting half an hour.`);
    return await handOn(ctx, { ...args, waits: waits + 1 }, BUSY_WAIT_MS);
  }

  // Every day is in: the website's periods built again, every long period asked of Google again.
  if (args.build) {
    const plan = await planParts(ctx, connectionId);
    const started = plan ? await startParts(ctx, connectionId, plan, undefined, true, false, true) : "STARTED";
    if (started === "ALREADY_GOING") {
      if (waits >= MOST_BUSY_WAITS) {
        say(`${connectionId}: a settle kept going, so its periods are built by the next weekly rebuild.`);
        return await nextWebsite(ctx, args.queue);
      }
      return await handOn(ctx, { ...args, waits: waits + 1 }, BUSY_WAIT_MS);
    }
    say(`${connectionId}: pages in, periods being built again.`);
    return await nextWebsite(ctx, args.queue);
  }

  const scopes: Array<string | undefined> = [undefined, ...state.countries];
  const scopeAt = args.scope ?? 0;
  if (scopeAt >= scopes.length) return await handOn(ctx, { queue: args.queue, build: true });
  const country = scopes[scopeAt];
  const scope = country === undefined ? {} : { country };
  const held = country === undefined ? state : await ctx.runQuery(internal.searchConsoleSync.stepState, { connectionId, country });
  const nextScope = () => handOn(ctx, { queue: args.queue, scope: scopeAt + 1 });
  if (!held || !held.kept || !held.newestDay || !held.oldestDay) return await nextScope();
  const firstKept = shiftDay(held.newestDay, -(DAYS_KEPT - 1));
  const from = held.oldestDay > firstKept ? held.oldestDay : firstKept;
  const to = args.nextTo ?? held.newestDay;
  if (to < from) return await nextScope();
  const weekBack = shiftDay(to, -(DAYS_PER_STEP - 1));
  const stepFrom = weekBack > from ? weekBack : from;
  const days = await ctx.runQuery(internal.searchConsolePageRefetch.pageDaysOf, { companyWebsiteId: state.companyWebsiteId, ...scope, from: stepFrom, to });
  const property = state.property;

  const token = await accessTokenFor(ctx, connectionId);
  if (!token.ok) {
    say(`${connectionId}: its Google sign-in needs attention (${token.problem}), left.`);
    return await nextWebsite(ctx, args.queue);
  }
  let accessToken = token.accessToken;
  let renewed = false;
  const runId = await ctx.runMutation(internal.searchConsoleSync.startRun, {
    connectionId, companyWebsiteId: state.companyWebsiteId, kind: "DAILY", fromDay: stepFrom, toDay: to, startedAt: Date.now(),
  });
  const counts = { requests: 0, rows: 0, refused: [] as string[] };
  // What stopped the step, set inside the asks below: held in an object, so it is read as set.
  const halt: { failure: GoogleFailure | null } = { failure: null };
  const seen = new Map<string, { first: string; last: string }>();
  const asks = days.flatMap(({ day, types }) => types.map((type) => ({ day, type })));
  let next = 0;

  const askOnce = async (day: string, type: SearchType) => {
    const ask = { startDate: day, endDate: day, type, dimensions: [...GOOGLE_DIMENSIONS.page] };
    let answer = await queryAnalytics(accessToken, property, ask);
    // An expired sign-in is renewed once, and the ask made again: the only ask ever repeated.
    if (!answer.ok && answer.reason === "EXPIRED" && !renewed) {
      renewed = true;
      const fresh = await accessTokenFor(ctx, connectionId, true);
      if (!fresh.ok) return answer;
      accessToken = fresh.accessToken;
      answer = await queryAnalytics(accessToken, property, ask);
    }
    return answer;
  };

  const write = async (day: string, type: SearchType, rows: readonly AnalyticsRow[]) => {
    const pages = fromGoogle(rows, false);
    if (type === "web") {
      for (const row of pages) {
        const was = seen.get(row.key);
        if (!was) seen.set(row.key, { first: day, last: day });
        else {
          if (day < was.first) was.first = day;
          if (day > was.last) was.last = day;
        }
      }
    }
    const fetchedAt = Date.now();
    for (const [index, part] of pack(pages, false).entries()) {
      await ctx.runMutation(internal.searchConsoleSync.writeList, {
        connectionId, property, companyWebsiteId: state.companyWebsiteId, ...scope,
        searchType: type, list: "page", day, part: index, fetchedAt, ...part,
        keys: await encodePagesFromAction(ctx, state.companyWebsiteId, part.keys),
      });
    }
  };

  await Promise.all(Array.from({ length: Math.min(ASKS_AT_ONCE, asks.length) }, async () => {
    while (next < asks.length && !halt.failure) {
      const { day, type } = asks[next];
      next += 1;
      const answer = await askOnce(day, type);
      if (!answer.ok) {
        // Refused for one kind and day: left as it was, never asked again. Anything else stops the step.
        if (answer.reason === "REFUSED") counts.refused.push(`${type}/page ${day}`);
        else halt.failure = answer;
        continue;
      }
      counts.requests += answer.requests;
      counts.rows += answer.rows.length;
      await write(day, type, answer.rows);
    }
  }));

  // New and lost's register of pages, widened by what came in: never narrowed.
  const entries = [...seen].map(([key, span]) => ({ key, ...span }));
  for (let start = 0; start < entries.length && !halt.failure; start += SEEN_CHUNK) {
    await ctx.runMutation(internal.searchConsoleSync.noteSeen, {
      connectionId, property, companyWebsiteId: state.companyWebsiteId, ...scope, searchType: "web", kind: "page", entries: entries.slice(start, start + SEEN_CHUNK),
    });
  }
  const stopped = halt.failure;
  const error = stopped ? `${stopped.reason} ${stopped.status}: ${stopped.detail}` : null;
  await ctx.runMutation(internal.searchConsolePageRefetch.finishRefetchStep, { runId, ...counts, error });
  const where = `${connectionId}${country ? ` (${country})` : ""} ${stepFrom} to ${to}`;
  say(`${where}: ${counts.requests} asks, ${counts.rows} rows${counts.refused.length > 0 ? `, refused ${counts.refused.join(", ")}` : ""}${error ? `, stopped: ${error}` : ""}.`);

  if (stopped) {
    if (stopped.reason === "ACCESS") {
      say(`${connectionId}: Google no longer lets this sign-in read the property, left.`);
      return await nextWebsite(ctx, args.queue);
    }
    if (waits >= MOST_BUSY_WAITS) {
      say(`${connectionId}: Google stayed busy, left. Its pages from ${to} back keep their home country's figures until the next fetch.`);
      return await nextWebsite(ctx, args.queue);
    }
    // Busy: the same days once Google has room again, half an hour on.
    return await handOn(ctx, { ...args, waits: waits + 1 }, BUSY_WAIT_MS);
  }
  if (stepFrom <= from) return await nextScope();
  await handOn(ctx, { queue: args.queue, scope: scopeAt, nextTo: shiftDay(stepFrom, -1) });
}
