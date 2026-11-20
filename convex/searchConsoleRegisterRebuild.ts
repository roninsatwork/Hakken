import { v } from "convex/values";
import { internalAction, internalMutation, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { accessTokenFor } from "./searchConsoleConnect";
import { GOOGLE_DIMENSIONS, queryAnalytics, type GoogleFailure } from "./searchConsoleApi";
import { shiftDay } from "./searchConsoleDays";
import { fromGoogle } from "./utils/searchConsolePacks";
import { SEEN_CHUNK } from "./searchConsoleSync";
import { buildSeenDays } from "./searchConsoleSeenDays";

/**
 * New and lost's register rebuilt from Google, once (search-console-new-and-lost-audit-2026-11-19.md, Anthony's "Yes,
 * build it"). The register said when each search and page was first and last shown in a home country, and two things had
 * made it wrong. It missed searches on days they were shown, then counted them new on a later day it caught them: six of
 * nine sampled "new" searches on More Handles had been shown in the United Kingdom weeks or months before ("fire strips"
 * on 79 days from 14 July, counted new on 19 September). And since 17 November its pages came from the page list, which
 * is every country's, so pages shown only abroad were counted new in the United Kingdom (two of four sampled).
 *
 * For each connected website and each home country, this clears the country's register for web search and its day
 * counts, asks Google for every day the website holds (its oldest to its newest) for the country's own search-and-page
 * lines, with the country's filter, and writes each search and each page from them. Then it counts the register's days
 * again whole. A week of days a step, two asks at a time, a minute between steps, one website after another (AGENTS.md,
 * Google's quotas). While a country is rebuilt its New and lost reads its own lists, and shows the days asked so far.
 *
 * Started by hand, once (`npx convex run searchConsoleRegisterRebuild:rebuildRegister`). It hands itself on, so it never
 * waits on anyone. Google busy: the step waits half an hour and tries once more, and a website still busy after three
 * waits is left, saying so; the nightly collection widens its register from then on.
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
/**
 * Register entries and day counts read, and removed, in one call, all four lists together: well inside Convex's 4,096
 * reads a call. It was 2,000 of each list (8,000 in all) until More Handles' register stopped the first rebuild on
 * 19 November 2026; Ronins' was small enough to pass.
 */
export const CLEAR_READS = 3_000;

const say = (line: string) => console.log(`[new and lost rebuilt] ${line}`);

/** A batch of a country's web register and its day counts removed, `most` reads at most; true once none are left. */
export const clearRegisterSome = internalMutation({
  args: { companyWebsiteId: v.id("companyWebsites"), country: v.optional(v.string()), most: v.optional(v.number()) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    let room = Math.min(args.most ?? CLEAR_READS, CLEAR_READS);
    let left = false;
    for (const kind of ["query", "page"] as const) {
      for (const table of ["searchConsoleSeen", "searchConsoleSeenDays"] as const) {
        if (room === 0) return false;
        const rows = table === "searchConsoleSeen"
          ? await ctx.db.query("searchConsoleSeen")
            .withIndex("by_hold_country_type_kind_key", (q) => q.eq("companyWebsiteId", args.companyWebsiteId).eq("country", args.country).eq("searchType", undefined).eq("kind", kind))
            .take(room)
          : await ctx.db.query("searchConsoleSeenDays")
            .withIndex("by_hold_country_type_kind_day", (q) => q.eq("companyWebsiteId", args.companyWebsiteId).eq("country", args.country).eq("searchType", undefined).eq("kind", kind))
            .take(room);
        for (const row of rows) await ctx.db.delete(row._id);
        // A full take may have more behind it.
        if (rows.length === room) left = true;
        room -= rows.length;
      }
    }
    return !left;
  },
});

const stepArgs = {
  /** The connections left, this one first; missing on the first step, which lists them. */
  queue: v.optional(v.array(v.id("searchConsoleConnections"))),
  /** Which of the website's home countries — the main one held without a country, then each kept ready — this step is in. */
  scope: v.optional(v.number()),
  /** Where the scope is: its register being cleared, its days asked, or its days counted. */
  phase: v.optional(v.union(v.literal("clear"), v.literal("ask"), v.literal("count"))),
  /** The newest day this step asks; missing for the scope's newest. */
  nextTo: v.optional(v.string()),
  /** Times this step has waited for Google, or for the website's own run. */
  waits: v.optional(v.number()),
};

type StepArgs = {
  queue?: Id<"searchConsoleConnections">[];
  scope?: number;
  phase?: "clear" | "ask" | "count";
  nextTo?: string;
  waits?: number;
};

export const rebuildRegister = internalAction({
  args: stepArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    await rebuildStep(ctx, args);
    return null;
  },
});

