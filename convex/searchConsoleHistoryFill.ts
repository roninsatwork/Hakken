import { v, type ObjectType } from "convex/values";
import { internal } from "./_generated/api";
import { memoryNow } from "./utils/stepMemory";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { afterDays, countryLabel, count, fillStepKey, siteStepArgs, type SiteStep } from "./searchConsoleAgentRun";
import { LISTS_OF } from "./searchConsoleApi";
import { countriesKeptReady, mainConsoleCountry, withHeld } from "./searchConsoleCountries";
import { historyLimitDay, shiftDay } from "./searchConsoleDays";
import { chartFillOf, chartPeriodsToFill, periodFigures } from "./searchConsoleHistoryDays";
import { daysBetween } from "./searchConsolePeriods";
import { askLive, countryFilters } from "./searchConsoleReads";
import { kindsHeld } from "./searchConsoleRollups";
import type { SearchType } from "./searchConsoleSchema";
import { STEP_BUDGET_MS } from "./searchConsoleSync";
import { stepEnd } from "./utils/searchConsolePacks";

/**
 * A website's sixteen months, as the last stage of its own run
 * (docs/plans/active/search-console-first-collection-plan.md, SF2–SF4;
 * Anthony, 2026-10-15: "Fill straight after the first 90 days, paced, with
 * lines on the run, carrying on if cut short. No waiting for the night.").
 *
 * Once every country's days are in, each scope still short of Google's
 * sixteen-month line is filled. The scopes are the main home country and each
 * country kept ready (SF3), and each gets:
 * - its day totals, one ask per kind of result
 * - the Position bands and Brand charts' weeks and months before collection
 *   began, inside the charts' reach
 * Never the per-day searches and pages: Google keeps those and answers for
 * free (keep-less-history-plan.md, rule 2).
 *
 * - **Paced** (SF4): one ask at a time, a second apart, far inside Google's
 *   1,200 a minute.
 * - **Busy:** when Google says it is busy, the fill waits ten minutes and
 *   carries on, three times at most, then leaves the rest to the next run. It
 *   never retries in a loop (AGENTS.md, "Respect Google's quotas").
 * - **Lines:** each scope filled is a line on the run.
 * - **Cut short, it loses nothing:** what was fetched is kept, and the next
 *   run asks only for what is not yet held. A scope is marked whole (its
 *   `daysFrom`) only once every ask for it is in.
 *
 * Google asks nothing for it, and no model is called.
 */

/** A second between asks: about 60 a minute, a twentieth of what Google allows one website or account. */
const PACE_MS = 1_000;
/** How long the fill waits when Google says it is busy, before asking again. Under a live run's 15 minutes, so the run still reads as going. */
const BUSY_WAIT_MS = 10 * 60 * 1000;
/** Busy waits in one run; past them, the next run carries on. */
const MOST_BUSY_WAITS = 3;
/** Days written a call: a kind's sixteen months in a few writes. */
const DAYS_A_WRITE = 120;

const scopeValidator = v.object({
  /** Missing for the main home country. */
  country: v.optional(v.string()),
  oldestDay: v.string(),
  types: v.array(v.string()),
  reach: v.union(v.string(), v.null()),
  newest: v.string(),
  /** The chart weeks and months already held, as "WEEK 2026-05-04". */
  held: v.array(v.string()),
});

/** What the fill needs: the connection while it is connected and collected, and each scope still short of Google's line. */
export const fillTarget = internalQuery({
  args: { connectionId: v.id("searchConsoleConnections") },
  returns: v.union(v.null(), v.object({
    property: v.string(),
    main: v.string(),
    brandWords: v.array(v.string()),
    scopes: v.array(scopeValidator),
  })),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.status !== "CONNECTED" || !connection.property || connection.clearing || connection.switchedOff) return null;
    const hold = await ctx.db.get(connection.companyWebsiteId);
    if (!hold) return null;
    const wanted: Array<{ country?: string; oldestDay: string; newestDay: string }> = [];
    if (connection.oldestDay && connection.newestDay && !connection.daysFrom) wanted.push({ oldestDay: connection.oldestDay, newestDay: connection.newestDay });
    for (const country of await countriesKeptReady(ctx, hold)) {
      const held = connection.countriesHeld?.find((entry) => entry.country === country);
      if (held && !held.daysFrom) wanted.push({ country, oldestDay: held.oldestDay, newestDay: held.newestDay });
    }
    const scopes = [];
    let brandWords: string[] = [];
    for (const one of wanted) {
      const charts = await chartFillOf(ctx, connection, one.country);
      if (charts) brandWords = charts.brandWords;
      scopes.push({
        ...(one.country ? { country: one.country } : {}),
        oldestDay: one.oldestDay,
        types: await kindsHeld(ctx, hold._id, one.country),
        reach: charts?.reach ?? null,
        newest: charts?.newest ?? one.newestDay,
        held: charts?.held ?? [],
      });
    }
    return { property: connection.property, main: mainConsoleCountry(hold), brandWords, scopes };
  },
});

