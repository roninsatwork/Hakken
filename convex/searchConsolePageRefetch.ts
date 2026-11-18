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
import { keywordPlaces } from "./searchConsoleKeywordBooks";
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
 *
 * **The searches too** (`refetchPairs`, 18 November 2026): every search is
 * kept now (Anthony: "keep every search in the kept lists";
 * `searchConsoleKeep.ts`), so the days kept, which the keep rule had left
 * about one line in nine short, are asked again for their search-and-page
 * lines the same way: one ask a day for each kind of result with searches
 * shown that day (web, video, news), in the home country as collected, for
 * all countries and each country kept ready. The day's keywords go into its
 * month's book, New and lost's register is widened, and the day's clicks
 * named by a search are noted again. Started by hand for the websites named
 * (`queue`), `websiteGapMs` apart, then each website's periods are built
 * again whole, as for the pages. Its asks are in the run log
 * (`searchConsoleRuns`), as every collection's are.
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

/** The lists this asks again: the pages (2026-11-17), or the searches with their pages (2026-11-18). */
type RefetchList = "page" | "pair";
const refetchListValidator = v.union(v.literal("page"), v.literal("pair"));

/** The kinds of result that keep each list: a page list, or search-and-page lines (Google Images keeps none). */
const KINDS_OF: Record<RefetchList, readonly SearchType[]> = {
  page: COLLECTED_SEARCH_TYPES.filter((type) => LISTS_OF[type].includes("page")),
  pair: COLLECTED_SEARCH_TYPES.filter((type) => LISTS_OF[type].includes("pair")),
};

