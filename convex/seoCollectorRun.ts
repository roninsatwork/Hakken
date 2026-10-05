import { v } from "convex/values";

import { internalAction, internalMutation, type ActionCtx, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { appendRunStep } from "./agentRunStepWriter";
import { sendNextBatch } from "./seoCollectionActions";
import {
  SEO_COLLECTOR_QUIET_MS,
  SEO_COLLECTOR_SLEEP_MAX_MS,
  SEO_COLLECTOR_STEP_MS,
  SEO_COLLECTOR_WAIT_AHEAD_MS,
  SEO_COLLECTOR_WATCH_MS,
  SEO_SUPPLIER_RETRY_WINDOW_MS,
} from "./seoCollectionPolicy";
import { lastMoved } from "./roleRuns";

/**
 * The DataForSEO Collector's run: one continuous send, as long as the queue
 * (docs/plans/active/collection-progress-plan.md, decision 1).
 *
 * Until 2026-10-05 a run sent for seven minutes, or until it had spent $15,
 * and whatever was left waited for the next night's run: Collect now on two
 * companies left one half-sent (Anthony: "this is not a SaaS if we have to
 * babysit this each time"; of a restart, "a retry is a shit UX").
 *
 * Now a run goes in steps, because an action stops at ten minutes. Each step
 * sends for `SEO_COLLECTOR_STEP_MS` and starts the next the moment it ends,
 * until the queue is empty. Each step is booked with a **watch**
 * (`watchCollector`) set past the longest an action can live: a step neither
 * finished nor followed by then was stopped by the platform — a deploy, a
 * restart — and the watch starts the next one from where it was. The person
 * looking sees one send going from first to last; nothing is retried on screen.
 *
 * It stops only for what a person must fix, and says what: today's ceiling for
 * all collecting reached, or DataForSEO refusing the account. A request over its
 * website's limit is not bought and says so on its row, and the rest carries on
 * (`seoCollectionLimits.ts`). The hourly check is the net under the watch:
 * requests due for a quarter of an hour with nothing sending start a run.
 */

/** "Not now" replies in a row before a step stops, and how long it waits after each. */
const REFUSAL_PAUSES_MS = [10_000, 30_000, 60_000];

/** Steps in a row DataForSEO kept saying "not now" before the run stops, and the pause before each next one. */
const REFUSED_STEPS = 5;
const REFUSED_STEP_PAUSE_MS = 2 * 60 * 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const stepArgs = {
  runId: v.id("agentRuns"),
  workflowExecutionId: v.optional(v.id("workflowExecutions")),
  /** This step's number, from 1. */
  step: v.number(),
  /** Requests sent by the steps before this one. */
  sent: v.number(),
  /** Steps in a row that ended on DataForSEO's "not now". */
  refusedSteps: v.number(),
  /** The watch booked for this step, cancelled once it has handed on or finished. */
  watchId: v.optional(v.id("_scheduled_functions")),
};

type StepArgs = {
  runId: Id<"agentRuns">;
  workflowExecutionId?: Id<"workflowExecutions">;
  step: number;
  sent: number;
  refusedSteps: number;
  watchId?: Id<"_scheduled_functions">;
};

/** Why a step stopped sending. */
type StepEnd =
  | { kind: "STEP_DONE" }
  | { kind: "EMPTY" }
  | { kind: "LATER"; at: number }
  | { kind: "REFUSED"; reason: string }
  | { kind: "CAPPED"; reason: string }
  | { kind: "ACCOUNT"; reason: string };

/**
 * One step: send until the step's time is up or the queue is empty, then hand
 * on to the next step, or finish the run saying why it stopped. The first step
 * runs inside the run's own start (`seoAgentRuns.runSeoRoleNow`); the rest are
 * `continueCollecting`.
 */
export async function collectStep(ctx: ActionCtx, args: StepArgs): Promise<void> {
  const started = Date.now();
  const workerId = `collector-${args.runId}`;
  let sent = args.sent;
  let refusals = 0;
  let end: StepEnd;

  for (;;) {
    if (Date.now() - started > SEO_COLLECTOR_STEP_MS) {
      end = { kind: "STEP_DONE" };
      break;
    }
    const outcome = await sendNextBatch(ctx, { workerId, runId: args.runId, retryUntil: Date.now() + SEO_SUPPLIER_RETRY_WINDOW_MS });
    if (outcome.kind === "CAPPED" || outcome.kind === "ACCOUNT") {
      end = outcome;
      break;
    }
    if (outcome.kind === "REFUSED") {
      refusals += 1;
      if (refusals > REFUSAL_PAUSES_MS.length) {
        end = { kind: "REFUSED", reason: outcome.reason };
        break;
      }
      await sleep(REFUSAL_PAUSES_MS[refusals - 1]);
      continue;
    }
    if (outcome.kind === "SENT") {
      refusals = 0;
      sent += outcome.count;
      continue;
    }
    // Nothing due this moment: work is spaced as it is queued, and a supplier's
    // refusal is asked again a minute or more on. Sleep through a short gap
    // inside the step; hand a longer one on to a step booked for then.
    if (outcome.nextDueAt === null) {
      end = { kind: "EMPTY" };
      break;
    }
    const wait = outcome.nextDueAt - Date.now();
    if (wait <= SEO_COLLECTOR_SLEEP_MAX_MS && Date.now() - started + wait <= SEO_COLLECTOR_STEP_MS) {
      await sleep(Math.max(wait, 250));
      continue;
    }
    end = { kind: "LATER", at: outcome.nextDueAt };
    break;
  }

  const next = { ...stepOf(args), step: args.step + 1, sent, refusedSteps: 0 };
  const now = Date.now();
  if (end.kind === "STEP_DONE") {
    await ctx.runMutation(internal.seoCollectorRun.bookCollectorStep, { ...next, at: now, cancelWatchId: args.watchId });
    return;
  }
  if (end.kind === "LATER" && end.at - now <= SEO_COLLECTOR_WAIT_AHEAD_MS) {
    await ctx.runMutation(internal.seoCollectorRun.bookCollectorStep, { ...next, at: end.at, cancelWatchId: args.watchId });
    return;
  }
  if (end.kind === "REFUSED" && args.refusedSteps + 1 < REFUSED_STEPS) {
    await ctx.runMutation(internal.seoCollectorRun.bookCollectorStep, {
      ...next, refusedSteps: args.refusedSteps + 1, at: now + REFUSED_STEP_PAUSE_MS, cancelWatchId: args.watchId,
    });
    return;
  }
  // Stopped for something only a person can fix: tell the super admins (finish-off plan, item 13).
  if (end.kind === "CAPPED" || end.kind === "ACCOUNT") {
    await ctx.runMutation(internal.collectionAlerts.noteCollectorNeedsYou, {
      kind: end.kind === "CAPPED" ? "DAY_CEILING" : "ACCOUNT",
      reason: `Stopped because ${stoppedBecause(end)}.`,
    });
  }
  await finishCollecting(ctx, args, sent, stoppedBecause(end));
}

function stoppedBecause(end: StepEnd): string {
  switch (end.kind) {
    case "CAPPED":
      return end.reason;
    case "ACCOUNT":
      return `${end.reason} Nothing more is sent until that is fixed; the queue waits`;
    case "REFUSED":
      return `DataForSEO kept saying "not now" for ${REFUSED_STEPS} steps in a row (${end.reason}); the queue waits, and the hourly check starts sending again`;
    case "LATER":
      return "nothing more is due for a while; what comes due later is sent then";
    default:
      return "the queue is empty";
  }
}

async function finishCollecting(ctx: ActionCtx, args: StepArgs, sent: number, because: string): Promise<void> {
  const spent = await ctx.runQuery(internal.roleRuns.readRunCost, { runId: args.runId });
  await ctx.runMutation(internal.roleRuns.finishRoleRun, {
    runId: args.runId,
    ...(args.workflowExecutionId ? { workflowExecutionId: args.workflowExecutionId } : {}),
    status: "SUCCESS",
    summary: `Sent ${sent} ${sent === 1 ? "request" : "requests"} to DataForSEO and spent $${spent.toFixed(2)}. Stopped because ${because}.`,
  });
  if (args.watchId) await ctx.runMutation(internal.seoCollectorRun.cancelCollectorWatch, { watchId: args.watchId });
}

/** A step after the first, booked by the one before it or by its watch. */
export const continueCollecting = internalAction({
  args: stepArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const going: boolean = await ctx.runMutation(internal.seoCollectorRun.markCollectorStep, { runId: args.runId });
    if (!going) {
      if (args.watchId) await ctx.runMutation(internal.seoCollectorRun.cancelCollectorWatch, { watchId: args.watchId });
      return null;
    }
    try {
      await collectStep(ctx, args);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.roleRuns.finishRoleRun, {
        runId: args.runId,
        ...(args.workflowExecutionId ? { workflowExecutionId: args.workflowExecutionId } : {}),
        status: "FAILED",
        summary: message.replace(/\s+/g, " ").trim().slice(0, 400) || "No detail given.",
      });
      if (args.watchId) await ctx.runMutation(internal.seoCollectorRun.cancelCollectorWatch, { watchId: args.watchId });
    }
    return null;
  },
});

