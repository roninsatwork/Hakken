import { v } from "convex/values";
import { appError } from "./utils/appError";
import { internal } from "./_generated/api";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { adminQuery, tenantMutation, tenantQuery } from "./tenantFunctions";
import { assertAdminCanAccessCompany } from "./authz";
import { getCurrentImport, requireSalesDataCompany } from "./salesData";
import { collectPendingResearchWork, resolveResearchWorkers } from "./salesDataResearch";
import { ensureAgentVersionSnapshot } from "./agentVersioningService";
import {
  DEFAULT_JOB_MAX_COST_GBP,
  decideItemRetry,
  decideJobEnding,
  describeProgress,
  isQueueDrained,
  kindForPhase,
  nextPhase,
  shouldStopForJobBudget,
  tallyItems,
  type ResearchJobItemKind,
  type ResearchJobPhase,
} from "./salesDataResearchJobService";

/**
 * Researching the whole workspace under one press.
 *
 * What this replaces: two buttons that each queued one agent run per customer
 * and per chain — 141 runs, a quarter of them dying on their own ceilings, and
 * nothing anywhere that could say whether the work had finished. A run knew
 * about one customer. Nothing knew about the job.
 *
 * The job here owns a queue and hands pieces of it to runs. A run works items
 * until it meets one of its own limits, then ends; the job notices, puts any
 * unfinished item back, and starts another. That loop is the difference between
 * "we started sixty runs" and "the list is done".
 *
 * Three passes in a fixed order — customers, chains, then the prospects the
 * chain pass produced. The third cannot be a separate press because its work
 * does not exist until the second has run.
 */

/** How often the job looks at the run it started. */
const TICK_MS = 15_000;

/**
 * A backstop on the number of runs one job may start.
 *
 * Not a work limit — the queue decides that. This stops a bug that never marks
 * items done from starting runs for ever at a pound a time.
 */
const MAX_RUNS_PER_JOB = 200;

const ITEM_SCAN_LIMIT = 2000;

/**
 * How long a run may record nothing before the job treats it as dead.
 *
 * Comfortably above the runtime's three-minute segment budget, so a run that is
 * simply mid-handover is never mistaken for a dead one, and well below the
 * platform's twelve-minute stall threshold — which never fires for these runs
 * anyway, because it needs a checkpoint the run may have died before writing.
 */
const RUN_SILENCE_MS = 6 * 60 * 1000;

/** When this run last recorded anything at all. */
async function lastStepAt(ctx: Pick<QueryCtx, "db">, runId: Id<"agentRuns">) {
  const step = await ctx.db
    .query("agentRunSteps")
    .withIndex("by_run_step", (q) => q.eq("runId", runId))
    .order("desc")
    .first();
  return step?.startedAt ?? null;
}

/**
 * What this run has actually cost, whether or not it lived to report it.
 *
 * A run that completes writes its total onto its own row; a run that dies or is
 * cancelled mid-flight never does, and a job billing from that row alone
 * recorded £0 for the run it had just watched spend money. The steps are
 * written as the run works, so their sum is the record that survives any kind
 * of ending.
 */
async function runSpendGBP(ctx: Pick<QueryCtx, "db">, run: Doc<"agentRuns">) {
  const steps = await ctx.db
    .query("agentRunSteps")
    .withIndex("by_run_step", (q) => q.eq("runId", run._id))
    .take(ITEM_SCAN_LIMIT);
  const fromSteps = steps.reduce((total, step) => total + (step.costGBP ?? 0), 0);
  return Math.max(run.costGBP ?? 0, fromSteps);
}

type JobDoc = Doc<"salesDataResearchJobs">;

async function loadItems(ctx: Pick<MutationCtx, "db">, jobId: Id<"salesDataResearchJobs">) {
  return await ctx.db
    .query("salesDataResearchJobItems")
    .withIndex("by_job_status", (q) => q.eq("jobId", jobId))
    .take(ITEM_SCAN_LIMIT);
}

async function activeJobFor(
  ctx: Pick<MutationCtx, "db">,
  companyId: Id<"companies">
): Promise<JobDoc | null> {
  return await ctx.db
    .query("salesDataResearchJobs")
    .withIndex("by_company_status", (q) => q.eq("companyId", companyId).eq("status", "RUNNING"))
    .first();
}

/**
 * What each worker is told to do for a whole job.
 *
 * Deliberately says nothing about which customer or which chain: the job hands
 * those out one at a time, so the same instruction serves every run it starts
 * and the model cannot decide the order for itself. One instruction per
 * skill: a run never pays to carry rules about work it will not be handed.
 */
