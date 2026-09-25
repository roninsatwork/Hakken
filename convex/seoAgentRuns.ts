import { v } from "convex/values";

import { internalAction, internalMutation, internalQuery, type ActionCtx, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { sendNextBatch } from "./seoCollectionActions";
import { readDataForSeoCredentials } from "./dataForSeoRest";
import { getErrorMessage } from "./utils/lang";
import { SEO_COLLECTOR_RUN_MS } from "./seoCollectionPolicy";
import { companyCollectionSchedule } from "./seoScheduleService";
import { openSeoCycle, openSeoCycleOf } from "./seoTools";
import { companyHasWorkDue } from "./seoCollectionDue";
import { appendRunStep } from "./agentRunStepWriter";
import { startAgentRun } from "./agentRunStartService";
import { superAdminMutation } from "./tenantFunctions";
import { appError } from "./utils/appError";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * What the two DataForSEO agents do when they are told to run.
 *
 * Anthony, 2026-09-23: collection works only through the agents. An agent has
 * no idea of time — a schedule or the Run button tells it to run, and it does
 * its job once. Neither calls a model: the work is fixed, like the wiki staff's.
 *
 * - **Planner** (`DATAFORSEO_PLANNER`) fills the queue, and spends nothing.
 *   Its Mode, on its Settings, decides what: **Test** adds everything for
 *   every company collecting data, whatever is due — Anthony: "while we are
 *   testing yes add everything to the queue" — and **Live** adds only what is
 *   due by each company's cadence. Unset reads as Test.
 * - **Collector** (`DATAFORSEO_COLLECTOR`) empties the queue: sends each call
 *   and records its cost and a log line on its own run, until the queue is
 *   empty, its agent's spend limit is reached, or the run's time is up.
 *
 * The role is read off the agent (`systemKey`), never its name. Every run
 * writes its steps — what it observed, each company planned or each call made,
 * and its summary — so its Observability timeline shows everything it did.
 *
 * **Collect now** (`collectNow`, the button on a company's Collection schedule
 * screen) is a third way to tell them: a Planner run for that one company,
 * then a Collector run to send it — a one-off outside the company's schedule.
 */

/** How long a Planner run waits, in all, for the work lists it opened to be written. */
const PLAN_WAIT_MS = 60_000;
const POLL_MS = 1_000;

/**
 * A Planner run opens no more companies after this, and says where it
 * stopped: an action is stopped at ten minutes, and one stopped mid-run said
 * nothing at all (reliability plan 3.1). The rest are opened on its next run.
 */
const PLAN_OPEN_MS = 7 * 60 * 1000;

/** Companies read at a time to find those collecting data. */
const COMPANIES_PER_READ = 100;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const runSeoRoleNow = internalAction({
  args: {
    role: v.union(v.literal("DATAFORSEO_PLANNER"), v.literal("DATAFORSEO_COLLECTOR")),
    runId: v.id("agentRuns"),
    workflowExecutionId: v.optional(v.id("workflowExecutions")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.seoAgentRuns.markRunStarted, { runId: args.runId });
    try {
      const summary = args.role === "DATAFORSEO_PLANNER"
        ? await plan(ctx, args.runId)
        : await collect(ctx, args.runId);
      await ctx.runMutation(internal.seoAgentRuns.finishSeoRun, { ...args, status: "SUCCESS", summary });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.seoAgentRuns.finishSeoRun, {
        ...args,
        status: "FAILED",
        summary: message.replace(/\s+/g, " ").trim().slice(0, 400) || "No detail given.",
      });
    }
    return null;
  },
});