/**
 * Book the next step at `at`, with its watch, and cancel the step's own watch
 * — one transaction, so a step is never left without one. Called with no `at`
 * for the first step, which runs at once inside the run's start: only its
 * watch is booked. The run is marked as moving either way, so a step booked a
 * few minutes ahead does not read as a run that died.
 */
export const bookCollectorStep = internalMutation({
  args: { ...stepArgs, at: v.optional(v.number()), cancelWatchId: v.optional(v.id("_scheduled_functions")) },
  returns: v.id("_scheduled_functions"),
  handler: async (ctx, args): Promise<Id<"_scheduled_functions">> => {
    const { at, cancelWatchId } = args;
    const step = stepOf(args);
    const now = Date.now();
    await ctx.db.patch(args.runId, { updatedAt: now });
    if (cancelWatchId) await cancelQuietly(ctx, cancelWatchId);
    const startsAt = at ?? now;
    const watchId: Id<"_scheduled_functions"> = await ctx.scheduler.runAt(startsAt + SEO_COLLECTOR_WATCH_MS, internal.seoCollectorRun.watchCollector, step);
    if (at !== undefined) await ctx.scheduler.runAt(at, internal.seoCollectorRun.continueCollecting, { ...step, watchId });
    return watchId;
  },
});

/**
 * A step's watch: the step neither finished nor handed on, though no action
 * lives this long — the platform stopped it. Carry on with the next step, saying
 * so on the run's timeline. A run finished meanwhile is left alone, and so is
 * one still moving — a booked step the platform started late, still working —
 * which books its own next step and watch when it ends.
 */