function buildFillingObjective() {
  return [
    "Work through this workspace's research queue until it is empty.",
    "Ask for your next task, do it with the customer tools, then ask again.",
    "Each task is one customer or one prospect to fill in: find every missing detail",
    "you can be sure of, record each one with the page it came from, and mark the",
    "ones that are not published anywhere as not found.",
    "The pupil or bedroom figure is the client's key number — give it a page read",
    "of its own before giving up on it.",
    "When you are told there is nothing left for you, stop and say what you did.",
  ].join(" ");
}

function buildFindingObjective() {
  return [
    "Work through this workspace's research queue until it is empty.",
    "Ask for your next task, do it with the group tools, then ask again.",
    "Each task is one chain: find every site in it and record each one,",
    "preferring the chain's own list of its sites over any register page.",
    "When you are told there is nothing left for you, stop and say what you did.",
  ].join(" ");
}

/**
 * Which worker a kind of task belongs to.
 *
 * Chains are the prospect finder's; customers and prospects are the record
 * filler's. A job with no second agent returns the filler for everything,
 * which is the single-agent behaviour the system has always had.
 */
function agentForKind(job: JobDoc, kind: ResearchJobItemKind): Id<"agents"> {
  if (kind === "CHAIN") return job.prospectAgentId ?? job.agentId;
  return job.agentId;
}

function workerNameForAgent(job: JobDoc, agentId: Id<"agents">) {
  return job.prospectAgentId && agentId === job.prospectAgentId ? "Prospect search" : "Research";
}

/**
 * Start one run to work the queue.
 *
 * The same shape the old sweeps used to start a run, with one difference that
 * matters: the run is recorded on the job, so the job can find out how it ended.
 */
async function startJobRun(
  ctx: MutationCtx,
  args: {
    job: JobDoc;
    /** What kind of work the queue has next, which decides the worker. */
    kind: ResearchJobItemKind;
    now: number;
    continuesRunId?: Id<"agentRuns">;
  }
) {
  const agentId = agentForKind(args.job, args.kind);
  const objective = args.kind === "CHAIN" ? buildFindingObjective() : buildFillingObjective();
  const agentVersionId = await ensureAgentVersionSnapshot(ctx, {
    agentId,
    companyId: args.job.companyId,
  });

  const runId = await ctx.db.insert("agentRuns", {
    agentId,
    agentVersionId,
    triggerType: "MANUAL",
    objective,
    // Named for the worker and which run of the job this is, so a job that
    // took four runs reads as four parts of one thing rather than four
    // identical paragraphs.
    title: `${workerNameForAgent(args.job, agentId)} · run ${args.job.runsStarted + 1}`,
    status: "QUEUED",
    companyId: args.job.companyId,
    userId: args.job.startedBy,
    startedAt: args.now,
    updatedAt: args.now,
  });

  await ctx.db.patch(args.job._id, {
    currentRunId: runId,
    runsStarted: args.job.runsStarted + 1,
    updatedAt: args.now,
  });

  // A run that ended on a ceiling and was picked up is a handover, and the
  // screens should say so instead of dressing it as a failure.
  if (args.continuesRunId) {
    await ctx.db.patch(args.continuesRunId, { continuedByRunId: runId, updatedAt: args.now });
  }

  await ctx.scheduler.runAfter(0, internal.agentRuntime.runTriggeredAgentObjective, {
    agentId,
    objective,
    triggerType: "MANUAL",
    runId,
    companyId: args.job.companyId,
    userId: args.job.startedBy,
  });

  await ctx.scheduler.runAfter(TICK_MS, internal.salesDataResearchJobs.tickJobInternal, {
    jobId: args.job._id,
  });

  return runId;
}

async function endJob(
  ctx: MutationCtx,
  args: {
    job: JobDoc;
    status: "COMPLETE" | "COMPLETE_WITH_EXCEPTIONS" | "STOPPED" | "FAILED";
    reason: string;
  }
) {
  const now = Date.now();
  await ctx.db.patch(args.job._id, {
    status: args.status,
    phase: "DONE",
    currentRunId: undefined,
    endedReason: args.reason,
    finishedAt: now,
    updatedAt: now,
  });
}

/**
 * Move the job to the first phase that still has work, and say what kind.
 *
 * Phases are skipped rather than sat in: a workspace whose customers are all
 * filled in goes straight to the chains instead of reporting a customer pass
 * with nothing in it.
 */
async function advanceToWork(
  ctx: MutationCtx,
  job: JobDoc,
  items: Doc<"salesDataResearchJobItems">[]
): Promise<{ phase: ResearchJobPhase; kind: ResearchJobItemKind | null }> {
  let phase = job.phase;

  for (let guard = 0; guard < 4; guard += 1) {
    const kind = kindForPhase(phase);
    if (!kind) break;
    const hasWork = items.some((item) => item.kind === kind && item.status === "PENDING");
    if (hasWork) {
      if (phase !== job.phase) await ctx.db.patch(job._id, { phase, updatedAt: Date.now() });
      return { phase, kind };
    }
    phase = nextPhase(phase);
  }

  if (phase !== job.phase) await ctx.db.patch(job._id, { phase, updatedAt: Date.now() });
  return { phase, kind: null };
}