/** A country kept ready's day totals now begin at Google's line: said once every ask for it is in. */
export const markCountryDaysFrom = internalMutation({
  args: { connectionId: v.id("searchConsoleConnections"), property: v.string(), country: v.string(), daysFrom: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    const held = connection?.countriesHeld?.find((entry) => entry.country === args.country);
    if (!connection || connection.property !== args.property || connection.clearing || !held) return null;
    await ctx.db.patch(connection._id, {
      countriesHeld: withHeld(connection.countriesHeld, args.country, { newestDay: held.newestDay, oldestDay: held.oldestDay }, args.daysFrom),
      updatedAt: Date.now(),
    });
    return null;
  },
});

type Asked = { ok: true; rows: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }> } | { ok: false; problem: string };

/** The fill's step: as many asks as fit, a second apart, then handed on, waiting for Google, or the run ended. */
export const fillSiteStepArgs = {
  run: v.object(siteStepArgs),
  /** Asks done in this run, as "gbr|days|web" or "gbr|WEEK 2026-05-04|web": never asked twice in it. */
  done: v.array(v.string()),
  busy: v.number(),
  asks: v.number(),
  /** The booking this step is (`collectionSteps.ts`, RR1): missing on a step booked before the watch. */
  booking: v.optional(v.number()),
  /** Its watch gave up carrying it on: the fill stops here, and the run goes on to its end. */
  closeOnly: v.optional(v.boolean()),
};

