import { v, type ObjectType } from "convex/values";
import { internal } from "./_generated/api";
import { memoryNow } from "./utils/stepMemory";
import { internalAction, internalMutation, type ActionCtx, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ROLE_RUN_LIVE_MS, failureSummary, lastMoved } from "./roleRuns";
import { STEP_BUDGET_MS, runStep, type StepOutcome } from "./searchConsoleSync";
import { bookStep, stepKey } from "./collectionSteps";
import { planParts, startParts } from "./searchConsoleSettlePlan";
import { shiftDay } from "./searchConsoleDays";
import { countriesPastLimit } from "./searchConsoleCountries";
import { ALPHA3_TO_ALPHA2 } from "./utils/countryCodes";

/**
 * The Search Console Collector's job (docs/plans/active/search-console-plan.md
 * §12): what an agent holding the role does when its schedule or Run starts
 * it, and — since 2026-10-15 — when a website is connected
 * (search-console-first-collection-plan.md, SF1): that website's own run
 * starts at once (`searchConsoleFirstCollection.ts`). Collecting is this
 * agent's alone — no hidden job.
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
 * its last 90 days (plan §14.3, item 7). Google charges nothing, and no model
 * is called, so a run costs nothing.
 *
 * **Then each country kept ready** (§16), one after another in the same run,
 * from its own held days — a country new to the list gets the 90 days too.
 * A country on the list past "Countries kept ready per website" has what was
 * kept for it cleared as the run starts.
 *
 * **Then its 16 months** (`searchConsoleHistoryFill.ts`, SF2–SF4): each
 * scope's day totals and chart weeks and months back to Google's line, where
 * not yet held, paced, each a line on the run.
 *
 * **Then it settles** (`searchConsoleSettle.ts`) on a first collection: the
 * ready-made periods every list reads are added up, as a chain of jobs per
 * kind of result — a step of its own, as a line on the run.
 *
 * One schedule's runs at a time: a run the schedule or Run starts while
 * another of those is still going stops at once, saying so. A website's own
 * run doesn't stop it: that website is left to it (`takeCollectorTurn`).
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
  /** The main home country, collected first, held without a country (`mainConsoleCountry`). */
  main: v.string(),
  /** The countries kept ready beside it, each from its own held days: collected after it, in this order. */
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

const NOT_HISTORY = "The newest days and the last four again; a website, or a country newly kept ready, with nothing held gets its last 90 days, then its day totals back to Google's sixteen months.";
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
      const turn = await ctx.runMutation(internal.searchConsoleAgentRun.takeCollectorTurn, { runId: args.runId });
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
        // Its figures are its main home country's, or cleared to be collected so at the next run.
        if ((await ctx.runMutation(internal.searchConsoleMainCountry.prepareMainCountry, { connectionId: site.connectionId })) === "SWITCHING") {
          await ctx.runMutation(internal.roleRuns.logRunLine, {
            runId: args.runId,
            companyId: site.companyId,
            heading: site.host,
            detail: "Its figures were for all countries, or another main country: cleared, to collect its main home country's 90 days at the next run.",
            failed: false,
          });
          continue;
        }
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
    const { parentRunId: _parent, delayMs, ...site } = args;
    return await beginSiteRun(ctx, parent.agentId, site, delayMs);
  },
});

type Site = ObjectType<typeof siteArgs>;

/**
 * One website's own run of the Collector, and its first step: the nightly
 * run's for each website, and a website's first collection on connecting
 * (`searchConsoleFirstCollection.ts`). Countries on the website's list past
 * its limit have what was kept for them cleared now, so a lowered limit
 * leaves nothing stale.
 */
export async function beginSiteRun(ctx: MutationCtx, agentId: Id<"agents">, site: Site, delayMs: number): Promise<Id<"agentRuns">> {
  const connection = await ctx.db.get(site.connectionId);
  const hold = connection ? await ctx.db.get(connection.companyWebsiteId) : null;
  if (hold) {
    for (const country of await countriesPastLimit(ctx, hold)) {
      await ctx.scheduler.runAfter(0, internal.searchConsoleCountries.clearCountry, { companyWebsiteId: hold._id, country });
    }
  }
  const now = Date.now();
  const runId = await ctx.db.insert("agentRuns", {
    agentId,
    triggerType: "EVENT",
    objective: `Collect ${site.host}'s newest Search Console days in ${countryLabel(site.main)} (${site.property}): ${days(site.from, site.top)}.${countriesLine(site.countries)} ${NOT_HISTORY}`,
    title: `Search Console: ${site.host}`,
    status: "QUEUED",
    companyId: site.companyId,
    startedAt: now,
    updatedAt: now,
  });
  const workflowExecutionId = await ctx.db.insert("workflowExecutions", {
    agentId,
    agentRunId: runId,
    triggerType: "EVENT",
    status: "RUNNING",
    startedAt: now,
  });
  // The days this run fetches, so Collection pipeline can say how far it has got.
  if (connection) await ctx.db.patch(connection._id, { collecting: { runId, from: site.from, top: site.top } });
  // Its first step, watched (collection-reliability-plan.md, RR1).
  const first: SiteStep = { runId, workflowExecutionId, ...site, to: site.top, rows: 0, requests: 0 };
  await bookStep(ctx, { key: runStepKey(site.connectionId), chain: "SC_RUN", runId, args: first, place: placeOf(first), delayMs });
  return runId;
}