/**
 * Build the queue for a workspace, on the first run that asks for work.
 *
 * There is deliberately no button for this. Anthony, 2026-08-03: *"I only want
 * it to run from the agent screen — I didn't want the button to trigger the
 * research from the user front end."* So the job is created by the first run
 * that asks what to do, which means pressing Run Agent starts the whole thing
 * and nothing on a client-facing screen can spend money.
 */
type ResearchJobMode = "DETAILS" | "PROSPECTS" | undefined;

async function createJobForRun(
  ctx: MutationCtx,
  args: {
    companyId: Id<"companies">;
    userId: Id<"users">;
    runsStarted?: number;
    /** Which button this job answers to. Absent means the everything job. */
    mode?: ResearchJobMode;
  }
) {
  const currentImport = await getCurrentImport(ctx, args.companyId);
  if (!currentImport) return null;

  const work = await collectPendingResearchWork(ctx, {
    companyId: args.companyId,
    importId: currentImport._id,
  });

  // Which agents do this job's work is decided by tool bindings, not by which
  // agent's button was pressed: the filler holds the detail-recording tool,
  // the finder holds the site-filing tool. One agent holding both is the
  // single-agent shape, and the finder field stays empty.
  const workers = await resolveResearchWorkers(ctx, args.companyId);

  const now = Date.now();
  const jobId = await ctx.db.insert("salesDataResearchJobs", {
    companyId: args.companyId,
    importId: currentImport._id,
    status: "RUNNING",
    phase: "CUSTOMERS",
    agentId: workers.filler._id,
    ...(workers.finder._id !== workers.filler._id
      ? { prospectAgentId: workers.finder._id }
      : {}),
    ...(args.mode ? { mode: args.mode } : {}),
    // When a pressed run asks for work it is the job's first run — it already
    // exists, so it is counted rather than started again. A job started from
    // the workspace screen has no run yet, and starts at nought.
    runsStarted: args.runsStarted ?? 1,
    maxCostGBP: DEFAULT_JOB_MAX_COST_GBP,
    spentGBP: 0,
    findingSpentGBP: 0,
    fillingSpentGBP: 0,
    startedBy: args.userId,
    startedAt: now,
    updatedAt: now,
  });

  const queue: { kind: ResearchJobItemKind; key: string; label: string }[] = [];
  if (args.mode !== "PROSPECTS") {
    queue.push(...work.customers.map((item) => ({ kind: "CUSTOMER" as const, ...item })));
  }
  if (args.mode !== "DETAILS") {
    queue.push(...work.chains.map((item) => ({ kind: "CHAIN" as const, ...item })));
  }
  // Prospects already on the books with gaps belong to the detail button —
  // "research and population across customers and prospects". The everything
  // job keeps its original shape: its prospects arrive as the chains find
  // them.
  if (args.mode === "DETAILS") {
    queue.push(...work.prospects.map((item) => ({ kind: "PROSPECT" as const, ...item })));
  }

  for (const item of queue) {
    await ctx.db.insert("salesDataResearchJobItems", {
      jobId,
      companyId: args.companyId,
      kind: item.kind,
      key: item.key,
      label: item.label,
      status: "PENDING",
      attempts: 0,
      updatedAt: now,
    });
  }

  return await ctx.db.get(jobId);
}

/**
 * Hand the run its next piece of work, and settle the last one.
 *
 * Asking for the next task is what closes the previous one. The run says how it
 * went; an item it could not do goes back on the queue until it has had its two
 * attempts, and is then recorded as undone so the job can carry on past it.
 */