/** The fill's step, in the Node runtime (`searchConsoleSteps.fillSiteStep`). */
export async function fillSiteStepHandler(ctx: ActionCtx, args: ObjectType<typeof fillSiteStepArgs>): Promise<null> {
  {
    const run: SiteStep = args.run;
    const key = fillStepKey(run.connectionId);
    const begun = await ctx.runMutation(internal.collectionSteps.stepStarted, { key, ...(args.booking !== undefined ? { booking: args.booking } : {}) });
    if (!begun.go) return null;
    const line = async (heading: string, detail: string, failed = false) =>
      await ctx.runMutation(internal.roleRuns.logRunLine, { runId: run.runId, companyId: run.companyId, heading, detail, failed });
    // The fill's end, whatever stopped it: the run goes on to its adding-up or its end, from inside this watched
    // step, and only then does the fill's chain close (collection-reliability-plan.md, RR1).
    const toEnd = async () => {
      await afterDays(ctx, run);
      await ctx.runMutation(internal.collectionSteps.closeChain, { ...memoryNow(), key });
      return null;
    };
    // Stopped by the platform three times at one place, or given up by its watch: what came in is kept.
    if (args.closeOnly || begun.skip) {
      await line("16 months: stopped", "The platform kept stopping the fill's steps, so what came in is kept and the next run asks for the rest.", true);
      return await toEnd();
    }
    const target = await ctx.runQuery(internal.searchConsoleHistoryFill.fillTarget, { connectionId: run.connectionId });
    if (!target || target.scopes.length === 0) return await toEnd();
    const started = Date.now();
    const from = historyLimitDay(started);
    const done = new Set(args.done);
    let asks = args.asks;
    const handOn = async (delayMs: number, busy: number) => await ctx.runMutation(internal.collectionSteps.handOn, { ...memoryNow(),
      key,
      chain: "SC_FILL",
      runId: run.runId,
      args: { run, done: [...done], busy, asks },
      place: `the 16 months, ${count(done.size)} asks in`,
      delayMs,
      ...(args.booking !== undefined ? { from: args.booking } : {}),
    });

    for (const scope of target.scopes) {
      const name = countryLabel(scope.country ?? target.main);
      const tag = scope.country ?? "";
      const to = shiftDay(scope.oldestDay, -1);
      // Collection began at Google's line already: nothing older to fetch.
      if (from > to) {
        await markWhole(ctx, run, target.property, scope.country, scope.oldestDay);
        continue;
      }
      const filter = scope.country ? { dimensionFilterGroups: [{ filters: countryFilters(scope.country) }] } : {};
      const problems: string[] = [];
      let days = 0;
      let periods = 0;
      let scopeAsks = 0;
      const ask = async (key: string, run: () => Promise<Asked>): Promise<Asked | "SKIP" | "OUT_OF_TIME" | "BUSY"> => {
        if (done.has(key)) return "SKIP";
        if (Date.now() - started > STEP_BUDGET_MS) return "OUT_OF_TIME";
        await new Promise((resolve) => setTimeout(resolve, PACE_MS));
        const answer = await run();
        if (!answer.ok && answer.problem === "GOOGLE_BUSY") return "BUSY";
        done.add(key);
        asks += 1;
        scopeAsks += 1;
        return answer;
      };
      const stopAt = async (stopped: "OUT_OF_TIME" | "BUSY"): Promise<null> => {
        if (scopeAsks > 0) await line(`16 months, ${name}`, `${count(scopeAsks)} asks to Google so far: ${count(days)} days and ${count(periods)} chart weeks and months.`);
        if (stopped === "OUT_OF_TIME") {
          await handOn(0, args.busy);
          return null;
        }
        if (args.busy >= MOST_BUSY_WAITS) {
          await line("16 months: Google stayed busy", `Google said it was busy ${MOST_BUSY_WAITS} times. What came in is kept, and the next run asks for the rest.`, true);
          return await toEnd();
        }
        await line("16 months: waiting for Google", "Google said it was busy, so the fill carries on in 10 minutes.");
        await handOn(BUSY_WAIT_MS, args.busy + 1);
        return null;
      };

      // Its day totals, one ask a kind of result.
      for (const searchType of scope.types as SearchType[]) {
        const answer = await ask(`${tag}|days|${searchType}`, () =>
          askLive(ctx, { connectionId: run.connectionId, property: target.property }, { startDate: from, endDate: to, type: searchType, dimensions: ["date"], ...filter }));
        if (answer === "SKIP") continue;
        if (answer === "OUT_OF_TIME" || answer === "BUSY") return await stopAt(answer);
        if (!answer.ok) {
          problems.push(`${searchType}: ${answer.problem}`);
          continue;
        }
        const rows = answer.rows
          .map((row) => ({ day: row.keys[0] ?? "", clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position }))
          .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.day) && row.day >= from && row.day <= to);
        const fetchedAt = Date.now();
        for (let start = 0; start < rows.length; start += DAYS_A_WRITE) {
          days += await ctx.runMutation(internal.searchConsoleHistoryDays.writeHistoryDays, {
            connectionId: run.connectionId, property: target.property, ...(scope.country ? { country: scope.country } : {}), searchType, rows: rows.slice(start, start + DAYS_A_WRITE), fetchedAt,
          });
        }
      }

      // The Position bands and Brand charts' weeks and months before collection began, inside their reach.
      if (scope.reach !== null) {
        for (const searchType of (scope.types as SearchType[]).filter((type) => LISTS_OF[type].includes("pair"))) {
          const toFill = chartPeriodsToFill(from, scope.reach, scope.oldestDay, scope.newest).filter((one) => searchType !== "web" || !scope.held.includes(`${one.grain} ${one.start}`));
          for (const { grain, start } of toFill) {
            const end = stepEnd(start, grain === "WEEK" ? "week" : "month");
            const answer = await ask(`${tag}|${grain} ${start}|${searchType}`, () =>
              askLive(ctx, { connectionId: run.connectionId, property: target.property }, { startDate: start, endDate: end, type: searchType, dimensions: ["query"], ...filter }));
            if (answer === "SKIP") continue;
            if (answer === "OUT_OF_TIME" || answer === "BUSY") return await stopAt(answer);
            if (!answer.ok) {
              problems.push(`${searchType} ${grain.toLowerCase()} of ${start}: ${answer.problem}`);
              continue;
            }
            const figures = periodFigures(answer.rows.map((row) => ({ key: row.keys[0] ?? "", clicks: row.clicks, impressions: row.impressions, position: row.position })), target.brandWords);
            if (await ctx.runMutation(internal.searchConsoleHistoryDays.writeChartPeriod, {
              connectionId: run.connectionId, property: target.property, ...(scope.country ? { country: scope.country } : {}), searchType, grain, start, days: daysBetween(start, end), figures,
            })) periods += 1;
          }
        }
      }

      if (problems.length === 0) {
        await markWhole(ctx, run, target.property, scope.country, from);
        if (scopeAsks > 0) await line(`16 months, ${name}`, `Its day totals now go back to Google's line, ${from}: ${count(days)} days and ${count(periods)} chart weeks and months, from ${count(scopeAsks)} asks to Google.`);
      } else {
        await line(`16 months, ${name}`, `Google would not answer ${problems.length === 1 ? "one ask" : `${count(problems.length)} asks`} (${problems.join("; ")}). What came in is kept, and the next run asks for the rest.`, true);
      }
    }
    return await toEnd();
  }
}

/** A scope whose every ask is in: its day totals now begin at `daysFrom`. */
async function markWhole(ctx: ActionCtx, run: { connectionId: Id<"searchConsoleConnections"> }, property: string, country: string | undefined, daysFrom: string) {
  if (country === undefined) await ctx.runMutation(internal.searchConsoleHistoryDays.markDaysFrom, { connectionId: run.connectionId, property, daysFrom });
  else await ctx.runMutation(internal.searchConsoleHistoryFill.markCountryDaysFrom, { connectionId: run.connectionId, property, country, daysFrom });
}