async function plan(ctx: ActionCtx, runId: Id<"agentRuns">): Promise<string> {
  const started = Date.now();
  const companies: Array<{ companyId: Id<"companies">; name: string }> = [];
  for (let cursor: string | null = null; ;) {
    const page: { companies: Array<{ companyId: Id<"companies">; name: string }>; cursor: string; isDone: boolean } =
      await ctx.runQuery(internal.seoAgentRuns.listCollectingCompanies, { cursor });
    companies.push(...page.companies);
    if (page.isDone) break;
    cursor = page.cursor;
  }
  if (companies.length === 0) return "No company is collecting data, so nothing was added to the queue.";
  const mode = await ctx.runQuery(internal.seoAgentRuns.readPlannerMode, { runId });
  await ctx.runMutation(internal.seoAgentRuns.recordObservation, {
    runId,
    text: `${companies.length} ${companies.length === 1 ? "company is" : "companies are"} collecting data: `
      + `${companies.map((company) => company.name).join(", ")}. Mode: ${mode === "LIVE" ? "Live" : "Test"}.`,
  });

  // Every company's collection opened first; each work list is written in the
  // background, all at once. Waiting on each in turn, a run of ten slow
  // companies outlived an action's ten minutes (reliability plan 3.1).
  const opened: Array<{ companyId: Id<"companies">; name: string; cycleId: Id<"seoCollectionCycles"> }> = [];
  const notDue: string[] = [];
  let reached = 0;
  for (const company of companies) {
    if (Date.now() - started > PLAN_OPEN_MS) break;
    reached += 1;
    const result = await ctx.runMutation(internal.seoAgentRuns.openCompanyCycle, {
      companyId: company.companyId,
      runId,
      mode,
    });
    if (result.cycleId && result.ok) {
      opened.push({ ...company, cycleId: result.cycleId });
      continue;
    }
    // Named once in the summary, not a line each: most companies are not due
    // on most runs.
    if (result.notDue) {
      notDue.push(company.name);
      continue;
    }
    await ctx.runMutation(internal.seoAgentRuns.logRunLine, {
      runId,
      companyId: company.companyId,
      heading: `Planned ${company.name}`,
      detail: result.message,
      failed: false,
    });
  }

  const counts = await waitForWorkLists(ctx, opened.map((company) => company.cycleId));
  let queued = 0;
  let reused = 0;
  for (const company of opened) {
    const written = counts.get(company.cycleId) ?? null;
    queued += written?.plannedCount ?? 0;
    reused += written?.reusedCount ?? 0;
    await ctx.runMutation(internal.seoAgentRuns.logRunLine, {
      runId,
      companyId: company.companyId,
      heading: `Planned ${company.name}`,
      detail: plannedLine(written),
      failed: false,
    });
  }
  const unreached = companies.length - reached;
  const planned = reached - notDue.length;
  const notDueLine = notDue.length > 0 ? `Not due yet: ${nameList(notDue)}. ` : "";
  const unreachedLine = unreached > 0
    ? `Stopped before the other ${unreached} ${unreached === 1 ? "company" : "companies"}, to finish inside a run's time; `
      + "the next run plans them. "
    : "";
  if (planned === 0) return `${mode === "LIVE" ? "Live" : "Test"} mode. ${notDueLine}${unreachedLine}Nothing was added to the queue.`;
  return `${mode === "LIVE" ? "Live" : "Test"} mode. `
    + `Added ${queued} ${queued === 1 ? "request" : "requests"} to the queue for ${planned} `
    + `${planned === 1 ? "company" : "companies"}; ${reused} served from data already held. `
    + notDueLine
    + unreachedLine
    + "The DataForSEO Collector sends them on its next run.";
}

/** Names written out in a run's summary before the rest are counted. */
const NAMES_IN_SUMMARY = 10;

function nameList(names: string[]): string {
  const shown = names.slice(0, NAMES_IN_SUMMARY).join(", ");
  const rest = names.length - NAMES_IN_SUMMARY;
  return rest > 0 ? `${shown} and ${rest} more` : shown;
}

type CycleCounts = { status: string; plannedCount: number; reusedCount: number } | null;

/**
 * Wait, as long as a Planner run may, for the work lists it opened to be
 * written — all of them at once, so the wait is one minute however many
 * companies there are. They are written in the background, a page of websites
 * at a time; waiting lets the run say what was actually queued.
 */