export const claimNextTaskInternal = internalMutation({
  args: {
    companyId: v.id("companies"),
    runId: v.optional(v.id("agentRuns")),
    previousOutcome: v.optional(v.union(v.literal("DONE"), v.literal("COULD_NOT"))),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // The first ask builds the queue. Pressing Run Agent is the whole trigger:
    // there is no second thing to press and nothing on a client-facing screen
    // that starts spending.
    let job = await activeJobFor(ctx, args.companyId);
    if (!job) {
      const run = args.runId ? await ctx.db.get(args.runId) : null;
      // A run with nobody behind it cannot own a job: the findings it produces
      // are written against a person, and "started by nobody" is not a name to
      // put on a customer record.
      if (!run?.userId) {
        return {
          task: null,
          done: true,
          message: "There is no research job running for this workspace.",
        };
      }
      // Which button the press stands for: Run Agent on the finder starts a
      // prospect hunt, on the filler a detail pass. A workspace whose one
      // agent does both keeps the original everything job.
      const workers = await resolveResearchWorkers(ctx, args.companyId);
      const pressedMode =
        workers.finder._id === workers.filler._id
          ? undefined
          : run.agentId === workers.finder._id
            ? ("PROSPECTS" as const)
            : ("DETAILS" as const);
      job = await createJobForRun(ctx, {
        companyId: args.companyId,
        userId: run.userId,
        mode: pressedMode,
      });
      if (!job) {
        return {
          task: null,
          done: true,
          message: "There is no imported spreadsheet to research against.",
        };
      }
      await ctx.db.patch(job._id, { currentRunId: args.runId, updatedAt: Date.now() });
      // The pressed run becomes the job's first run, so it takes the job's
      // naming. Without this the one run a person actually starts is the one
      // run headed by its whole instruction.
      if (args.runId) {
        await ctx.db.patch(args.runId, {
          title: `${workerNameForAgent(job, run.agentId)} · run 1`,
          updatedAt: Date.now(),
        });
      }
      await ctx.scheduler.runAfter(TICK_MS, internal.salesDataResearchJobs.tickJobInternal, {
        jobId: job._id,
      });
    }

    const items = await loadItems(ctx, job._id);
    const now = Date.now();

    /**
     * Items this very call put back on the queue.
     *
     * Held back from being handed straight out again. The first failure at an
     * item is usually the run meeting one of its own ceilings, so returning it
     * to the same run in the same breath spends its second attempt on the
     * conditions that just failed it. It goes to the back of the queue instead,
     * and is offered again only once everything else has been.
     */
    const justRequeued = new Set<string>();

    const inProgress = items.filter((item) => item.status === "IN_PROGRESS");
    for (const item of inProgress) {
      const settled =
        args.previousOutcome === "COULD_NOT"
          ? decideItemRetry(item.attempts) === "GIVE_UP"
            ? { status: "FAILED" as const }
            : { status: "PENDING" as const }
          : { status: "DONE" as const };

      await ctx.db.patch(item._id, {
        ...settled,
        ...(args.note ? { lastError: args.note.slice(0, 500) } : {}),
        updatedAt: now,
      });
      item.status = settled.status;
      if (settled.status === "PENDING") justRequeued.add(item._id);
    }

    const { kind } = await advanceToWork(ctx, job, items);
    if (!kind) {
      return { task: null, done: true, message: "Nothing left. Stop and say what you did." };
    }

    // The queue's next work may belong to the other worker. The asking run is
    // told its part is over rather than being handed a task its agent has no
    // tools for; when it concludes, the watchdog starts a run on the right
    // agent. This is the whole routing: the job conducts, agents never choose.
    if (args.runId) {
      const askingRun = await ctx.db.get(args.runId);
      const neededAgentId = agentForKind(job, kind);
      if (askingRun && askingRun.agentId !== neededAgentId) {
        return {
          task: null,
          done: true,
          message:
            "The rest of this job belongs to the other agent, which will be started for you. "
            + "Stop and say what you did.",
        };
      }
    }

    const pending = items.filter((item) => item.kind === kind && item.status === "PENDING");
    const next =
      pending.find((item) => !justRequeued.has(item._id))
      // Everything else in this phase is done: the one just handed back is all
      // there is, so it gets its second attempt now rather than the job
      // stalling on it.
      ?? pending[0];
    if (!next) {
      return { task: null, done: true, message: "Nothing left. Stop and say what you did." };
    }

    await ctx.db.patch(next._id, {
      status: "IN_PROGRESS",
      attempts: next.attempts + 1,
      ...(args.runId ? { runId: args.runId } : {}),
      updatedAt: now,
    });

    const remaining = items.filter(
      (item) => item.status === "PENDING" && item._id !== next._id
    ).length;

    return {
      done: false,
      task: {
        kind: next.kind,
        // Named for what the tools call it, so the model passes it straight on.
        key: next.key,
        name: next.label,
        instruction:
          next.kind === "CHAIN"
            ? `Find every site in the ${next.label} chain and record each one.`
            : `Fill in the missing details for ${next.label}.`,
      },
      remaining,
    };
  },
});

/**
 * Put a prospect on the queue as it is found.
 *
 * The third pass is fed by the second inside the same job. Called from the tool
 * that files a prospect, so a site found at half past two is researched by the
 * same job rather than waiting for somebody to press a second button.
 */
