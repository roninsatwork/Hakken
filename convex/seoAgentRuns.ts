import { v } from "convex/values";

import { internalAction, internalMutation, internalQuery, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { collectStep } from "./seoCollectorRun";
import { readDataForSeoCredentials } from "./dataForSeoRest";
import { getErrorMessage } from "./utils/lang";
import { companyCollectionSchedule } from "./seoScheduleService";
import { openSeoCycle, openSeoCycleOf } from "./seoTools";
import { companyHasWorkDue } from "./seoCollectionDue";
import { startAgentRun } from "./agentRunStartService";
import { runAhead } from "./roleRuns";
import { superAdminMutation } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { dayCeilingReached } from "./seoCollectionLimits";
import { SEO_WAITING_TOO_LONG_MS } from "./seoCollectionPolicy";
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
 *   and records its cost and a log line on its own run, in one continuous send
 *   as long as the queue (`seoCollectorRun.ts`), within its limit per website
 *   and its ceiling a day (`seoCollectionLimits.ts`).
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
    await ctx.runMutation(internal.roleRuns.markRunStarted, { runId: args.runId });
    try {
      // A Collector run that starts sending is finished by its last step; one
      // that does not start says why here.
      const summary = args.role === "DATAFORSEO_PLANNER"
        ? await plan(ctx, args.runId)
        : await startCollecting(ctx, args.runId, args.workflowExecutionId);
      if (summary !== null) {
        await ctx.runMutation(internal.roleRuns.finishRoleRun, { runId: args.runId, workflowExecutionId: args.workflowExecutionId, status: "SUCCESS", summary });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.roleRuns.finishRoleRun, {
        runId: args.runId,
        workflowExecutionId: args.workflowExecutionId,
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
  await ctx.runMutation(internal.roleRuns.recordObservation, {
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
    await ctx.runMutation(internal.roleRuns.logRunLine, {
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
    await ctx.runMutation(internal.roleRuns.logRunLine, {
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

/**
 * Start a Collector run's send: its first step, at once, with the watch that
 * carries it on if the platform stops it. Says why instead when it may not
 * send — another run is sending, or there is no DataForSEO login — and
 * returns nothing when it started, the run's last step finishing it.
 */
async function startCollecting(
  ctx: ActionCtx,
  runId: Id<"agentRuns">,
  workflowExecutionId: Id<"workflowExecutions"> | undefined,
): Promise<string | null> {
  // One Collector at a time: its schedule starts one, as do Run, Collect now
  // and the hourly check, and two at once would send side by side.
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
  await ctx.runMutation(internal.roleRuns.recordObservation, {
    runId,
    text: `Queue: ${waiting.count}${waiting.more ? "+" : ""} waiting to be sent.`,
  });
  const first = { runId, ...(workflowExecutionId ? { workflowExecutionId } : {}), step: 1, sent: 0, refusedSteps: 0 };
  const watchId: Id<"_scheduled_functions"> = await ctx.runMutation(internal.seoCollectorRun.bookCollectorStep, first);
  await collectStep(ctx, { ...first, watchId });
  return null;
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
    const ahead = await runAhead(ctx, run, COLLECTOR_SILENT_MS);
    if (!ahead) return { ok: true, message: "" };
    const at = new Date(ahead.startedAt).toISOString().slice(11, 16);
    return {
      ok: false,
      message: `Another Collector run, started at ${at} UTC, is already sending, and sends this too. This one stopped `
        + "without sending anything, so nothing is sent twice.",
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

// ── Collect now ────────────────────────────────────────────────────────────

/**
 * A Collector run silent this long that still says RUNNING died without saying
 * so. Judged by its last step, not its start: a run is as long as the queue,
 * and each step marks it moving (`seoCollectorRun.ts`) — a step booked ahead
 * at most `SEO_COLLECTOR_WAIT_AHEAD_MS`, a lost one taken over by its watch.
 */
export const COLLECTOR_SILENT_MS = 15 * 60 * 1000;

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
  return (run.status === "QUEUED" || run.status === "RUNNING") && now - Math.max(run.startedAt, run.updatedAt) < COLLECTOR_SILENT_MS;
}

/** Whether a Collector run is sending now — for Collection pipeline's line on what is happening. */
export async function collectorSending(ctx: { db: QueryCtx["db"] }): Promise<boolean> {
  const collector = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", "DATAFORSEO_COLLECTOR")).first();
  if (!collector) return false;
  const now = Date.now();
  const recent = await ctx.db
    .query("agentRuns")
    .withIndex("by_agent_started", (q) => q.eq("agentId", collector._id))
    .order("desc")
    .take(RECENT_COLLECTOR_RUNS);
  return recent.some((run) => isGoing(run, now));
}

/**
 * Start a Collector run to send what is queued — unless one is already
 * sending, which then sends this too. One Collector at a time: two would draw
 * on the same spend limit at once. Also how a question's "Generate fan-out
 * queries now" sends its answers (`promptFanOut.ts`).
 */
export async function startCollector(
  ctx: MutationCtx,
  args: {
    /** The company it is for; none when the hourly check starts it for whatever waits. */
    companyId?: Id<"companies">;
    companyName?: string;
    userId?: Id<"users">;
    /** What the run is for, when it is not Collect now: "Generate fan-out queries". */
    purpose?: string;
  },
): Promise<boolean> {
  const collector = await requireRoleAgent(ctx, "DATAFORSEO_COLLECTOR");
  const now = Date.now();
  const recent = await ctx.db
    .query("agentRuns")
    .withIndex("by_agent_started", (q) => q.eq("agentId", collector._id))
    .order("desc")
    .take(RECENT_COLLECTOR_RUNS);
  if (recent.some((run) => isGoing(run, now))) return false;

  const purpose = args.purpose ?? "Collect now";
  const objective = args.companyName
    ? `Send the queue: ${purpose.toLowerCase()} for ${args.companyName}.`
    : `Send the queue: ${purpose.toLowerCase()}.`;
  const runId = await ctx.db.insert("agentRuns", {
    agentId: collector._id,
    triggerType: "MANUAL",
    objective,
    title: args.companyName ? `${purpose} — ${args.companyName}` : purpose,
    status: "QUEUED",
    ...(args.companyId ? { companyId: args.companyId } : {}),
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

/**
 * Start the Collector for requests left waiting — due since `dueBefore` with
 * no Collector sending — unless today's ceiling holds them. The hourly check
 * calls it for requests due a quarter of an hour (the net under each step's
 * watch), and saving the Collector's limits for anything due at all, so a
 * raised limit carries on at once rather than waiting for a button.
 */
export async function sendWhatWaits(ctx: MutationCtx, dueBefore: number): Promise<boolean> {
  const waiting = await ctx.db
    .query("seoDataPulls")
    .withIndex("by_status_due", (q) => q.eq("status", "PENDING").lt("dueAt", dueBefore))
    .first();
  if (!waiting) return false;
  const collector = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", "DATAFORSEO_COLLECTOR")).first();
  if (!collector || collector.isActive === false) return false;
  if (await dayCeilingReached(ctx)) return false;
  return await startCollector(ctx, { purpose: "Send what was waiting" });
}

/** The hourly check's net: requests due a quarter of an hour with nothing sending. */
export async function sendLongWaiting(ctx: MutationCtx, now: number): Promise<void> {
  await sendWhatWaits(ctx, now - SEO_WAITING_TOO_LONG_MS);
}

/** After the Collector's limits are saved: whatever is due goes now, if nothing is sending it. */
export const sendIfWaiting = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await sendWhatWaits(ctx, Date.now() + 1);
    return null;
  },
});

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
    await ctx.runMutation(internal.roleRuns.markRunStarted, { runId });
    try {
      await ctx.runMutation(internal.roleRuns.recordObservation, {
        runId,
        text: `Collect now for ${who.companyName}, from its Collection schedule screen: everything for its websites `
          + "and competitors, whatever its schedule says is due.",
      });
      const counts = await waitForWorkList(ctx, cycleId);
      await ctx.runMutation(internal.roleRuns.logRunLine, {
        runId,
        companyId: who.companyId,
        heading: `Planned ${who.companyName}`,
        detail: plannedLine(counts),
        failed: false,
      });
      const { started } = await ctx.runMutation(internal.seoAgentRuns.startCollectorRun, who);
      const summary = `Collect now for ${who.companyName}: ${plannedLine(counts)} `
        + (started ? "Started the DataForSEO Collector to send it." : "The DataForSEO Collector is already running and sends it.");
      await ctx.runMutation(internal.roleRuns.finishRoleRun, { runId, workflowExecutionId, status: "SUCCESS", summary });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.roleRuns.finishRoleRun, {
        runId,
        workflowExecutionId,
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