export const watchCollector = internalMutation({
  args: { ...stepArgs },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || (run.status !== "RUNNING" && run.status !== "QUEUED")) return null;
    if (Date.now() - lastMoved(run) < SEO_COLLECTOR_QUIET_MS) return null;
    await appendRunStep(ctx, {
      runId: args.runId,
      agentId: run.agentId,
      kind: "OBSERVE",
      status: "SUCCESS",
      output: `Step ${args.step} was stopped by the platform before it finished, so sending carried on from where it was.`,
    });
    const next = { ...stepOf(args), step: args.step + 1 };
    const now = Date.now();
    await ctx.db.patch(args.runId, { updatedAt: now });
    const watchId: Id<"_scheduled_functions"> = await ctx.scheduler.runAt(now + SEO_COLLECTOR_WATCH_MS, internal.seoCollectorRun.watchCollector, next);
    await ctx.scheduler.runAfter(0, internal.seoCollectorRun.continueCollecting, { ...next, watchId });
    return null;
  },
});

/** Mark a step started: the run is moving. False when the run has finished since the step was booked. */
export const markCollectorStep = internalMutation({
  args: { runId: v.id("agentRuns") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || (run.status !== "RUNNING" && run.status !== "QUEUED")) return false;
    await ctx.db.patch(args.runId, { updatedAt: Date.now() });
    return true;
  },
});

export const cancelCollectorWatch = internalMutation({
  args: { watchId: v.id("_scheduled_functions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await cancelQuietly(ctx, args.watchId);
    return null;
  },
});

/** A step's own arguments, without the watch booked for it or anything a booking adds. */
function stepOf(args: StepArgs & Record<string, unknown>): Omit<StepArgs, "watchId"> {
  return {
    runId: args.runId,
    ...(args.workflowExecutionId ? { workflowExecutionId: args.workflowExecutionId } : {}),
    step: args.step,
    sent: args.sent,
    refusedSteps: args.refusedSteps,
  };
}

/** Cancel a scheduled watch that may already have run or gone. */
async function cancelQuietly(ctx: MutationCtx, watchId: Id<"_scheduled_functions">) {
  const job = await ctx.db.system.get(watchId);
  if (job && job.state.kind === "pending") await ctx.scheduler.cancel(watchId);
}