/**
 * A website's run once its days, and its 16 months, are in: added up when its
 * lists have never been built — its first collection — else finished, its
 * lists added up weekly, after its company's own collection, and when a
 * screen opens them behind (`searchConsoleSettling.ts`).
 */
export async function afterDays(ctx: ActionCtx, run: SiteStep): Promise<void> {
  const summary = `Collected ${run.host}, ${days(run.from, run.top)}: ${count(run.rows)} rows from ${count(run.requests)} asks to Google.${countriesLine(run.countries, "With")} ${NOT_HISTORY}`;
  try {
    if (await ctx.runQuery(internal.searchConsoleSettling.reportsBuilt, { connectionId: run.connectionId })) {
      await finishRun(ctx, run.runId, run.workflowExecutionId, "SUCCESS", `${summary} ${ADDED_UP_LATER}`);
      return;
    }
    // Its first collection: its lists added up now, one watched job a kind of result and country, booked from inside
    // this watched step, so nothing between the days and the adding-up goes unwatched (collection-reliability-plan.md, RR1).
    const plan = await planParts(ctx, run.connectionId);
    if (plan === null) {
      await finishRun(ctx, run.runId, run.workflowExecutionId, "SUCCESS", summary);
      return;
    }
    await ctx.runMutation(internal.roleRuns.logRunLine, {
      runId: run.runId,
      companyId: run.companyId,
      heading: "Kept",
      detail: `The lists added up as ${count(plan.parts.length)} ${plan.parts.length === 1 ? "job" : "jobs"} side by side, then the lines past the 60 days kept cleared.`,
      failed: false,
    });
    await startParts(ctx, run.connectionId, plan, { runId: run.runId, workflowExecutionId: run.workflowExecutionId, companyId: run.companyId, summary });
  } catch (error: unknown) {
    await finishRun(ctx, run.runId, run.workflowExecutionId, "FAILED", `The days came in, but adding them up stopped: ${failureSummary(error)} The next run adds them up again.`);
  }
}

/**
 * Whether the Collector's own run may do its job: only one of those at a
 * time, so nothing is fetched twice. A website's own run — a run of the same
 * agent, kept with its company — doesn't stop it: the run leaves that website
 * to it (`agentCollections`), so a first collection started on connecting
 * late in the evening never costs every other website its night
 * (search-console-first-collection-plan.md, SF1).
 */
export const takeCollectorTurn = internalMutation({
  args: { runId: v.id("agentRuns") },
  returns: v.object({ ok: v.boolean(), message: v.string() }),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return { ok: false, message: "This run no longer exists." };
    const now = Date.now();
    const recent = await ctx.db
      .query("agentRuns")
      .withIndex("by_agent_started", (q) => q.eq("agentId", run.agentId))
      .order("desc")
      .take(COLLECTOR_RUNS_READ);
    const ahead = recent.find((other) =>
      other._id !== run._id
      && other.companyId === undefined
      && (other.status === "QUEUED" || other.status === "RUNNING")
      && now - lastMoved(other) < ROLE_RUN_LIVE_MS
      && (other.startedAt < run.startedAt || (other.startedAt === run.startedAt && other._id < run._id)));
    if (!ahead) return { ok: true, message: "" };
    const at = new Date(ahead.startedAt).toISOString().slice(11, 16);
    return { ok: false, message: `Another run, started at ${at} UTC, is still going. This one stopped without doing anything, so nothing is done twice.` };
  },
});

/** The agent's newest runs read to find another of its own still going: each website's runs are among them, so more than one schedule's. */
const COLLECTOR_RUNS_READ = 50;

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
 * line on the run — the main home country first, then each country kept
 * ready beside it (`at`, its place in `countries`). Days left go to the next step, an action
 * of its own; the next country starts once one is done, and the last
 * settles the run.
 */
/** One step of a website's run, as it hands itself on — and, once its days are in, as its 16-month fill carries it to its end. */
export const siteStepArgs = {
  runId: v.id("agentRuns"),
  workflowExecutionId: v.id("workflowExecutions"),
  ...siteArgs,
  /** The country kept ready this step is for, as its place in `countries`; missing for the main one. */
  at: v.optional(v.number()),
  to: v.string(),
  rows: v.number(),
  requests: v.number(),
};
export type SiteStep = ObjectType<typeof siteStepArgs>;