async function waitForWorkLists(
  ctx: ActionCtx,
  cycleIds: Id<"seoCollectionCycles">[],
): Promise<Map<Id<"seoCollectionCycles">, CycleCounts>> {
  const counts = new Map<Id<"seoCollectionCycles">, CycleCounts>();
  if (cycleIds.length === 0) return counts;
  const started = Date.now();
  for (;;) {
    for (let at = 0; at < cycleIds.length; at += CYCLES_PER_READ) {
      const read: Array<{ cycleId: Id<"seoCollectionCycles">; counts: CycleCounts }> = await ctx.runQuery(
        internal.seoAgentRuns.readCyclesCounts,
        { cycleIds: cycleIds.slice(at, at + CYCLES_PER_READ) },
      );
      for (const entry of read) counts.set(entry.cycleId, entry.counts);
    }
    const writing = [...counts.values()].some((entry) => entry?.status === "EXPANDING");
    if (!writing || Date.now() - started >= PLAN_WAIT_MS) return counts;
    await sleep(POLL_MS);
  }
}

/** One work list's wait, for Collect now. */
async function waitForWorkList(ctx: ActionCtx, cycleId: Id<"seoCollectionCycles">): Promise<CycleCounts> {
  return (await waitForWorkLists(ctx, [cycleId])).get(cycleId) ?? null;
}

/** Collections' counts read at a time while a Planner run waits. */
const CYCLES_PER_READ = 200;

/** What a Planner run says it queued for one company. */
function plannedLine(counts: CycleCounts): string {
  return counts?.status === "EXPANDING"
    ? "Still writing the work list; it finishes in the background."
    : `${counts?.plannedCount ?? 0} added to the queue, ${counts?.reusedCount ?? 0} served from data already held.`;
}

/** "Not now" replies in a row before a Collector run stops, and how long it waits after each. */
const REFUSAL_PAUSES_MS = [10_000, 30_000, 60_000];

async function collect(ctx: ActionCtx, runId: Id<"agentRuns">): Promise<string> {
  const started = Date.now();
  const workerId = `collector-${runId}`;

  // One Collector at a time: its schedule starts one, as do Run and Collect
  // now, and two at once would each spend to their own limit.
  const turn = await ctx.runMutation(internal.seoAgentRuns.takeCollectorTurn, { runId });
  if (!turn.ok) return turn.message;

  // No login, nothing claimed: before, the queue was claimed and failed row
  // by row for want of one.
  try {
    readDataForSeoCredentials();
  } catch (error) {
    return `Nothing was sent: ${getErrorMessage(error)}`;
  }

  const waiting = await ctx.runQuery(internal.seoAgentRuns.countWaiting, {});
  await ctx.runMutation(internal.seoAgentRuns.recordObservation, {
    runId,
    text: `Queue: ${waiting.count}${waiting.more ? "+" : ""} waiting to be sent.`,
  });
  let sent = 0;
  let refusals = 0;
  let stoppedBecause = "the queue is empty";

  for (;;) {
    if (Date.now() - started > SEO_COLLECTOR_RUN_MS) {
      stoppedBecause = "this run's time was up; the rest waits for the next run";
      break;
    }
    const outcome = await sendNextBatch(ctx, { workerId, runId });
    if (outcome.kind === "CAPPED") {
      stoppedBecause = "the spend limit was reached; the rest waits for the next run";
      break;
    }
    if (outcome.kind === "ACCOUNT") {
      stoppedBecause = `${outcome.reason} Nothing more is sent until that is fixed; the queue waits`;
      break;
    }
    if (outcome.kind === "REFUSED") {
      refusals += 1;
      if (refusals > REFUSAL_PAUSES_MS.length) {
        stoppedBecause = `DataForSEO kept saying "not now" (${outcome.reason}); the rest waits for the next run`;
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
    // Nothing due this moment. Work is spaced out as it is queued, so wait
    // for the next row if it comes due while this run still has time.
    const wait = outcome.nextDueAt === null ? null : outcome.nextDueAt - Date.now();
    if (wait === null || Date.now() - started + wait > SEO_COLLECTOR_RUN_MS) break;
    await sleep(Math.max(wait, 250));
  }

  const spent = await ctx.runQuery(internal.seoAgentRuns.readRunCost, { runId });
  return `Sent ${sent} ${sent === 1 ? "request" : "requests"} to DataForSEO and spent $${spent.toFixed(2)}. `
    + `Stopped because ${stoppedBecause}.`;
}

/**
 * Whether this Collector run may send. Only one does at a time: the earliest
 * started of the live ones carries on, and a later one stops at once, saying
 * so. Two starting together are settled the same way on both sides, so one
 * always goes.
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
      .take(RECENT_COLLECTOR_RUNS);
    const ahead = recent.find((other) =>
      other._id !== run._id
      && isGoing(other, now)
      && (other.startedAt < run.startedAt || (other.startedAt === run.startedAt && other._id < run._id)));
    if (!ahead) return { ok: true, message: "" };
    const at = new Date(ahead.startedAt).toISOString().slice(11, 16);
    return {
      ok: false,
      message: `Another Collector run, started at ${at} UTC, is already sending. This one stopped without sending anything, `
        + "so nothing is sent twice and the spend limit stays one limit.",
    };
  },
});

/**
 * A page of the companies with data collection switched on — the switch on
 * their Collection schedule screen. Read company by company: the first 500
 * schedules of every kind were read before, and a company whose schedule lay
 * past them was never planned (reliability plan 3.1).
 */
export const listCollectingCompanies = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    companies: v.array(v.object({ companyId: v.id("companies"), name: v.string() })),
    cursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("companies").paginate({ cursor: args.cursor, numItems: COMPANIES_PER_READ });
    const companies: Array<{ companyId: Id<"companies">; name: string }> = [];
    for (const company of page.page) {
      const schedule = await companyCollectionSchedule(ctx, company._id);
      if (schedule?.isActive) companies.push({ companyId: company._id, name: company.name });
    }
    return { companies, cursor: page.continueCursor, isDone: page.isDone };
  },
});

