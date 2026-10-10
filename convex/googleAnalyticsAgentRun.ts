import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { failureSummary, lastMoved, ROLE_RUN_LIVE_MS } from "./roleRuns";
import { shiftDay } from "./searchConsoleDays";
import { count, days, finishRun } from "./searchConsoleAgentRun";
import {
  DAYS_PER_STEP,
  STEP_BUDGET_MS,
  analyticsWindow,
  collectDays,
  collectPeriod,
  dueJobs,
  newestWholeDayIn,
  openSession,
  type PeriodJob,
  type StepResult,
} from "./googleAnalyticsCollect";

/**
 * The Google Analytics: Collector Agent's job (docs/plans/active/google-analytics-plan.md
 * §4.1, GA21): what an agent holding the role "Google Analytics Collector"
 * does when its schedule — "Google Analytics: Data Collection Scheduler",
 * daily at 04:00 local, Search Console's time — or Run starts it. Built as
 * the Search Console: Collector Agent is (`searchConsoleAgentRun.ts`).
 *
 * **A run of its own for each website** connected to Google Analytics, a few
 * seconds apart, each in steps of a few minutes — so no run, and no number of
 * websites, meets an action's ten minutes. Each website's run fetches its
 * days (`googleAnalyticsCollect.ts`), then asks Google for its ready-made
 * lists: the 7 and 30 days every run, the 90 days and 12 months once a week.
 * Free — Google charges nothing and no model is called — so every connected
 * website every day, whatever its company's collection schedule.
 *
 * **A newly connected website starts at once** (§10, Q15): saving what counts
 * starts a run for that website alone (`startFirstCollection`), so a client
 * never meets an empty page for a night.
 *
 * One schedule's runs at a time: a run started while any of the agent's runs
 * is still going stops at once, saying so.
 */

export const GOOGLE_ANALYTICS_ROLE = "GOOGLE_ANALYTICS_COLLECTOR";

/** The gap between websites' runs starting: one Google account reading many properties shares Google's limits. */
const STAGGER_MS = 5_000;

/** Connections read per page when listing every connected website. */
const CONNECTIONS_PER_READ = 500;

const NOT_HISTORY = "The newest day and the last two again; a website with nothing held gets the 60 days kept, and its 90 days and 12 months are asked of Google ready-made.";

type Site = { connectionId: Id<"googleAnalyticsConnections">; companyId: Id<"companies">; host: string; property: string };

/** Whether a connection's own run is still going: the daily run leaves it alone, so nothing is collected twice. */
function collectingNow(run: Doc<"agentRuns"> | null, now: number): boolean {
  return run !== null && (run.status === "QUEUED" || run.status === "RUNNING") && now - lastMoved(run) < ROLE_RUN_LIVE_MS;
}

/**
 * What the Collector's run collects: every website connected to Google
 * Analytics with what counts saved, the one longest since it was collected
 * first, so one a run did not reach goes first in the next.
 */
export const agentCollections = internalQuery({
  args: {},
  returns: v.array(v.object({
    connectionId: v.id("googleAnalyticsConnections"),
    companyId: v.id("companies"),
    host: v.string(),
    property: v.string(),
  })),
  handler: async (ctx) => {
    const connected: Doc<"googleAnalyticsConnections">[] = [];
    for (let after = 0; ;) {
      const page = await ctx.db
        .query("googleAnalyticsConnections")
        .withIndex("by_status", (q) => q.eq("status", "CONNECTED").gt("_creationTime", after))
        .take(CONNECTIONS_PER_READ);
      connected.push(...page);
      if (page.length < CONNECTIONS_PER_READ) break;
      after = page[page.length - 1]._creationTime;
    }
    const now = Date.now();
    const out: Site[] = [];
    for (const connection of connected.sort((left, right) => (left.lastCollectedAt ?? 0) - (right.lastCollectedAt ?? 0))) {
      if (!connection.property || connection.clearing) continue;
      if (connection.collecting && collectingNow(await ctx.db.get(connection.collecting.runId), now)) continue;
      const website = await ctx.db.get(connection.websiteId);
      out.push({
        connectionId: connection._id,
        companyId: connection.companyId,
        host: website?.displayHost ?? website?.host ?? connection.property,
        property: connection.property,
      });
    }
    return out;
  },
});