/** A step of the run, watched (`collectionSteps.ts`, RR1): its booking, and whether its watch gave up carrying it on. */
export const watchedStepArgs = {
  ...siteStepArgs,
  booking: v.optional(v.number()),
  closeOnly: v.optional(v.boolean()),
};

/** A website's run's watched chain: one a connection, written over by each run. */
export function runStepKey(connectionId: Id<"searchConsoleConnections">): string {
  return stepKey("SC_RUN", connectionId);
}

/** A website's 16-month fill's watched chain (`searchConsoleHistoryFill.ts`). */
export function fillStepKey(connectionId: Id<"searchConsoleConnections">): string {
  return stepKey("SC_FILL", connectionId);
}

/** Where a run is, in plain words: the same place started again is another try at it (RR1). */
function placeOf(step: SiteStep): string {
  const country = step.at === undefined ? undefined : step.countries[step.at];
  return `${country ? `${countryLabel(country.code)}, ` : ""}the days to ${step.to}`;
}

/**
 * Watched (collection-reliability-plan.md, RR1): a step the platform stopped
 * is started again by its watch from the step's own start — a day already in
 * keeps its lists, as its totals are written last — the second time a day at
 * a time, carefully; the third time that day is left out, saying so, and the
 * next run fetches it again.
 */
export async function collectSiteStepHandler(ctx: ActionCtx, watched: ObjectType<typeof watchedStepArgs>): Promise<null> {
    const { booking, closeOnly, ...args } = watched;
    const key = runStepKey(args.connectionId);
    const begun = await ctx.runMutation(internal.collectionSteps.stepStarted, { key, ...(booking !== undefined ? { booking } : {}) });
    if (!begun.go) return null;
    const finish = async (status: "SUCCESS" | "FAILED", summary: string) => {
      await finishRun(ctx, args.runId, args.workflowExecutionId, status, summary);
      await ctx.runMutation(internal.collectionSteps.closeChain, { ...memoryNow(), key });
    };
    const handOn = async (next: SiteStep) => await ctx.runMutation(internal.collectionSteps.handOn, { ...memoryNow(),
      key, chain: "SC_RUN", runId: args.runId, args: next, place: placeOf(next), ...(booking !== undefined ? { from: booking } : {}),
    });
    if (closeOnly) {
      await finish("FAILED", `The platform kept stopping ${args.host}'s run, so it ended with what it had collected. The next run fetches the rest.`);
      return null;
    }
    const country = args.at === undefined ? undefined : args.countries[args.at];
    const from = country?.from ?? args.from;
    // Every country's days in, or this country's: the next country kept ready, else the 16 months (SF2), whose last
    // step adds the lists up or ends the run (`afterDays`).
    const scopeDone = async (rows: number, requests: number) => {
      const next = args.at === undefined ? 0 : args.at + 1;
      if (next < args.countries.length) {
        await handOn({ ...args, at: next, to: args.top, rows, requests });
        return;
      }
      const run = { ...args, rows, requests };
      await ctx.runMutation(internal.collectionSteps.startChain, {
        key: fillStepKey(args.connectionId), chain: "SC_FILL", runId: args.runId, args: { run, done: [], busy: 0, asks: 0 }, place: "the 16 months, from the start",
      });
      await ctx.runMutation(internal.collectionSteps.closeChain, { ...memoryNow(), key });
    };
    let to = args.to;
    if (begun.skip) {
      // Stopped by the platform three times on the same day: that day is left out, and the run goes on past it (RR1).
      await ctx.runMutation(internal.roleRuns.logRunLine, {
        runId: args.runId,
        companyId: args.companyId,
        heading: `${days(to, to)}${country ? `, ${countryLabel(country.code)}` : ""}`,
        detail: "Left out: the platform stopped this day's step three times. The next run fetches it again.",
        failed: true,
      });
      to = shiftDay(to, -1);
      if (to < from) {
        await scopeDone(args.rows, args.requests);
        return null;
      }
    }
    if (args.to === args.top && country === undefined && !begun.skip) await ctx.runMutation(internal.roleRuns.markRunStarted, { runId: args.runId });
    try {
      const outcome = await runStep(ctx, {
        connectionId: args.connectionId,
        property: args.property,
        from,
        top: args.top,
        to,
        ...(country ? { country: country.code } : {}),
      }, STEP_BUDGET_MS, begun.careful ? { days: 1, parallel: 1 } : {});
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
          await handOn({ ...args, to: outcome.nextTo, rows, requests });
          return null;
        case "DONE":
        case "NOT_KEPT":
          await scopeDone(rows, requests);
          return null;
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
}

/**
 * A website's run, once its days are in: days past 90 into their weeks,
 * weeks past 12 months into their months, and its ready-made periods rebuilt
 * (plan §14.3, items 3 and 4). A line on the run, then its summary.
 */