/** Each day from `from` to `to` that a kind keeping the list was shown in, newest first, with those kinds. */
export const listDaysOf = internalQuery({
  args: { companyWebsiteId: v.id("companyWebsites"), country: v.optional(v.string()), from: v.string(), to: v.string(), list: v.optional(refetchListValidator) },
  returns: v.array(v.object({ day: v.string(), types: v.array(searchTypeValidator) })),
  handler: async (ctx, args) => {
    const byDay = new Map<string, SearchType[]>();
    for (const searchType of KINDS_OF[args.list ?? "page"]) {
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

/**
 * A day's clicks named by a search, from its search-and-page lines asked again (`namedClicks`, read by the screens'
 * hidden searches): set when it differs from what is held. The day's own totals are Google's and stay as they are.
 */
export const noteNamedClicks = internalMutation({
  args: { companyWebsiteId: v.id("companyWebsites"), country: v.optional(v.string()), searchType: searchTypeValidator, day: v.string(), namedClicks: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const held = await ctx.db
      .query("searchConsoleDays")
      .withIndex("by_hold_country_type_day", (q) => q
        .eq("companyWebsiteId", args.companyWebsiteId).eq("country", args.country).eq("searchType", args.searchType).eq("day", args.day))
      .unique();
    if (held && held.namedClicks !== args.namedClicks) await ctx.db.patch(held._id, { namedClicks: args.namedClicks });
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
  /** The list asked again: the pages (missing), or the searches with their pages (`refetchPairs`). */
  list: v.optional(refetchListValidator),
  /** Time between one website's last step and the next website's first, so websites' asks don't pile up; a minute when missing. */
  websiteGapMs: v.optional(v.number()),
};

type StepArgs = {
  queue?: Id<"searchConsoleConnections">[];
  scope?: number;
  nextTo?: string;
  build?: boolean;
  waits?: number;
  list?: RefetchList;
  websiteGapMs?: number;
};

const sayFor = (list: RefetchList) => (line: string) => console.log(`[${list === "pair" ? "every search kept" : "pages every country"}] ${line}`);

export const refetchPages = internalAction({
  args: stepArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    await refetchStep(ctx, args);
    return null;
  },
});

/** The days kept asked again for every search's lines (18 November 2026), for the websites in `queue`, or every website holding figures. */
export const refetchPairs = internalAction({
  args: stepArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    await refetchStep(ctx, { ...args, list: "pair" });
    return null;
  },
});

/** The same refetch's next step: the searches' own action for the searches, so the run log names what it asks. */
async function handOn(ctx: ActionCtx, args: StepArgs, delayMs = STEP_GAP_MS) {
  await ctx.scheduler.runAfter(delayMs, args.list === "pair" ? internal.searchConsolePageRefetch.refetchPairs : internal.searchConsolePageRefetch.refetchPages, args);
}

/** The next website: this one's done, or left. */
async function nextWebsite(ctx: ActionCtx, args: StepArgs & { queue: Id<"searchConsoleConnections">[] }) {
  const { list, websiteGapMs } = args;
  await handOn(ctx, { queue: args.queue.slice(1), ...(list ? { list } : {}), ...(websiteGapMs !== undefined ? { websiteGapMs } : {}) }, args.queue.length > 1 ? websiteGapMs ?? STEP_GAP_MS : 0);
}

async function refetchStep(ctx: ActionCtx, args: StepArgs): Promise<void> {
  const list: RefetchList = args.list ?? "page";
  const say = sayFor(list);
  const what = list === "pair" ? "searches" : "pages";
  // What every step hands on with it: the list and the gap between websites.
  const keep = { ...(args.list ? { list: args.list } : {}), ...(args.websiteGapMs !== undefined ? { websiteGapMs: args.websiteGapMs } : {}) };
  if (args.queue === undefined) {
    // Every connection holding figures; one waiting to be connected again is left at its turn, below.
    const queue = (await ctx.runQuery(internal.searchConsoleSync.connectionsWithFigures, {})).map((held) => held.connectionId);
    say(`${queue.length} websites' ${what} to fetch again.`);
    if (queue.length > 0) await handOn(ctx, { queue, ...keep }, 0);
    return;
  }
  const [connectionId] = args.queue;
  if (connectionId === undefined) {
    say(`Every website's ${what} are in.`);
    return;
  }
  const queued = { ...args, queue: args.queue };
  const state = await ctx.runQuery(internal.searchConsoleSync.stepState, { connectionId });
  if (!state || state.status !== "CONNECTED" || !state.property || state.clearing || state.switchedOff || !state.owned || !state.newestDay || (list === "pair" && !state.mainCountry)) {
    say(`${connectionId}: no longer collected, left.`);
    return await nextWebsite(ctx, queued);
  }
  const waits = args.waits ?? 0;
  if (await ctx.runQuery(internal.searchConsolePageRefetch.websiteBusy, { connectionId })) {
    if (waits >= MOST_BUSY_WAITS) {
      say(`${connectionId}: its own run or settle kept going, left. Its ${what} come in with each night's days.`);
      return await nextWebsite(ctx, queued);
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
        return await nextWebsite(ctx, queued);
      }
      return await handOn(ctx, { ...args, waits: waits + 1 }, BUSY_WAIT_MS);
    }
    say(`${connectionId}: ${what} in, periods being built again.`);
    return await nextWebsite(ctx, queued);
  }

  const scopes: Array<string | undefined> = [undefined, ...state.countries];
  const scopeAt = args.scope ?? 0;
  if (scopeAt >= scopes.length) return await handOn(ctx, { queue: args.queue, build: true, ...keep });
  const country = scopes[scopeAt];
  const scope = country === undefined ? {} : { country };
  const held = country === undefined ? state : await ctx.runQuery(internal.searchConsoleSync.stepState, { connectionId, country });
  const nextScope = () => handOn(ctx, { queue: args.queue, scope: scopeAt + 1, ...keep });
  if (!held || !held.kept || !held.newestDay || !held.oldestDay) return await nextScope();
  const firstKept = shiftDay(held.newestDay, -(DAYS_KEPT - 1));
  const from = held.oldestDay > firstKept ? held.oldestDay : firstKept;
  const to = args.nextTo ?? held.newestDay;
  if (to < from) return await nextScope();
  const weekBack = shiftDay(to, -(DAYS_PER_STEP - 1));
  const stepFrom = weekBack > from ? weekBack : from;
  const days = await ctx.runQuery(internal.searchConsolePageRefetch.listDaysOf, { companyWebsiteId: state.companyWebsiteId, ...scope, from: stepFrom, to, list });
  const property = state.property;
  // The searches are asked in the home country, as collected: the one named, or the main one held without a country. The
  // pages are every country's (`EVERY_COUNTRY_LISTS`).
  const asked = country ?? state.mainCountry;
  const filter = list === "pair" && asked ? { dimensionFilterGroups: [{ filters: [{ dimension: "country", operator: "equals", expression: asked }] }] } : {};

  const token = await accessTokenFor(ctx, connectionId);
  if (!token.ok) {
    say(`${connectionId}: its Google sign-in needs attention (${token.problem}), left.`);
    return await nextWebsite(ctx, queued);
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
  // A day's clicks named by a search, for each kind asked (pairs only), noted once the step's asks are in.
  const named: Array<{ day: string; type: SearchType; clicks: number }> = [];
  const asks = days.flatMap(({ day, types }) => types.map((type) => ({ day, type })));
  let next = 0;

  const askOnce = async (day: string, type: SearchType) => {
    const ask = { startDate: day, endDate: day, type, dimensions: [...GOOGLE_DIMENSIONS[list]], ...filter };
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
    const lines = fromGoogle(rows, list === "pair");
    if (list === "pair") named.push({ day, type, clicks: lines.reduce((sum, row) => sum + row.clicks, 0) });
    // New and lost is kept for web search: its searches from the pairs, its pages from the page list.
    if (type === "web") {
      for (const row of lines) {
        const was = seen.get(row.key);
        if (!was) seen.set(row.key, { first: day, last: day });
        else {
          if (day < was.first) was.first = day;
          if (day > was.last) was.last = day;
        }
      }
    }
    const fetchedAt = Date.now();
    for (const [index, part] of pack(lines, list === "pair").entries()) {
      // A search-and-page line's keyword as its place in the month's book, its page as a reference (as `runStep` writes them).
      const keys = list === "pair" ? await keywordPlaces(ctx, state.companyWebsiteId, country, day, part.keys) : await encodePagesFromAction(ctx, state.companyWebsiteId, part.keys);
      const linePages = part.pages ? await encodePagesFromAction(ctx, state.companyWebsiteId, part.pages) : undefined;
      await ctx.runMutation(internal.searchConsoleSync.writeList, {
        connectionId, property, companyWebsiteId: state.companyWebsiteId, ...scope,
        searchType: type, list, day, part: index, fetchedAt, ...part,
        keys,
        ...(linePages ? { pages: linePages } : {}),
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
        if (answer.reason === "REFUSED") counts.refused.push(`${type}/${list} ${day}`);
        else halt.failure = answer;
        continue;
      }
      counts.requests += answer.requests;
      counts.rows += answer.rows.length;
      await write(day, type, answer.rows);
    }
  }));

  // New and lost's register of pages, or of searches, widened by what came in: never narrowed.
  const entries = [...seen].map(([key, span]) => ({ key, ...span }));
  for (let start = 0; start < entries.length && !halt.failure; start += SEEN_CHUNK) {
    await ctx.runMutation(internal.searchConsoleSync.noteSeen, {
      connectionId, property, companyWebsiteId: state.companyWebsiteId, ...scope, searchType: "web", kind: list === "pair" ? "query" : "page", entries: entries.slice(start, start + SEEN_CHUNK),
    });
  }
  for (const one of named) {
    await ctx.runMutation(internal.searchConsolePageRefetch.noteNamedClicks, { companyWebsiteId: state.companyWebsiteId, ...scope, searchType: one.type, day: one.day, namedClicks: one.clicks });
  }
  const stopped = halt.failure;
  const error = stopped ? `${stopped.reason} ${stopped.status}: ${stopped.detail}` : null;
  await ctx.runMutation(internal.searchConsolePageRefetch.finishRefetchStep, { runId, ...counts, error });
  const where = `${connectionId}${country ? ` (${country})` : ""} ${stepFrom} to ${to}`;
  say(`${where}: ${counts.requests} asks, ${counts.rows} rows${counts.refused.length > 0 ? `, refused ${counts.refused.join(", ")}` : ""}${error ? `, stopped: ${error}` : ""}.`);

  if (stopped) {
    if (stopped.reason === "ACCESS") {
      say(`${connectionId}: Google no longer lets this sign-in read the property, left.`);
      return await nextWebsite(ctx, queued);
    }
    if (waits >= MOST_BUSY_WAITS) {
      say(list === "pair"
        ? `${connectionId}: Google stayed busy, left. Its searches from ${to} back keep only the lines kept until 18 November 2026.`
        : `${connectionId}: Google stayed busy, left. Its pages from ${to} back keep their home country's figures until the next fetch.`);
      return await nextWebsite(ctx, queued);
    }
    // Busy: the same days once Google has room again, half an hour on.
    return await handOn(ctx, { ...args, waits: waits + 1 }, BUSY_WAIT_MS);
  }
  if (stepFrom <= from) return await nextScope();
  await handOn(ctx, { queue: args.queue, scope: scopeAt, nextTo: shiftDay(stepFrom, -1), ...keep });
}
