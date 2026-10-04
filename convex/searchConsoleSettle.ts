"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { failureSummary } from "./roleRuns";
import { count, countryLabel, days, finishRun } from "./searchConsoleAgentRun";
import { rollUpSite } from "./searchConsoleRollups";
import { buildSitePeriods, readKept } from "./searchConsolePeriods";
import { LISTS_OF } from "./searchConsoleApi";
import { SEEN_CHUNK } from "./searchConsoleSync";
import { shiftDay } from "./searchConsoleDays";
import { monthStart } from "./utils/searchConsolePacks";

/**
 * A website's run settles after its days are in (search-console-plan.md
 * §14.3): days past 90 roll into their weeks and weeks past 12 months into
 * their months, then the ready-made periods and the charts' weeks are added
 * up again. In the Node runtime, which gives an action room for a website's
 * 90 days of keyword-and-page pairs at once — the default runtime's memory is
 * too small for a website of a few thousand pairs a day (reviewed 2026-10-03).
 *
 * All countries first, then each country kept ready (§16), exactly the same
 * way from its own held days — each country an action of its own, so no one
 * action holds more than one country's days or meets an action's ten
 * minutes however many countries a website keeps ready.
 */
export const settleSite = internalAction({
  args: {
    runId: v.id("agentRuns"),
    workflowExecutionId: v.id("workflowExecutions"),
    connectionId: v.id("searchConsoleConnections"),
    companyId: v.id("companies"),
    host: v.string(),
    summary: v.string(),
    /** The country kept ready this settle adds up; missing for all countries, which go first. */
    country: v.optional(v.string()),
    /** The countries still to add up after this one; worked out once all countries are done. */
    countries: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const finish = async () => await finishRun(ctx, args.runId, args.workflowExecutionId, "SUCCESS", args.summary);
    try {
      const state = await ctx.runQuery(internal.searchConsoleSync.stepState, {
        connectionId: args.connectionId,
        ...(args.country === undefined ? {} : { country: args.country }),
      });
      if (!state || state.clearing) {
        await finish();
        return null;
      }
      if (state.newestDay && state.oldestDay && state.kept) {
        const rolled = await rollUpSite(ctx, state.companyWebsiteId, state.newestDay, args.country);
        const written = await buildSitePeriods(ctx, state.companyWebsiteId, state.newestDay, state.oldestDay, args.country);
        // Your pages reads the 90-day page list just built: asked for, not waited on.
        if (args.country === undefined) await ctx.runMutation(internal.holdPages.requestRebuild, { holdId: state.companyWebsiteId });
        await ctx.runMutation(internal.roleRuns.logRunLine, {
          runId: args.runId,
          companyId: args.companyId,
          heading: args.country === undefined ? "Kept and added up" : `Kept and added up, ${countryLabel(args.country)}`,
          detail: `${count(rolled)} ${rolled === 1 ? "day or week" : "days and weeks"} rolled up; the 7-, 30- and 90-day and 12-month lists rebuilt (${count(written)} records), to ${days(state.newestDay, state.newestDay)}.`,
          failed: false,
        });
      } else if (args.country === undefined) {
        // Nothing held for all countries: nothing for any country either.
        await finish();
        return null;
      }
      const left = args.country === undefined ? state.countries : (args.countries ?? []);
      if (left.length > 0) {
        await ctx.scheduler.runAfter(0, internal.searchConsoleSettle.settleSite, { ...args, country: left[0], countries: left.slice(1) });
        return null;
      }
      await finish();
    } catch (error: unknown) {
      await finishRun(ctx, args.runId, args.workflowExecutionId, "FAILED", `The days came in, but adding them up stopped: ${failureSummary(error)} The next run adds them up again.`);
    }
    return null;
  },
});