/** The run the schedule or Run starts: one run of its own for each connected website. */
export const runGoogleAnalyticsCollectorNow = internalAction({
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
      const sites = await ctx.runQuery(internal.googleAnalyticsAgentRun.agentCollections, {});
      if (sites.length === 0) {
        await finishRun(ctx, args.runId, args.workflowExecutionId, "SUCCESS", "No website is connected to Google Analytics, so there was nothing to collect.");
        return null;
      }
      const hosts = sites.map((site) => site.host).join(", ");
      await ctx.runMutation(internal.roleRuns.recordObservation, {
        runId: args.runId,
        text: `${sites.length === 1 ? "1 website is" : `${sites.length} websites are`} connected to Google Analytics: ${hosts}. Each gets a run of its own.`,
      });
      for (const [index, site] of sites.entries()) {
        const started = await ctx.runMutation(internal.googleAnalyticsAgentRun.startSiteRun, { parentRunId: args.runId, ...site, delayMs: index * STAGGER_MS });
        await ctx.runMutation(internal.roleRuns.logRunLine, {
          runId: args.runId,
          companyId: site.companyId,
          heading: site.host,
          detail: started ? `Its own run started: ${days(started.from, started.top)}.` : "Not started: it was disconnected meanwhile.",
          failed: false,
        });
      }
      await finishRun(
        ctx,
        args.runId,
        args.workflowExecutionId,
        "SUCCESS",
        `Started a run of its own for ${sites.length === 1 ? "the 1 website" : `each of the ${sites.length} websites`} connected to Google Analytics: ${hosts}. ${NOT_HISTORY}`,
      );
    } catch (error: unknown) {
      await finishRun(ctx, args.runId, args.workflowExecutionId, "FAILED", failureSummary(error));
    }
    return null;
  },
});

