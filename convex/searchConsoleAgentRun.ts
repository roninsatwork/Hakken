import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, type ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { failureSummary } from "./roleRuns";
import { STEP_BUDGET_MS, runStep, type StepOutcome } from "./searchConsoleSync";
import { countriesPastLimit } from "./searchConsoleCountries";
import { ALPHA3_TO_ALPHA2 } from "./utils/countryCodes";
import { refreshCountriesAsAll } from "./searchConsoleShrink";

/**
 * The Search Console Collector's job (docs/plans/active/search-console-plan.md
 * §12): what an agent holding the role does when its schedule or Run starts
 * it. Collecting is this agent's alone — no hidden job, nothing on connecting.
 *
 * **A run of its own for each website** (Anthony, 2026-10-02: "a unique run
 * per website so we never hit a limit"). The run the schedule starts only
 * starts one run per website connected to Search Console, a few seconds
 * apart, and says which. Each website's run is a run of the same agent, with
 * its own lines and summary in the agent's Observability, and works in steps
 * of a week at most, each an action of its own — so no run, and no number of
 * websites, meets an action's ten minutes.
 *
 * **Only the newest days**: the days since the newest held, and the last four
 * again while Google's figures settle; a website with nothing held yet gets
 * its last 90 days (plan §14.3, item 7). Nothing older, ever. Google charges
 * nothing, and no model is called, so a run costs nothing.
 *
 * **Then each country kept ready** (§16), one after another in the same run,
 * from its own held days — a country new to the list gets the 90 days too.
 * A country on the list past "Countries kept ready per website" has what was
 * kept for it cleared as the run starts.
 *
 * **Then it settles** (`searchConsoleSettle.ts`): days past 90 roll into their weeks,
 * weeks past 12 months into their months, and the ready-made periods every
 * list reads are rebuilt — a step of its own, as a line on the run.
 *
 * One schedule's runs at a time: a run started while any of the agent's runs
 * is still going — another website's included — stops at once, saying so.
 */

/** The gap between websites' runs starting: one Google account reading many sites is held to 1,200 asks a minute. */
const STAGGER_MS = 5_000;

const siteArgs = {
  connectionId: v.id("searchConsoleConnections"),
  companyId: v.id("companies"),
  host: v.string(),
  property: v.string(),
  from: v.string(),
  top: v.string(),
  /** The countries kept ready, each from its own held days: collected after all countries, in this order. */
  countries: v.array(v.object({ code: v.string(), from: v.string() })),
};