/** The Planner's Mode, from its agent. Unset reads as Test. */
export const readPlannerMode = internalQuery({
  args: { runId: v.id("agentRuns") },
  returns: v.union(v.literal("TEST"), v.literal("LIVE")),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    const agent = run ? await ctx.db.get(run.agentId) : null;
    return agent?.plannerMode ?? "TEST";
  },
});

/**
 * Open a company's collection for the Planner: everything in Test, what is
 * due in Live — and in Live, nothing at all for a company with nothing due,
 * so a Planner run leaves no empty collection behind for it.
 */
export const openCompanyCycle = internalMutation({
  args: {
    companyId: v.id("companies"),
    runId: v.id("agentRuns"),
    mode: v.union(v.literal("TEST"), v.literal("LIVE")),
  },
  returns: v.object({
    ok: v.boolean(),
    cycleId: v.union(v.id("seoCollectionCycles"), v.null()),
    message: v.string(),
    /** Live found nothing due by the company's schedule, so no collection was opened. */
    notDue: v.optional(v.boolean()),
  }),
  handler: async (ctx, args): Promise<{
    ok: boolean;
    cycleId: Id<"seoCollectionCycles"> | null;
    message: string;
    notDue?: boolean;
  }> => {
    if (args.mode === "LIVE" && !await companyHasWorkDue(ctx, args.companyId, new Date())) {
      return { ok: false, cycleId: null, message: "Nothing is due yet by its schedule.", notDue: true };
    }
    // MANUAL collects every website whether or not its cadence says it is due;
    // SCHEDULE skips a website its company's cadence says is not due yet.
    return await openSeoCycle(ctx, {
      companyId: args.companyId,
      agentRunId: args.runId,
      trigger: args.mode === "LIVE" ? "SCHEDULE" : "MANUAL",
    });
  },
});

const cycleCounts = v.union(v.null(), v.object({ status: v.string(), plannedCount: v.number(), reusedCount: v.number() }));

export const readCyclesCounts = internalQuery({
  args: { cycleIds: v.array(v.id("seoCollectionCycles")) },
  returns: v.array(v.object({ cycleId: v.id("seoCollectionCycles"), counts: cycleCounts })),
  handler: async (ctx, args) => {
    const read = [];
    for (const cycleId of args.cycleIds) {
      const cycle = await ctx.db.get(cycleId);
      read.push({
        cycleId,
        counts: cycle ? { status: cycle.status, plannedCount: cycle.plannedCount, reusedCount: cycle.reusedCount } : null,
      });
    }
    return read;
  },
});