/** One website's run, under the agent, and its first step; null when the website is no longer connected. */
async function beginSiteRun(
  ctx: MutationCtx,
  agentId: Id<"agents">,
  site: Site,
  delayMs: number,
): Promise<{ runId: Id<"agentRuns">; from: string; top: string } | null> {
  const connection = await ctx.db.get(site.connectionId);
  if (!connection || connection.status !== "CONNECTED" || connection.property !== site.property) return null;
  const now = Date.now();
  const window = analyticsWindow(connection.newestDay, connection.oldestDay, newestWholeDayIn(now, connection.timeZone ?? "Europe/London"));
  const runId = await ctx.db.insert("agentRuns", {
    agentId,
    triggerType: "EVENT",
    objective: `Collect ${site.host}'s Google Analytics (${site.property}): its days ${days(window.from, window.top)}, then its ready-made lists. ${NOT_HISTORY}`,
    title: `Google Analytics: ${site.host}`,
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
  // The days this run fetches, so its page and Collection pipeline can say how far it has got.
  await ctx.db.patch(connection._id, { collecting: { runId, from: window.from, top: window.top } });
  await ctx.scheduler.runAfter(delayMs, internal.googleAnalyticsAgentRun.collectSiteStep, {
    runId,
    workflowExecutionId,
    ...site,
    from: window.from,
    top: window.top,
    to: window.top,
    weekly: false,
    jobAt: 0,
    rows: 0,
    requests: 0,
  });
  return { runId, from: window.from, top: window.top };
}

export const startSiteRun = internalMutation({
  args: {
    parentRunId: v.id("agentRuns"),
    connectionId: v.id("googleAnalyticsConnections"),
    companyId: v.id("companies"),
    host: v.string(),
    property: v.string(),
    delayMs: v.number(),
  },
  returns: v.union(v.null(), v.object({ runId: v.id("agentRuns"), from: v.string(), top: v.string() })),
  handler: async (ctx, args) => {
    const parent = await ctx.db.get(args.parentRunId);
    if (!parent) return null;
    const { parentRunId: _parent, delayMs, ...site } = args;
    return await beginSiteRun(ctx, parent.agentId, site, delayMs);
  },
});

/**
 * A newly connected website's first collection, started at once (§10, Q15)
 * as a run of the Google Analytics: Collector Agent for that website alone.
 * Without the agent — not created yet, or switched off — nothing starts, and
 * the website waits for the agent's first run.
 */
export async function startFirstCollection(
  ctx: MutationCtx,
  connection: Doc<"googleAnalyticsConnections">,
): Promise<"STARTED" | "NO_AGENT" | "AGENT_OFF"> {
  const agent = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", GOOGLE_ANALYTICS_ROLE)).first();
  if (!agent) return "NO_AGENT";
  if (agent.isActive === false) return "AGENT_OFF";
  const website = await ctx.db.get(connection.websiteId);
  const started = await beginSiteRun(ctx, agent._id, {
    connectionId: connection._id,
    companyId: connection.companyId,
    host: website?.displayHost ?? website?.host ?? connection.property ?? "",
    property: connection.property ?? "",
  }, 0);
  return started ? "STARTED" : "NO_AGENT";
}

/** Why a website's run stopped, in plain words. */
function stoppedBecause(reason: string, host: string): string {
  switch (reason) {
    case "REVOKED":
      return `Google stopped letting the connected account read ${host}'s Google Analytics. Connect it again from its Google Analytics page.`;
    case "UNREADABLE":
      return `The stored Google sign-in for ${host} can't be read any more. Connect it again from its Google Analytics page.`;
    case "NOT_CONFIGURED":
      return "Google Analytics isn't set up on this platform any more, so nothing can be collected.";
    default:
      return `Google answered ${host}'s asks with an error, so its run stopped: ${reason}. Nothing is lost: the next run asks again.`;
  }
}

/**
 * One step of a website's run: its days a week at a time, newest first, then
 * its ready-made lists one after another, until the step's few minutes are
 * up; what is left goes to the next step, an action of its own.
 */
export const collectSiteStep = internalAction({
  args: {
    runId: v.id("agentRuns"),
    workflowExecutionId: v.id("workflowExecutions"),
    connectionId: v.id("googleAnalyticsConnections"),
    companyId: v.id("companies"),
    host: v.string(),
    property: v.string(),
    from: v.string(),
    top: v.string(),
    /** The newest day still to fetch; null once the days are in and the ready-made lists are being asked. */
    to: v.union(v.string(), v.null()),
    /** Whether this run asks the weekly lists too, decided as the days finish. */
    weekly: v.boolean(),
    /** The next ready-made list to ask, as its place in the run's lists. */
    jobAt: v.number(),
    rows: v.number(),
    requests: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const finish = (status: "SUCCESS" | "FAILED", summary: string) => finishRun(ctx, args.runId, args.workflowExecutionId, status, summary);
    const started = Date.now();
    if (args.to === args.top) await ctx.runMutation(internal.roleRuns.markRunStarted, { runId: args.runId });
    try {
      const target = await ctx.runQuery(internal.googleAnalyticsCollect.collectTarget, { connectionId: args.connectionId });
      if (!target || target.status !== "CONNECTED" || target.property !== args.property || target.clearing) {
        await finish("SUCCESS", `Nothing collected for ${args.host}: it was disconnected, or another property chosen, before its run finished.`);
        return null;
      }
      if (!target.owned) {
        await ctx.runMutation(internal.googleAnalyticsConnect.noteProblem, { connectionId: args.connectionId, problem: "NOT_OWNED" });
        await finish("SUCCESS", `${args.host} is no longer one of the company's own websites, so it isn't collected.`);
        return null;
      }
      const opened = await openSession(ctx, args.connectionId);
      if (!opened.ok) {
        await finish("FAILED", stoppedBecause(opened.problem, args.host));
        return null;
      }
      const open = opened.session;

      let to = args.to;
      let weekly = args.weekly;
      let jobAt = args.jobAt;
      let rows = args.rows;
      let jobs: PeriodJob[] = to === null ? jobsFor(weekly) : [];
      const stop = async (result: Extract<StepResult, { ok: false }>) => {
        if (result.access) {
          await ctx.runMutation(internal.googleAnalyticsConnect.noteProblem, { connectionId: args.connectionId, problem: "NO_ACCESS" });
          await finish("FAILED", `The Google account connected for ${args.host} can no longer read ${args.property} in Google Analytics. Connect it again from its Google Analytics page.`);
        } else if (result.busy) {
          await ctx.runMutation(internal.googleAnalyticsConnect.noteProblem, { connectionId: args.connectionId, problem: "GOOGLE_BUSY" });
          await finish("FAILED", `Google was too busy to answer for ${args.host}. Nothing is lost: the next run asks again.`);
        } else {
          await finish("FAILED", stoppedBecause(result.reason, args.host));
        }
      };

      while (Date.now() - started < STEP_BUDGET_MS) {
        if (to !== null) {
          const stepFrom = shiftDay(to, -(DAYS_PER_STEP - 1)) > args.from ? shiftDay(to, -(DAYS_PER_STEP - 1)) : args.from;
          const result = await collectDays(ctx, open, args.connectionId, target, { from: stepFrom, to });
          if (!result.ok) {
            await stop(result);
            return null;
          }
          rows += result.rows;
          await ctx.runMutation(internal.roleRuns.logRunLine, {
            runId: args.runId,
            companyId: args.companyId,
            heading: days(stepFrom, to),
            detail: `The totals and channels by device: ${count(result.rows)} rows.`,
            failed: false,
          });
          to = stepFrom > args.from ? shiftDay(stepFrom, -1) : null;
          if (to === null) {
            weekly = dueJobs({ weeklyPeriodsAt: target.weeklyPeriodsAt }, Date.now()).some((job) => job.period === "90");
            jobs = jobsFor(weekly);
          }
          continue;
        }
        if (jobAt >= jobs.length) {
          await ctx.runMutation(internal.googleAnalyticsCollect.finishCollection, {
            connectionId: args.connectionId,
            property: args.property,
            weekly,
            firstDone: true,
          });
          await ctx.runMutation(internal.roleRuns.logRunLine, {
            runId: args.runId,
            companyId: args.companyId,
            heading: "Ready-made lists",
            detail: `${jobs.length} lists asked of Google ready-made: the last ${weekly ? "7 and 30 days, 90 days and 12 months" : "7 and 30 days"}, each with the span before${weekly ? ", and the 90 days and 12 months a year before" : ""}. A list whose figures did not move was left as it was.`,
            failed: false,
          });
          await finish("SUCCESS", `Collected ${args.host}, ${days(args.from, args.top)}: ${count(rows)} rows from ${count(args.requests + open.requests)} asks to Google. ${NOT_HISTORY}`);
          return null;
        }
        const job = jobs[jobAt];
        const result = await collectPeriod(ctx, open, args.connectionId, target, job, args.top);
        if (!result.ok) {
          await stop(result);
          return null;
        }
        rows += result.rows;
        jobAt += 1;
      }
      // The step's few minutes are up: the rest in a step of its own.
      await ctx.scheduler.runAfter(0, internal.googleAnalyticsAgentRun.collectSiteStep, {
        ...args,
        to,
        weekly,
        jobAt,
        rows,
        requests: args.requests + open.requests,
      });
    } catch (error: unknown) {
      await finish("FAILED", failureSummary(error));
    }
    return null;
  },
});

/** The ready-made lists a run asks, in order: the same every step of the run. */
function jobsFor(weekly: boolean): PeriodJob[] {
  return dueJobs({ weeklyPeriodsAt: weekly ? undefined : Date.now() }, Date.now());
}