export const appendProspectItemInternal = internalMutation({
  args: {
    companyId: v.id("companies"),
    prospectKey: v.string(),
    siteName: v.string(),
  },
  handler: async (ctx, args) => {
    const job = await activeJobFor(ctx, args.companyId);
    if (!job) return { appended: false };

    // The prospect-hunt button finds and files, nothing more. Researching what
    // it filed is the detail button's work — that queue lists prospects with
    // gaps when it is next pressed.
    if (job.mode === "PROSPECTS") return { appended: false };

    const existing = await ctx.db
      .query("salesDataResearchJobItems")
      .withIndex("by_job_kind_key", (q) =>
        q.eq("jobId", job._id).eq("kind", "PROSPECT").eq("key", args.prospectKey)
      )
      .first();
    if (existing) return { appended: false };

    await ctx.db.insert("salesDataResearchJobItems", {
      jobId: job._id,
      companyId: args.companyId,
      kind: "PROSPECT",
      key: args.prospectKey,
      label: args.siteName,
      status: "PENDING",
      attempts: 0,
      updatedAt: Date.now(),
    });

    return { appended: true };
  },
});

/**
 * Look at the run the job started, and decide what happens next.
 *
 * The job cannot be told when a run ends — nothing in the runtime calls back —
 * so it looks. A tick that finds the run still working simply books another
 * look, which costs one small read every fifteen seconds and keeps the runtime
 * unchanged.
 */
export const tickJobInternal = internalMutation({
  args: { jobId: v.id("salesDataResearchJobs") },
  handler: async (ctx, args) => {
    try {
      await tickJob(ctx, args.jobId);
    } catch (error) {
      // A tick that throws is never retried, and nothing else ever books
      // another look — so one crashed tick used to end supervision and leave
      // the job RUNNING for ever. Every branch of `tickJob` is written to be
      // re-entered, so the recovery is simply to look again.
      console.error("Research job tick failed; booking the next look", error);
      const job = await ctx.db.get(args.jobId);
      if (job && job.status === "RUNNING") {
        await ctx.scheduler.runAfter(TICK_MS, internal.salesDataResearchJobs.tickJobInternal, {
          jobId: args.jobId,
        });
      }
    }
  },
});