/** A country as a run's lines name it: "United Kingdom (GBR)", or the code alone where no name is known. */
export function countryLabel(code: string): string {
  const alpha2 = ALPHA3_TO_ALPHA2[code.toUpperCase()];
  try {
    const name = alpha2 ? new Intl.DisplayNames(["en-GB"], { type: "region" }).of(alpha2) : undefined;
    return name ? `${name} (${code.toUpperCase()})` : code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

/** The countries kept ready, as a sentence of a run's objective ("Then …") or summary ("With …"); nothing without any. */
const countriesLine = (countries: readonly { code: string }[], lead: "Then" | "With" = "Then") =>
  countries.length === 0 ? "" : ` ${lead} the ${countries.length === 1 ? "country" : `${countries.length} countries`} kept ready: ${countries.map((country) => countryLabel(country.code)).join(", ")}.`;

const dayLabel = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export const days = (from: string, to: string) => (from === to ? dayLabel(from) : `${dayLabel(from)} to ${dayLabel(to)}`);

export const count = (value: number) => value.toLocaleString("en-GB");

const NOT_HISTORY = "The newest days and the last four again; a website, or a country newly kept ready, with nothing held gets its last 90 days, and nothing older is fetched.";
/** A nightly fetch's last word: its lists are added up at other times (`searchConsoleSettling.ts`). */
const ADDED_UP_LATER = "Its lists are added up weekly, after the company's own collection, and when a screen opens them behind.";

export async function finishRun(
  ctx: ActionCtx,
  runId: Id<"agentRuns">,
  workflowExecutionId: Id<"workflowExecutions"> | undefined,
  status: "SUCCESS" | "FAILED",
  summary: string,
) {
  await ctx.runMutation(internal.roleRuns.finishRoleRun, {
    runId,
    ...(workflowExecutionId ? { workflowExecutionId } : {}),
    status,
    summary,
  });
}

/** The run the schedule or Run starts: one run of its own for each connected website. */
export const runSearchConsoleCollectorNow = internalAction({
  args: { runId: v.id("agentRuns"), workflowExecutionId: v.optional(v.id("workflowExecutions")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.roleRuns.markRunStarted, { runId: args.runId });
    try {
      const turn = await ctx.runMutation(internal.roleRuns.takeRoleTurn, { runId: args.runId });
      if (!turn.ok) {
        await finishRun(ctx, args.runId, args.workflowExecutionId, "SUCCESS", turn.message);
        return null;
      }
      const sites = await ctx.runQuery(internal.searchConsoleSync.agentCollections, {});
      if (sites.length === 0) {
        await finishRun(ctx, args.runId, args.workflowExecutionId, "SUCCESS", "No website is connected to Search Console, so there was nothing to collect.");
        return null;
      }
      const hosts = sites.map((site) => site.host).join(", ");
      await ctx.runMutation(internal.roleRuns.recordObservation, {
        runId: args.runId,
        text: `${sites.length === 1 ? "1 website is" : `${sites.length} websites are`} connected to Search Console: ${hosts}. Each gets a run of its own.`,
      });
      for (const [index, site] of sites.entries()) {
        await ctx.runMutation(internal.searchConsoleAgentRun.startSiteRun, { parentRunId: args.runId, ...site, delayMs: index * STAGGER_MS });
        await ctx.runMutation(internal.roleRuns.logRunLine, {
          runId: args.runId,
          companyId: site.companyId,
          heading: site.host,
          detail: `Its own run started: ${days(site.from, site.top)}.${countriesLine(site.countries)}`,
          failed: false,
        });
      }
      await finishRun(
        ctx,
        args.runId,
        args.workflowExecutionId,
        "SUCCESS",
        `Started a run of its own for ${sites.length === 1 ? "the 1 website" : `each of the ${sites.length} websites`} connected to Search Console: ${hosts}. ${NOT_HISTORY}`,
      );
    } catch (error: unknown) {
      await finishRun(ctx, args.runId, args.workflowExecutionId, "FAILED", failureSummary(error));
    }
    return null;
  },
});

/**
 * One website's run, under the same agent as the run that started it, and its
 * first step. Countries on the website's list past its limit have what was
 * kept for them cleared now, so a lowered limit leaves nothing stale.
 */
export const startSiteRun = internalMutation({
  args: { parentRunId: v.id("agentRuns"), ...siteArgs, delayMs: v.number() },
  returns: v.union(v.id("agentRuns"), v.null()),
  handler: async (ctx, args) => {
    const parent = await ctx.db.get(args.parentRunId);
    if (!parent) return null;
    const connection = await ctx.db.get(args.connectionId);
    const hold = connection ? await ctx.db.get(connection.companyWebsiteId) : null;
    if (hold) {
      for (const country of await countriesPastLimit(ctx, hold)) {
        await ctx.scheduler.runAfter(0, internal.searchConsoleCountries.clearCountry, { companyWebsiteId: hold._id, country });
      }
    }
    const now = Date.now();
    const runId = await ctx.db.insert("agentRuns", {
      agentId: parent.agentId,
      triggerType: "EVENT",
      objective: `Collect ${args.host}'s newest Search Console days (${args.property}): ${days(args.from, args.top)}.${countriesLine(args.countries)} ${NOT_HISTORY}`,
      title: `Search Console: ${args.host}`,
      status: "QUEUED",
      companyId: args.companyId,
      startedAt: now,
      updatedAt: now,
    });
    const workflowExecutionId = await ctx.db.insert("workflowExecutions", {
      agentId: parent.agentId,
      agentRunId: runId,
      triggerType: "EVENT",
      status: "RUNNING",
      startedAt: now,
    });
    // The days this run fetches, so Collection pipeline can say how far it has got.
    if (connection) await ctx.db.patch(connection._id, { collecting: { runId, from: args.from, top: args.top } });
    // Which countries kept ready are nearly all of its searches, read as all countries (finish-off plan 2B).
    if (connection) await refreshCountriesAsAll(ctx, connection);
    await ctx.scheduler.runAfter(args.delayMs, internal.searchConsoleAgentRun.collectSiteStep, {
      runId,
      workflowExecutionId,
      connectionId: args.connectionId,
      companyId: args.companyId,
      host: args.host,
      property: args.property,
      from: args.from,
      top: args.top,
      countries: args.countries,
      to: args.top,
      rows: 0,
      requests: 0,
    });
    return runId;
  },
});

/** Why a website's run stopped, in plain words. */
function stoppedBecause(outcome: StepOutcome, host: string): string {
  switch (outcome.error) {
    case "REVOKED":
      return `Google stopped letting the connected account read ${host}'s Search Console. Connect it again from its Search Console page.`;
    case "UNREADABLE":
      return `The stored Google sign-in for ${host} can't be read any more. Connect it again from its Search Console page.`;
    case "NOT_CONFIGURED":
      return "Search Console isn't set up on this platform any more, so nothing can be collected.";
    default:
      return `Google answered ${host}'s asks with an error, so its run stopped: ${outcome.error ?? "no detail given"}. Nothing is lost: the next run fetches these days again.`;
  }
}

/**
 * One step of a website's run: up to a week of its days, newest first, as a
 * line on the run — all countries first, then each country kept ready
 * (`at`, its place in `countries`). Days left go to the next step, an action
 * of its own; the next country starts once one is done, and the last
 * settles the run.
 */
export const collectSiteStep = internalAction({
  args: {
    runId: v.id("agentRuns"),
    workflowExecutionId: v.id("workflowExecutions"),
    ...siteArgs,
    /** The country kept ready this step is for, as its place in `countries`; missing for all countries. */
    at: v.optional(v.number()),
    to: v.string(),
    rows: v.number(),
    requests: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const finish = (status: "SUCCESS" | "FAILED", summary: string) =>
      finishRun(ctx, args.runId, args.workflowExecutionId, status, summary);
    const country = args.at === undefined ? undefined : args.countries[args.at];
    if (args.to === args.top && country === undefined) await ctx.runMutation(internal.roleRuns.markRunStarted, { runId: args.runId });
    try {
      const outcome = await runStep(ctx, {
        connectionId: args.connectionId,
        property: args.property,
        from: country?.from ?? args.from,
        top: args.top,
        to: args.to,
        ...(country ? { country: country.code } : {}),
      }, STEP_BUDGET_MS);
      const rows = args.rows + outcome.rows;
      const requests = args.requests + outcome.requests;
      if (outcome.processedFrom) {
        const refused = outcome.refused.length > 0 ? ` Google would not answer ${outcome.refused.length} of them (${outcome.refused.join(", ")}): left out.` : "";
        await ctx.runMutation(internal.roleRuns.logRunLine, {
          runId: args.runId,
          companyId: args.companyId,
          heading: `${days(outcome.processedFrom, outcome.toDay)}${country ? `, ${countryLabel(country.code)}` : ""}`,
          detail: `${count(outcome.rows)} rows from ${count(outcome.requests)} asks to Google${country ? `, for ${countryLabel(country.code)} alone` : ""}.${refused}`,
          failed: false,
        });
      }
      switch (outcome.ended) {
        case "MORE":
          await ctx.scheduler.runAfter(0, internal.searchConsoleAgentRun.collectSiteStep, { ...args, to: outcome.nextTo, rows, requests });
          return null;
        case "DONE":
        case "NOT_KEPT": {
          // All countries, or this country, done: the next country kept ready, else settle.
          const next = args.at === undefined ? 0 : args.at + 1;
          if (next < args.countries.length) {
            await ctx.scheduler.runAfter(0, internal.searchConsoleAgentRun.collectSiteStep, { ...args, at: next, to: args.top, rows, requests });
            return null;
          }
          const summary = `Collected ${args.host}, ${days(args.from, args.top)}: ${count(rows)} rows from ${count(requests)} asks to Google.${countriesLine(args.countries, "With")} ${NOT_HISTORY}`;
          // The nightly fetch adds up nothing but a website's first collection: its figures are added up weekly,
          // after its company's own collection, and when a screen opens them behind (`searchConsoleSettling.ts`).
          if (await ctx.runQuery(internal.searchConsoleSettling.reportsBuilt, { connectionId: args.connectionId })) {
            await finish("SUCCESS", `${summary} ${ADDED_UP_LATER}`);
            return null;
          }
          await ctx.scheduler.runAfter(0, internal.searchConsoleSettle.settleSite, {
            runId: args.runId,
            workflowExecutionId: args.workflowExecutionId,
            connectionId: args.connectionId,
            companyId: args.companyId,
            host: args.host,
            summary,
          });
          return null;
        }
        case "BUSY":
          await finish("FAILED", `Google was too busy to answer for ${args.host}, so not every day from ${days(args.from, args.top)} came in. The next run fetches them again.`);
          return null;
        case "NO_ACCESS":
          await finish("FAILED", `The Google account connected for ${args.host} can no longer read ${args.property} in Search Console. Connect it again from its Search Console page.`);
          return null;
        case "NOT_OWNED":
          await finish("SUCCESS", `${args.host} is no longer one of the company's own websites, so it isn't collected.`);
          return null;
        case "SKIPPED":
          await finish("SUCCESS", `Nothing collected for ${args.host}: it was disconnected, or another property chosen, before its run began.`);
          return null;
        case "STOPPED":
          await finish("FAILED", stoppedBecause(outcome, args.host));
          return null;
      }
    } catch (error: unknown) {
      await finish("FAILED", failureSummary(error));
    }
    return null;
  },
});

/**
 * A website's run, once its days are in: days past 90 into their weeks,
 * weeks past 12 months into their months, and its ready-made periods rebuilt
 * (plan §14.3, items 3 and 4). A line on the run, then its summary.
 */