export const readRunCost = internalQuery({
  args: { runId: v.id("agentRuns") },
  returns: v.number(),
  handler: async (ctx, args) => (await ctx.db.get(args.runId))?.costUsd ?? 0,
});

export const logRunLine = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    companyId: v.optional(v.id("companies")),
    heading: v.string(),
    detail: v.string(),
    failed: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    const stepId = await appendRunStep(ctx, {
      runId: args.runId,
      agentId: run.agentId,
      ...(args.companyId ? { companyId: args.companyId } : {}),
      kind: "PLAN",
      status: args.failed ? "FAILED" : "SUCCESS",
      input: args.heading,
      output: args.detail,
    });
    await ctx.db.insert("agentLogs", {
      agentId: run.agentId,
      runId: args.runId,
      stepId,
      ...(args.companyId ? { companyId: args.companyId } : {}),
      interactionType: args.heading,
      promptContent: "",
      responseContent: args.detail,
      outcome: args.failed ? "FAILED" : "SUCCESS",
      createdAt: Date.now(),
    });
    return null;
  },
});

/** What a run found before it started — its first step. */
export const recordObservation = internalMutation({
  args: { runId: v.id("agentRuns"), text: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    await appendRunStep(ctx, { runId: args.runId, agentId: run.agentId, kind: "OBSERVE", status: "SUCCESS", output: args.text });
    return null;
  },
});

/** Requests waiting to be sent, counted to a ceiling — enough to say how big the job is. */
export const countWaiting = internalQuery({
  args: {},
  returns: v.object({ count: v.number(), more: v.boolean() }),
  handler: async (ctx) => {
    const ceiling = 1_000;
    const rows = await ctx.db
      .query("seoDataPulls")
      .withIndex("by_status_due", (q) => q.eq("status", "PENDING"))
      .take(ceiling + 1);
    return { count: Math.min(rows.length, ceiling), more: rows.length > ceiling };
  },
});

export const markRunStarted = internalMutation({
  args: { runId: v.id("agentRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, { status: "RUNNING", updatedAt: Date.now() });
    return null;
  },
});

export const finishSeoRun = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    workflowExecutionId: v.optional(v.id("workflowExecutions")),
    role: v.string(),
    status: v.union(v.literal("SUCCESS"), v.literal("FAILED")),
    summary: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run) {
      await appendRunStep(ctx, {
        runId: args.runId,
        agentId: run.agentId,
        kind: "FINAL",
        status: args.status,
        output: args.summary,
        ...(args.status === "FAILED" ? { error: args.summary } : {}),
      });
    }
    const now = Date.now();
    await ctx.db.patch(args.runId, {
      status: args.status,
      finalOutput: args.summary,
      ...(args.status === "FAILED" ? { error: args.summary } : {}),
      completedAt: now,
      updatedAt: now,
    });
    if (args.workflowExecutionId) {
      await ctx.db.patch(args.workflowExecutionId, { status: args.status, completedAt: now });
    }
    return null;
  },
});

// ── Collect now ────────────────────────────────────────────────────────────

/** A run older than this that still says RUNNING died without saying so: a Collector run is capped well inside it. */
const LIVE_RUN_MS = SEO_COLLECTOR_RUN_MS + 5 * 60 * 1000;

/** The Collector's newest runs, read to see whether one is still sending. */
const RECENT_COLLECTOR_RUNS = 5;

type Role = "DATAFORSEO_PLANNER" | "DATAFORSEO_COLLECTOR";

const ROLE_LABELS: Record<Role, string> = {
  DATAFORSEO_PLANNER: "DataForSEO Planner",
  DATAFORSEO_COLLECTOR: "DataForSEO Collector",
};

/** The agent holding a DataForSEO role, refused plainly when there is none or it is switched off. */
async function requireRoleAgent(ctx: { db: MutationCtx["db"] }, role: Role): Promise<Doc<"agents">> {
  const agent = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", role)).first();
  if (!agent) throw appError("NOT_FOUND", `There is no ${ROLE_LABELS[role]} agent. Create it from its template first.`);
  if (agent.isActive === false) throw appError("CONFLICT", `${agent.name} is switched off. Switch it on in Agents first.`);
  return agent;
}