async function tickJob(ctx: MutationCtx, jobId: Id<"salesDataResearchJobs">) {
    const job = await ctx.db.get(jobId);
    if (!job || job.status !== "RUNNING") return;

    const now = Date.now();

    // The run whose queue the next run will be picking up, if this tick ends
    // one. A run that fell on a genuine fault (goneQuiet) is not a handover.
    let endedRunId: Id<"agentRuns"> | undefined;

    if (job.currentRunId) {
      const run = await ctx.db.get(job.currentRunId);
      const markedWorking =
        run && (run.status === "QUEUED" || run.status === "RUNNING" || run.status === "PENDING_APPROVAL");

      // "Marked running" and "running" are not the same thing, and the job must
      // not confuse them. A run whose action is killed before it manages to save
      // a checkpoint stays RUNNING for ever: the platform's stall sweeper only
      // looks at runs that have a checkpoint to resume from, so a run that died
      // at its first handover is invisible to it. That is exactly what happened
      // on the first live job — 126 steps, then silence, while this tick waited
      // politely for a run that no longer existed.
      //
      // So the job judges by what the run has actually done, not by its status.
      const lastActivityAt = markedWorking ? await lastStepAt(ctx, job.currentRunId) : null;
      const goneQuiet =
        markedWorking
        && lastActivityAt !== null
        && now - lastActivityAt > RUN_SILENCE_MS;

      if (markedWorking && !goneQuiet) {
        await ctx.scheduler.runAfter(TICK_MS, internal.salesDataResearchJobs.tickJobInternal, {
          jobId: job._id,
        });
        return;
      }

      if (goneQuiet && run) {
        // Say so on the run as well. A run left marked RUNNING for ever is a
        // lie every screen repeats, and the next thing to read it deserves the
        // truth rather than this job's private opinion.
        await ctx.db.patch(run._id, {
          status: "FAILED",
          error: "The run stopped responding and the job moved on without it.",
          completedAt: now,
          updatedAt: now,
        });
      }

      // The run is over. Its spend belongs to the job whatever the outcome, and
      // anything it was holding goes back on the queue: a run that died with an
      // item in progress is the exact case the old sweeps lost silently.
      // Banked into the worker's own bucket as well as the total, so the
      // report can say what finding cost and what filling-in cost.
      const runSpend = run ? await runSpendGBP(ctx, run) : 0;
      const bucket =
        run && job.prospectAgentId && run.agentId === job.prospectAgentId
          ? { findingSpentGBP: (job.findingSpentGBP ?? 0) + runSpend }
          : { fillingSpentGBP: (job.fillingSpentGBP ?? 0) + runSpend };
      await ctx.db.patch(job._id, {
        currentRunId: undefined,
        spentGBP: job.spentGBP + runSpend,
        ...bucket,
        updatedAt: now,
      });

      if (run && !goneQuiet) endedRunId = run._id;

      // Cancelling the run on the agent screen is how a person stops the job.
      // Without this the job would notice the run had ended and helpfully start
      // another one, which is the opposite of what pressing cancel meant.
      if (run?.status === "CANCELLED") {
        const held = await ctx.db
          .query("salesDataResearchJobItems")
          .withIndex("by_job_status", (q) => q.eq("jobId", job._id).eq("status", "IN_PROGRESS"))
          .take(ITEM_SCAN_LIMIT);
        for (const item of held) {
          await ctx.db.patch(item._id, { status: "PENDING", updatedAt: now });
        }
        const remaining = await loadItems(ctx, job._id);
        const left = tallyItems(remaining);
        await endJob(ctx, {
          job,
          status: "STOPPED",
          reason: `Stopped by hand with ${left.pending + left.inProgress} left to do.`,
        });
        return;
      }

      const held = await ctx.db
        .query("salesDataResearchJobItems")
        .withIndex("by_job_status", (q) => q.eq("jobId", job._id).eq("status", "IN_PROGRESS"))
        .take(ITEM_SCAN_LIMIT);

      for (const item of held) {
        const giveUp = decideItemRetry(item.attempts) === "GIVE_UP";
        await ctx.db.patch(item._id, {
          status: giveUp ? "FAILED" : "PENDING",
          lastError: run?.error ?? "The run ended before this was finished.",
          updatedAt: now,
        });
      }
    }

    const refreshed = await ctx.db.get(job._id);
    if (!refreshed || refreshed.status !== "RUNNING") return;

    const items = await loadItems(ctx, refreshed._id);
    const tally = tallyItems(items);

    if (isQueueDrained(tally)) {
      const ending = decideJobEnding(tally);
      await endJob(ctx, {
        job: refreshed,
        status: ending,
        reason:
          ending === "COMPLETE"
            ? `Researched ${tally.done} of ${tally.done} — nothing left.`
            : `Researched ${tally.done}, could not do ${tally.failed}.`,
      });
      return;
    }

    if (shouldStopForJobBudget({ spentGBP: refreshed.spentGBP, maxCostGBP: refreshed.maxCostGBP })) {
      await endJob(ctx, {
        job: refreshed,
        status: "STOPPED",
        reason: `Stopped at its $${refreshed.maxCostGBP} ceiling with ${tally.pending} left to do.`,
      });
      return;
    }

    if (refreshed.runsStarted >= MAX_RUNS_PER_JOB) {
      await endJob(ctx, {
        job: refreshed,
        status: "FAILED",
        reason: `Stopped after ${MAX_RUNS_PER_JOB} runs with ${tally.pending} still queued.`,
      });
      return;
    }

    // The queue decides what kind of work is next, and the kind decides the
    // worker: the finder for chains, the filler for everything else.
    const { kind } = await advanceToWork(ctx, refreshed, items);
    if (!kind) return;

    await startJobRun(ctx, {
      job: refreshed,
      kind,
      now,
      continuesRunId: endedRunId,
    });
}

/**
 * The job behind an agent, for the observability screen.
 *
 * The client-facing progress line went when the trigger did, and that left the
 * job running with nothing anywhere showing it. Anthony, 2026-08-03: *"what is
 * the purpose of building observability tools if you hide stuff from it."* The
 * job is the unit of work this agent does; the run list underneath it is the
 * mechanism.
 *
 * Keyed by agent rather than by workspace so it works from the admin screens
 * whether or not the reader is impersonating.
 */
export const getResearchJobForAgent = adminQuery({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    // By agent, not by the agent's workspace: a global agent belongs to no
    // workspace, and asking for one hid the job panel for exactly the agent
    // the panel was built for. The job row itself says whose workspace it is,
    // and that is what access is checked against.
    const [asFiller, asFinder] = await Promise.all([
      ctx.db
        .query("salesDataResearchJobs")
        .withIndex("by_agent_started", (q) => q.eq("agentId", args.agentId))
        .order("desc")
        .take(10),
      ctx.db
        .query("salesDataResearchJobs")
        .withIndex("by_prospect_agent_started", (q) => q.eq("prospectAgentId", args.agentId))
        .order("desc")
        .take(10),
    ]);
    const recent = [...asFiller, ...asFinder].sort((a, b) => b.startedAt - a.startedAt);

    const job = recent.find((row) => row.status === "RUNNING") ?? recent[0];
    if (!job) return null;
    assertAdminCanAccessCompany(ctx.user, job.companyId);

    return await describeJob(ctx, job);
  },
});