/**
 * A website's ready-made periods built again from what is kept, with no
 * collection: for all countries, then each country kept ready, each an
 * action of its own. Run by hand when what the periods hold changes shape —
 * on 2026-10-03 the pairs began to be kept in key order, and Pages
 * competing's and Rich results' lists were added — so the screens read the
 * new lists before the Collector's next run. Asks Google only for Rich
 * results' pages per kind, free.
 */
export const rebuildSitePeriods = internalAction({
  args: {
    connectionId: v.id("searchConsoleConnections"),
    country: v.optional(v.string()),
    countries: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await ctx.runQuery(internal.searchConsoleSync.stepState, {
      connectionId: args.connectionId,
      ...(args.country === undefined ? {} : { country: args.country }),
    });
    if (!state || state.clearing) return null;
    if (state.newestDay && state.oldestDay && state.kept) {
      await buildSitePeriods(ctx, state.companyWebsiteId, state.newestDay, state.oldestDay, args.country);
    }
    const left = args.country === undefined ? state.countries : (args.countries ?? []);
    if (left.length > 0) {
      await ctx.scheduler.runAfter(0, internal.searchConsoleSettle.rebuildSitePeriods, { connectionId: args.connectionId, country: left[0], countries: left.slice(1) });
    }
    return null;
  },
});

/**
 * The first- and last-seen register filled for each kind of result other
 * than web from what is kept, with no collection: until 2026-10-03 the
 * register held web results only (drift fixes), so New and lost for images,
 * videos and news starts from the 90 days already held rather than calling
 * everything new. For all countries, then each country kept ready, each an
 * action of its own. Run by hand once; collecting keeps it from then on.
 */
export const fillSeenRegister = internalAction({
  args: {
    connectionId: v.id("searchConsoleConnections"),
    country: v.optional(v.string()),
    countries: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await ctx.runQuery(internal.searchConsoleSync.stepState, {
      connectionId: args.connectionId,
      ...(args.country === undefined ? {} : { country: args.country }),
    });
    if (!state || state.clearing || !state.property) return null;
    const scope = args.country === undefined ? {} : { country: args.country };
    if (state.newestDay && state.kept) {
      const newest = state.newestDay;
      const types = await ctx.runQuery(internal.searchConsoleRollups.typesHeld, { companyWebsiteId: state.companyWebsiteId, ...scope });
      for (const searchType of types.filter((type) => type !== "web")) {
        for (const list of ["pair", "page"] as const) {
          if (!LISTS_OF[searchType].includes(list)) continue;
          const seen = new Map<string, { first: string; last: string }>();
          for (const record of await readKept(ctx, state.companyWebsiteId, args.country, searchType, list, newest)) {
            // A day is its own; a week or a month counts from its first day to its last.
            const last = record.grain === "DAY" ? record.start : record.grain === "WEEK" ? shiftDay(record.start, 6) : shiftDay(monthStart(shiftDay(record.start, 31)), -1);
            const to = last < newest ? last : newest;
            for (const key of record.packed.keys) {
              const was = seen.get(key);
              if (!was) seen.set(key, { first: record.start, last: to });
              else {
                if (record.start < was.first) was.first = record.start;
                if (to > was.last) was.last = to;
              }
            }
          }
          const entries = [...seen].map(([key, days]) => ({ key, ...days }));
          for (let start = 0; start < entries.length; start += SEEN_CHUNK) {
            await ctx.runMutation(internal.searchConsoleSync.noteSeen, {
              connectionId: args.connectionId,
              property: state.property,
              companyWebsiteId: state.companyWebsiteId,
              ...scope,
              searchType,
              kind: list === "pair" ? "query" : "page",
              entries: entries.slice(start, start + SEEN_CHUNK),
            });
          }
        }
      }
    }
    const left = args.country === undefined ? state.countries : (args.countries ?? []);
    if (left.length > 0) {
      await ctx.scheduler.runAfter(0, internal.searchConsoleSettle.fillSeenRegister, { connectionId: args.connectionId, country: left[0], countries: left.slice(1) });
    }
    return null;
  },
});