function isGoing(run: Doc<"agentRuns">, now: number): boolean {
  return (run.status === "QUEUED" || run.status === "RUNNING") && now - run.startedAt < LIVE_RUN_MS;
}

/**
 * Start a Collector run to send what is queued — unless one is already
 * sending, which then sends this too. One Collector at a time: two would draw
 * on the same spend limit at once.
 */
async function startCollector(
  ctx: MutationCtx,
  args: { companyId: Id<"companies">; companyName: string; userId?: Id<"users"> },
): Promise<boolean> {
  const collector = await requireRoleAgent(ctx, "DATAFORSEO_COLLECTOR");
  const now = Date.now();
  const recent = await ctx.db
    .query("agentRuns")
    .withIndex("by_agent_started", (q) => q.eq("agentId", collector._id))
    .order("desc")
    .take(RECENT_COLLECTOR_RUNS);
  if (recent.some((run) => isGoing(run, now))) return false;

  const objective = `Send the queue: collect now for ${args.companyName}.`;
  const runId = await ctx.db.insert("agentRuns", {
    agentId: collector._id,
    triggerType: "MANUAL",
    objective,
    title: `Collect now — ${args.companyName}`,
    status: "QUEUED",
    companyId: args.companyId,
    userId: args.userId,
    startedAt: now,
    updatedAt: now,
  });
  const workflowExecutionId = await ctx.db.insert("workflowExecutions", {
    agentId: collector._id,
    agentRunId: runId,
    triggerType: "MANUAL",
    status: "RUNNING",
    startedAt: now,
    startedBy: args.userId,
  });
  await startAgentRun(ctx, {
    agent: collector,
    runId,
    workflowExecutionId,
    objective,
    triggerType: "MANUAL",
    companyId: args.companyId,
    userId: args.userId,
  });
  return true;
}

const collectNowOutcome = v.union(
  /** Queued now: the Planner writes the work list, then starts the Collector. */
  v.literal("QUEUED"),
  /** Already being queued; the Collector starts as soon as the list is written. */
  v.literal("BEING_QUEUED"),
  /** Already queued, so nothing was queued twice: the Collector was started to send it. */
  v.literal("SENDING"),
  /** Already queued, and the Collector is already sending it. */
  v.literal("ALREADY_SENDING"),
);

/**
 * Collect now: one company's collection, straight away, as a one-off outside
 * its schedule (Anthony, 2026-09-25: "an override as a one off from the
 * company schedule"). The schedule itself is left exactly as it is.
 *
 * Still through the agents. It is a Planner run for this one company, which
 * queues everything for its websites and competitors whatever its cadence says
 * is due — MANUAL, as the Planner's Test mode queues — and, once the work list
 * is written, a Collector run to send it, so the data arrives now rather than
 * at the Collector's next scheduled run. Both are in their agents' runs.
 *
 * Refused while the company's collection is switched off — off means fetch
 * nothing, and a one-off does not reach past the switch — and when either
 * agent is missing or off. Nothing is ever queued twice: a collection with
 * requests still to send is sent instead (`openSeoCycleOf`). One that has sent
 * everything and only waits for answers does not hold up a fresh one.
 */