/**
 * What one run actually recorded, for the run screen to lead with.
 *
 * The run screen used to open with the model's closing prose — several hundred
 * words of the agent narrating itself, presented above the step graph as if it
 * were the result. This reads the rows the run really created instead: a line
 * per detail saved or marked unpublished, a line per prospect filed. A claim in
 * the prose with no line here recorded nothing, and the screen now shows that
 * difference instead of hiding it.
 *
 * Returns null for a run that belongs to no workspace; a research run that
 * recorded nothing returns empty lists, which is itself worth showing.
 */
export const getRunRecord = adminQuery({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run?.companyId) return null;
    assertAdminCanAccessCompany(ctx.user, run.companyId);

    const [findings, prospects] = await Promise.all([
      ctx.db
        .query("salesDataCustomerResearch")
        .withIndex("by_run", (q) => q.eq("runId", args.runId))
        .take(ITEM_SCAN_LIMIT),
      ctx.db
        .query("salesDataProspects")
        .withIndex("by_run", (q) => q.eq("runId", args.runId))
        .take(ITEM_SCAN_LIMIT),
    ]);

    const details = findings
      .sort((a, b) => a.foundAt - b.foundAt)
      .map((finding) => ({
        subject: finding.subjectKey,
        field: finding.field,
        value: finding.status === "NOT_FOUND" ? null : finding.value,
        outcome: describeFindingStatus(finding.status),
        saved: finding.status === "APPLIED",
        sourceName: finding.sourceName ?? null,
        sourceUrl: finding.sourceUrl ?? null,
        foundAt: finding.foundAt,
      }));

    const filed = prospects
      .sort((a, b) => a.foundAt - b.foundAt)
      .map((prospect) => ({
        siteName: prospect.siteName,
        groupName: prospect.groupName,
        outcome: prospect.conflictNote
          ? "filed as a prospect, with a clash to check"
          : "filed as a prospect",
        conflictNote: prospect.conflictNote ?? null,
        sourceName: prospect.sourceName ?? null,
        sourceUrl: prospect.sourceUrl ?? null,
        foundAt: prospect.foundAt,
      }));

    return { details, prospects: filed };
  },
});

/** A finding's stored status, in the words the screen uses. */
function describeFindingStatus(
  status: Doc<"salesDataCustomerResearch">["status"]
): string {
  switch (status) {
    case "APPLIED": return "saved to the record";
    case "NEEDS_CHECK": return "saved, needs a person to check it";
    case "REJECTED": return "rejected";
    case "SUPERSEDED": return "replaced by a later finding";
    case "NOT_FOUND": return "looked for, not published anywhere";
  }
}

/**
 * The job as the screen reads it.
 *
 * One line of progress and, when it is over, what it could not do. Never a run
 * count: how many runs it took is this file's business, not the reader's.
 */
/**
 * One job, described once, for whichever screen is asking.
 *
 * Counts the work rather than the runs: how many runs it took is this file's
 * business, not the reader's.
 */
/** How many recorded rows the job panel shows before pointing at the runs. */
const JOB_RECORD_PREVIEW_LIMIT = 15;

/**
 * What the job has recorded so far, newest first, across every run it started.
 *
 * Read by time rather than by run: the rows are stamped with the run that wrote
 * them, but the job does not keep its runs' ids — and "since the job began, in
 * this workspace" is the truthful window either way.
 */
async function collectJobRecords(ctx: Pick<QueryCtx, "db">, job: JobDoc) {
  const [applied, notFound, prospects] = await Promise.all([
    ctx.db
      .query("salesDataCustomerResearch")
      .withIndex("by_company_status_found", (q) =>
        q.eq("companyId", job.companyId).eq("status", "APPLIED").gte("foundAt", job.startedAt)
      )
      .order("desc")
      .take(JOB_RECORD_PREVIEW_LIMIT),
    ctx.db
      .query("salesDataCustomerResearch")
      .withIndex("by_company_status_found", (q) =>
        q.eq("companyId", job.companyId).eq("status", "NOT_FOUND").gte("foundAt", job.startedAt)
      )
      .order("desc")
      .take(JOB_RECORD_PREVIEW_LIMIT),
    ctx.db
      .query("salesDataProspects")
      .withIndex("by_company_status", (q) =>
        q.eq("companyId", job.companyId).eq("status", "NEW").gte("foundAt", job.startedAt)
      )
      .order("desc")
      .take(JOB_RECORD_PREVIEW_LIMIT),
  ]);

  const lines = [
    ...prospects.map((row) => ({
      at: row.foundAt,
      subject: row.siteName,
      detail: `${row.groupName} · filed as a prospect`,
      saved: true,
    })),
    ...applied.map((row) => ({
      at: row.foundAt,
      subject: row.subjectKey,
      detail: `${row.field} · saved · ${row.value}`,
      saved: true,
    })),
    ...notFound.map((row) => ({
      at: row.foundAt,
      subject: row.subjectKey,
      detail: `${row.field} · looked for, not published`,
      saved: false,
    })),
  ];
  lines.sort((a, b) => b.at - a.at);
  return lines.slice(0, JOB_RECORD_PREVIEW_LIMIT);
}