async function handOn(ctx: ActionCtx, args: StepArgs, delayMs = STEP_GAP_MS) {
  await ctx.scheduler.runAfter(delayMs, internal.searchConsoleRegisterRebuild.rebuildRegister, args);
}

async function nextWebsite(ctx: ActionCtx, queue: Id<"searchConsoleConnections">[]) {
  await handOn(ctx, { queue: queue.slice(1) }, queue.length > 1 ? STEP_GAP_MS : 0);
}

async function rebuildStep(ctx: ActionCtx, args: StepArgs): Promise<void> {
  if (args.queue === undefined) {
    const queue = (await ctx.runQuery(internal.searchConsoleSync.connectionsWithFigures, {})).map((held) => held.connectionId);
    say(`${queue.length} websites' registers to rebuild.`);
    if (queue.length > 0) await handOn(ctx, { queue }, 0);
    return;
  }
  const [connectionId] = args.queue;
  if (connectionId === undefined) {
    say("Every website's register is rebuilt.");
    return;
  }
  const state = await ctx.runQuery(internal.searchConsoleSync.stepState, { connectionId });
  if (!state || state.status !== "CONNECTED" || !state.property || state.clearing || state.switchedOff || !state.owned || !state.newestDay || !state.mainCountry) {
    say(`${connectionId}: no longer collected, left.`);
    return await nextWebsite(ctx, args.queue);
  }
  const waits = args.waits ?? 0;
  if (await ctx.runQuery(internal.searchConsolePageRefetch.websiteBusy, { connectionId })) {
    if (waits >= MOST_BUSY_WAITS) {
      say(`${connectionId}: its own run or settle kept going, left.`);
      return await nextWebsite(ctx, args.queue);
    }
    say(`${connectionId}: its own run or settle is going, waiting half an hour.`);
    return await handOn(ctx, { ...args, waits: waits + 1 }, BUSY_WAIT_MS);
  }

  const scopes: Array<string | undefined> = [undefined, ...state.countries];
  const scopeAt = args.scope ?? 0;
  if (scopeAt >= scopes.length) return await nextWebsite(ctx, args.queue);
  const country = scopes[scopeAt];
  const scope = country === undefined ? {} : { country };
  const nextScope = () => handOn(ctx, { queue: args.queue, scope: scopeAt + 1 }, 0);
  const held = country === undefined ? state : await ctx.runQuery(internal.searchConsoleSync.stepState, { connectionId, country });
  if (!held || !held.kept || !held.newestDay || !held.oldestDay) return await nextScope();
  const where = `${connectionId} (${country ?? state.mainCountry})`;
  const phase = args.phase ?? "clear";

  if (phase === "clear") {
    const done = await ctx.runMutation(internal.searchConsoleRegisterRebuild.clearRegisterSome, { companyWebsiteId: state.companyWebsiteId, ...scope });
    if (!done) return await handOn(ctx, { queue: args.queue, scope: scopeAt, phase: "clear" }, 0);
    say(`${where}: register cleared, asking ${held.oldestDay} to ${held.newestDay}.`);
    return await handOn(ctx, { queue: args.queue, scope: scopeAt, phase: "ask" }, 0);
  }

  if (phase === "count") {
    await buildSeenDays(ctx, { companyWebsiteId: state.companyWebsiteId, country, searchType: "web" }, Date.now());
    say(`${where}: register rebuilt and counted.`);
    return await nextScope();
  }

  // Asking: a week of the scope's days, newest first.
  const from = held.oldestDay;
  const to = args.nextTo ?? held.newestDay;
  if (to < from) return await handOn(ctx, { queue: args.queue, scope: scopeAt, phase: "count" }, 0);
  const weekBack = shiftDay(to, -(DAYS_PER_STEP - 1));
  const stepFrom = weekBack > from ? weekBack : from;
  const days = (await ctx.runQuery(internal.searchConsolePageRefetch.listDaysOf, { companyWebsiteId: state.companyWebsiteId, ...scope, from: stepFrom, to, list: "pair" }))
    .filter((one) => one.types.includes("web"))
    .map((one) => one.day);
  const asked = country ?? state.mainCountry;
  const filter = { dimensionFilterGroups: [{ filters: [{ dimension: "country", operator: "equals", expression: asked }] }] };
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
  const halt: { failure: GoogleFailure | null } = { failure: null };
  const seen = { query: new Map<string, { first: string; last: string }>(), page: new Map<string, { first: string; last: string }>() };
  const note = (into: Map<string, { first: string; last: string }>, key: string, day: string) => {
    const was = into.get(key);
    if (!was) into.set(key, { first: day, last: day });
    else {
      if (day < was.first) was.first = day;
      if (day > was.last) was.last = day;
    }
  };
  const askOnce = async (day: string) => {
    const ask = { startDate: day, endDate: day, type: "web" as const, dimensions: [...GOOGLE_DIMENSIONS.pair], ...filter };
    let answer = await queryAnalytics(accessToken, state.property!, ask);
    if (!answer.ok && answer.reason === "EXPIRED" && !renewed) {
      renewed = true;
      const fresh = await accessTokenFor(ctx, connectionId, true);
      if (!fresh.ok) return answer;
      accessToken = fresh.accessToken;
      answer = await queryAnalytics(accessToken, state.property!, ask);
    }
    return answer;
  };
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(ASKS_AT_ONCE, days.length) }, async () => {
    while (next < days.length && !halt.failure) {
      const day = days[next];
      next += 1;
      const answer = await askOnce(day);
      if (!answer.ok) {
        if (answer.reason === "REFUSED") counts.refused.push(`web/pair ${day}`);
        else halt.failure = answer;
        continue;
      }
      counts.requests += answer.requests;
      counts.rows += answer.rows.length;
      for (const row of fromGoogle(answer.rows, true)) {
        note(seen.query, row.key, day);
        if (row.page) note(seen.page, row.page, day);
      }
    }
  }));
  if (!halt.failure) {
    for (const kind of ["query", "page"] as const) {
      const entries = [...seen[kind]].map(([key, span]) => ({ key, ...span }));
      for (let start = 0; start < entries.length; start += SEEN_CHUNK) {
        await ctx.runMutation(internal.searchConsoleSync.noteSeen, {
          connectionId, property: state.property, companyWebsiteId: state.companyWebsiteId, ...scope, searchType: "web", kind, entries: entries.slice(start, start + SEEN_CHUNK),
        });
      }
    }
  }
  const stopped = halt.failure;
  const error = stopped ? `${stopped.reason} ${stopped.status}: ${stopped.detail}` : null;
  await ctx.runMutation(internal.searchConsolePageRefetch.finishRefetchStep, { runId, ...counts, error });
  say(`${where} ${stepFrom} to ${to}: ${counts.requests} asks, ${counts.rows} rows, ${seen.query.size} searches, ${seen.page.size} pages${error ? `, stopped: ${error}` : ""}.`);
  if (stopped) {
    if (stopped.reason === "ACCESS") {
      say(`${connectionId}: Google no longer lets this sign-in read the property, left.`);
      return await nextWebsite(ctx, args.queue);
    }
    if (waits >= MOST_BUSY_WAITS) {
      say(`${where}: Google stayed busy, left from ${to} back. The nightly collection widens it from here.`);
      return await handOn(ctx, { queue: args.queue, scope: scopeAt, phase: "count" }, 0);
    }
    return await handOn(ctx, { ...args, waits: waits + 1 }, BUSY_WAIT_MS);
  }
  await handOn(ctx, { queue: args.queue, scope: scopeAt, phase: "ask", nextTo: shiftDay(stepFrom, -1) });
}