export const collectNow = superAdminMutation({
  args: { companyId: v.id("companies") },
  returns: v.object({ outcome: collectNowOutcome, cycleId: v.id("seoCollectionCycles") }),
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (!company) throw appError("NOT_FOUND", "Company not found.");
    const schedule = await companyCollectionSchedule(ctx, args.companyId);
    if (!schedule?.isActive) {
      throw appError("CONFLICT", `Collection is switched off for ${company.name}. Switch it on and save first.`);
    }
    const planner = await requireRoleAgent(ctx, "DATAFORSEO_PLANNER");
    await requireRoleAgent(ctx, "DATAFORSEO_COLLECTOR");
    const who = { companyId: args.companyId, companyName: company.name, userId: ctx.userId };

    const open = await openSeoCycleOf(ctx, args.companyId);
    if (open?.status === "EXPANDING") {
      // Its list is still being written: send it as soon as it is.
      await ctx.scheduler.runAfter(0, internal.seoAgentRuns.sendWhenWritten, { cycleId: open._id, ...who });
      return { outcome: "BEING_QUEUED" as const, cycleId: open._id };
    }
    if (open) {
      const started = await startCollector(ctx, who);
      return { outcome: started ? ("SENDING" as const) : ("ALREADY_SENDING" as const), cycleId: open._id };
    }

    const now = Date.now();
    const runId = await ctx.db.insert("agentRuns", {
      agentId: planner._id,
      triggerType: "MANUAL",
      objective: `Queue everything for ${company.name}'s websites and competitors now, whatever its schedule says is due, then start the Collector to send it.`,
      title: `Collect now — ${company.name}`,
      status: "QUEUED",
      companyId: args.companyId,
      userId: ctx.userId,
      startedAt: now,
      updatedAt: now,
    });
    const workflowExecutionId = await ctx.db.insert("workflowExecutions", {
      agentId: planner._id,
      agentRunId: runId,
      triggerType: "MANUAL",
      status: "RUNNING",
      startedAt: now,
      startedBy: ctx.userId,
    });
    // MANUAL: every website, whether or not its cadence says it is due.
    const opened = await openSeoCycle(ctx, { companyId: args.companyId, agentRunId: runId, trigger: "MANUAL" });
    if (!opened.ok || !opened.cycleId) throw appError("CONFLICT", opened.message);
    await ctx.scheduler.runAfter(0, internal.seoAgentRuns.finishCollectNow, {
      runId,
      workflowExecutionId,
      cycleId: opened.cycleId,
      ...who,
    });
    return { outcome: "QUEUED" as const, cycleId: opened.cycleId };
  },
});

const whoArgs = {
  companyId: v.id("companies"),
  companyName: v.string(),
  userId: v.optional(v.id("users")),
};

/** Collect now's Planner run, after the cycle is open: wait for the work list, say what was queued, start the Collector. */
export const finishCollectNow = internalAction({
  args: {
    runId: v.id("agentRuns"),
    workflowExecutionId: v.id("workflowExecutions"),
    cycleId: v.id("seoCollectionCycles"),
    ...whoArgs,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { runId, workflowExecutionId, cycleId, ...who } = args;
    await ctx.runMutation(internal.seoAgentRuns.markRunStarted, { runId });
    try {
      await ctx.runMutation(internal.seoAgentRuns.recordObservation, {
        runId,
        text: `Collect now for ${who.companyName}, from its Collection schedule screen: everything for its websites `
          + "and competitors, whatever its schedule says is due.",
      });
      const counts = await waitForWorkList(ctx, cycleId);
      await ctx.runMutation(internal.seoAgentRuns.logRunLine, {
        runId,
        companyId: who.companyId,
        heading: `Planned ${who.companyName}`,
        detail: plannedLine(counts),
        failed: false,
      });
      const { started } = await ctx.runMutation(internal.seoAgentRuns.startCollectorRun, who);
      const summary = `Collect now for ${who.companyName}: ${plannedLine(counts)} `
        + (started ? "Started the DataForSEO Collector to send it." : "The DataForSEO Collector is already running and sends it.");
      await ctx.runMutation(internal.seoAgentRuns.finishSeoRun, {
        runId, workflowExecutionId, role: "DATAFORSEO_PLANNER", status: "SUCCESS", summary,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.seoAgentRuns.finishSeoRun, {
        runId,
        workflowExecutionId,
        role: "DATAFORSEO_PLANNER",
        status: "FAILED",
        summary: message.replace(/\s+/g, " ").trim().slice(0, 400) || "No detail given.",
      });
    }
    return null;
  },
});

/** A collection pressed while its list was still being written: send it once it is. */
export const sendWhenWritten = internalAction({
  args: { cycleId: v.id("seoCollectionCycles"), ...whoArgs },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { cycleId, ...who } = args;
    await waitForWorkList(ctx, cycleId);
    await ctx.runMutation(internal.seoAgentRuns.startCollectorRun, who);
    return null;
  },
});

export const startCollectorRun = internalMutation({
  args: whoArgs,
  returns: v.object({ started: v.boolean() }),
  handler: async (ctx, args) => ({ started: await startCollector(ctx, args) }),
});