async function describeJob(ctx: Pick<QueryCtx, "db">, job: JobDoc) {
  const items = await ctx.db
    .query("salesDataResearchJobItems")
    .withIndex("by_job_status", (q) => q.eq("jobId", job._id))
    .take(ITEM_SCAN_LIMIT);
  const tally = tallyItems(items);

  // The job's own figure only banks a run's cost when the run ends, so on
  // screen it trailed reality by one whole run — £11 shown while £18 was
  // spent. Add what the working run has racked up so far, read from its steps.
  let spentGBP = job.spentGBP;
  let workingSince: number | null = null;
  if (job.currentRunId) {
    const run = await ctx.db.get(job.currentRunId);
    if (run) {
      spentGBP += await runSpendGBP(ctx, run);
      workingSince = await lastStepAt(ctx, job.currentRunId);
    }
  }

  const inProgress = items.find((item) => item.status === "IN_PROGRESS") ?? null;
  const records = await collectJobRecords(ctx, job);

  return {
    status: job.status,
    phase: job.phase,
    progress: describeProgress({ phase: job.phase, tally }),
    done: tally.done,
    failed: tally.failed,
    remaining: tally.pending + tally.inProgress,
    total: items.length,
    customers: items.filter((item) => item.kind === "CUSTOMER").length,
    chains: items.filter((item) => item.kind === "CHAIN").length,
    prospects: items.filter((item) => item.kind === "PROSPECT").length,
    // What it has in hand this minute, and when it last recorded anything —
    // the two facts that let the screen say "working on X" and mean it.
    workingOn: inProgress ? { kind: inProgress.kind, label: inProgress.label } : null,
    workingSince,
    // The newest things recorded across every run of this job, so the reader
    // watches the job's output rather than chasing whichever run is alive.
    records,
    spentGBP: Number(spentGBP.toFixed(2)),
    // What each worker cost, only meaningful once the skills are split.
    spendSplit: job.prospectAgentId
      ? {
          findingGBP: Number((job.findingSpentGBP ?? 0).toFixed(2)),
          fillingGBP: Number((job.fillingSpentGBP ?? 0).toFixed(2)),
        }
      : null,
    maxCostGBP: job.maxCostGBP,
    runsStarted: job.runsStarted,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt ?? null,
    endedReason: job.endedReason ?? null,
    exceptions: items
      .filter((item) => item.status === "FAILED")
      .slice(0, 50)
      .map((item) => ({ name: item.label, reason: item.lastError ?? "Could not be done." })),
  };
}

/**
 * Start the whole research job from the workspace screen.
 *
 * This used to be forbidden — Anthony, 2026-08-03 (morning): *"I only want it
 * to run from the agent screen."* Superseded the same day: with the job
 * proven, he wants the workspace to start it and watch it too. One press
 * here is the same press as Run Agent: it makes the job, and the job starts
 * the right worker for the first phase.
 */
export const startResearchJob = tenantMutation({
  args: {
    /** Which button was pressed. Each starts its own kind of job. */
    mode: v.union(v.literal("DETAILS"), v.literal("PROSPECTS")),
  },
  handler: async (ctx, args) => {
    const companyId = await requireSalesDataCompany(ctx);

    const existing = await activeJobFor(ctx, companyId);
    if (existing) return { started: false, alreadyRunning: true };

    const job = await createJobForRun(ctx, {
      companyId,
      userId: ctx.userId,
      runsStarted: 0,
      mode: args.mode,
    });
    if (!job) {
      throw appError("CONFLICT", "There is no imported spreadsheet to research against.");
    }

    const items = await loadItems(ctx, job._id);
    const { kind } = await advanceToWork(ctx, job, items);
    if (!kind) {
      await endJob(ctx, {
        job,
        status: "COMPLETE",
        reason: "Everything is already researched — there was nothing to do.",
      });
      return { started: false, nothingToDo: true };
    }

    await startJobRun(ctx, { job, kind, now: Date.now() });
    return { started: true };
  },
});

export const getResearchJob = tenantQuery({
  args: {},
  handler: async (ctx) => {
    const companyId = await requireSalesDataCompany(ctx);

    const job =
      (await ctx.db
        .query("salesDataResearchJobs")
        .withIndex("by_company_status", (q) =>
          q.eq("companyId", companyId).eq("status", "RUNNING")
        )
        .first())
      ?? (await ctx.db
        .query("salesDataResearchJobs")
        .withIndex("by_company_started", (q) => q.eq("companyId", companyId))
        .order("desc")
        .first());

    if (!job) return null;
    return await describeJob(ctx, job);
  },
});
