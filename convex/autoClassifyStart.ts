import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { resolveDecisionModes } from "./decisionRuns";
import { readClassificationSetup, readHoldPages, ruleInputs } from "./pageClassifications";
import { closeRoleRun, failureSummary, writeRunLine } from "./roleRuns";
import { superAdminMutation, superAdminQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { AUTO_CLASSIFY_DECISION, GROUPS_OFFERED, groupsStamp } from "./utils/autoClassify";
import { AUTO_CLASSIFIER, AUTO_CLASSIFY_SCHEDULE, AUTO_CLASSIFY_STALL_MS } from "./utils/autoClassifyAgent";
import { classifierFor, normalisePage } from "./utils/pageClassification";
import { isTrackedHold } from "./utils/websitePairing";
import { getNextWorkflowScheduleRunAt } from "./workflowScheduleService";

/**
 * Starting Auto Classify (docs/plans/active/auto-classify-plan.md, AC6, AC10):
 * the built-in agent, kept there with its nightly schedule; one website's run
 * started from the button, after its groups change, or by the night's run; and
 * what the Page classification screen shows of it.
 *
 * Each website is a run of its own under the agent — its steps, log lines,
 * model costs and Jev's answers on that run — and one row a website
 * (`autoClassifyRuns`) says how far it has got. A website with nothing to ask
 * and no group to describe gets no run at all, so the agent's runs are the
 * ones that did something.
 */

type Reader = { db: QueryCtx["db"] };
type HoldId = Id<"companyWebsites">;

/** Why Auto Classify can't run now, or ON. */
export type Readiness = "ON" | "DECISION_OFF" | "AGENT_OFF";

/** The Auto Classify agent, when it has been made. */
export async function findAutoClassifier(ctx: Reader): Promise<Doc<"agents"> | null> {
  return await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", AUTO_CLASSIFIER.systemKey)).first();
}

/** Idempotent: the agent, made once and kept in step, and its nightly schedule made with it. Never overwrites its switch or a changed schedule. */
export async function ensureAutoClassifier(ctx: MutationCtx): Promise<Id<"agents">> {
  const now = Date.now();
  const definition = {
    name: AUTO_CLASSIFIER.name,
    description: AUTO_CLASSIFIER.description,
    systemPrompt: AUTO_CLASSIFIER.systemPrompt,
    standingObjective: AUTO_CLASSIFIER.standingObjective,
  };
  const existing = await findAutoClassifier(ctx);
  if (existing) {
    if (Object.entries(definition).some(([key, value]) => existing[key as keyof typeof definition] !== value)) {
      await ctx.db.patch(existing._id, { ...definition, updatedAt: now });
    }
    return existing._id;
  }
  const agentId = await ctx.db.insert("agents", {
    ...definition,
    systemKey: AUTO_CLASSIFIER.systemKey,
    // The pages are asked of the Decision's own model; a description is written by the platform's stored writing model.
    modelId: "fast-chat (resolved at run time)",
    thinkingMode: false,
    isActive: true,
    isGlobal: true,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("schedules", {
    name: AUTO_CLASSIFY_SCHEDULE.name,
    agentId,
    intervalStr: AUTO_CLASSIFY_SCHEDULE.intervalStr,
    isActive: true,
    nextRunAt: getNextWorkflowScheduleRunAt({ intervalStr: AUTO_CLASSIFY_SCHEDULE.intervalStr, now: new Date(now) }),
    createdAt: now,
  });
  return agentId;
}

export const ensureAutoClassifierInternal = internalMutation({
  args: {},
  returns: v.id("agents"),
  handler: async (ctx) => await ensureAutoClassifier(ctx),
});

/** Whether Auto Classify may run for this company: its agent switched on (or not yet made), and the Decision on. */
async function readiness(ctx: Reader, companyId: Id<"companies">): Promise<Readiness> {
  const agent = await findAutoClassifier(ctx);
  if (agent && agent.isActive === false) return "AGENT_OFF";
  const modes = await resolveDecisionModes(ctx, { decisionKeys: [AUTO_CLASSIFY_DECISION], companyId });
  return modes[AUTO_CLASSIFY_DECISION] === "OFF" ? "DECISION_OFF" : "ON";
}

/**
 * What is left to do for a website: the pages to ask, busiest first — those
 * no hand or line sets, not taken out by hand, and not yet asked under the
 * groups as they are now — and its groups without a description. The groups
 * offered are the first 25 added.
 */
export async function autoWorkOf(ctx: Reader, hold: Doc<"companyWebsites">) {
  const [setup, held] = await Promise.all([readClassificationSetup(ctx, hold._id), readHoldPages(ctx, hold._id)]);
  const groups = setup.classifications.slice(0, GROUPS_OFFERED);
  const stamp = groupsStamp(groups);
  const inputs = ruleInputs({ ...setup, autos: [] });
  const classify = classifierFor(inputs.lines, inputs.picks);
  const asked = new Map((setup.autos ?? []).map((answer) => [normalisePage(answer.page), answer.stamp]));
  const toAsk = groups.length === 0
    ? []
    : held.pages.filter((row) => classify(row.page, row.sitemapFile ?? null).how === "NONE" && asked.get(normalisePage(row.page)) !== stamp);
  return {
    setup,
    held,
    groups,
    stamp,
    toAsk,
    undescribed: groups.filter((group) => !group.description),
    groupsLeftOut: Math.max(0, setup.classifications.length - GROUPS_OFFERED),
  };
}

const count = (n: number, one: string, many: string) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;

const TRIGGER_WORDS = {
  BUTTON: "Started from the Auto Classify button.",
  GROUPS_CHANGED: "Started because the website's groups changed.",
  NIGHT: "Started by the night's run, for the pages found since.",
} as const;
type Trigger = keyof typeof TRIGGER_WORDS;

export type StartOutcome = "STARTED" | "GOING" | "NOTHING" | Exclude<Readiness, "ON">;

/**
 * One website's run, under the agent: its first step, and its row for the
 * screen. A run still going is left to go — it reads what is left at each
 * step, so it takes up any change too; one whose last step was lost is closed
 * and a new one starts.
 */
export async function beginSiteRun(ctx: MutationCtx, hold: Doc<"companyWebsites">, trigger: Trigger): Promise<StartOutcome> {
  const ready = await readiness(ctx, hold.companyId);
  if (ready !== "ON") return ready;
  const now = Date.now();
  const state = await ctx.db.query("autoClassifyRuns").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first();
  if (state?.status === "SORTING" && now - state.lastStepAt < AUTO_CLASSIFY_STALL_MS) return "GOING";
  const work = await autoWorkOf(ctx, hold);
  if (work.toAsk.length === 0 && work.undescribed.length === 0) return "NOTHING";
  if (state?.status === "SORTING" && state.agentRunId) {
    await closeRoleRun(ctx, { runId: state.agentRunId, status: "FAILED", summary: "Its last step was lost. A new run carries on from what is left." });
  }

  const agentId = await ensureAutoClassifier(ctx);
  const website = await ctx.db.get(hold.websiteId);
  const host = website?.displayHost ?? website?.host ?? "";
  const runId = await ctx.db.insert("agentRuns", {
    agentId,
    triggerType: "EVENT",
    objective: `Sort ${host}'s pages that no person or rule has put in a group into its own groups.`,
    title: `Auto Classify: ${host}`,
    status: "QUEUED",
    companyId: hold.companyId,
    startedAt: now,
    updatedAt: now,
  });
  const workflowExecutionId = await ctx.db.insert("workflowExecutions", { agentId, agentRunId: runId, triggerType: "EVENT", status: "RUNNING", startedAt: now });
  await writeRunLine(ctx, {
    runId,
    companyId: hold.companyId,
    heading: "What there is to do",
    detail: [
      TRIGGER_WORDS[trigger],
      `${count(work.toAsk.length, "page", "pages")} of the ${work.held.pages.length.toLocaleString("en-GB")} busiest have no group from a person or a rule and have not been asked under the groups as they are now.`,
      work.undescribed.length > 0 ? `${count(work.undescribed.length, "group has", "groups have")} no description yet, written first.` : "",
      work.groupsLeftOut > 0 ? `${count(work.groupsLeftOut, "group is", "groups are")} past the ${GROUPS_OFFERED} offered, and not offered.` : "",
      work.held.cut ? "The website has more pages than are read; those with the fewest clicks are left out." : "",
    ].filter(Boolean).join(" "),
    failed: false,
  });
  const row = {
    companyWebsiteId: hold._id,
    companyId: hold.companyId,
    status: "SORTING" as const,
    agentRunId: runId,
    workflowExecutionId,
    total: work.toAsk.length,
    done: 0,
    placed: 0,
    startedAt: now,
    lastStepAt: now,
    finishedAt: undefined,
    stopped: undefined,
  };
  if (state) await ctx.db.patch(state._id, row);
  else await ctx.db.insert("autoClassifyRuns", row);
  await ctx.scheduler.runAfter(0, internal.autoClassifyRun.sortStep, { companyWebsiteId: hold._id, runId, workflowExecutionId });
  return "STARTED";
}

/** One of the company's own websites, or refused. */
async function ownedHold(ctx: Reader, companyWebsiteId: HoldId): Promise<Doc<"companyWebsites">> {
  const hold = await ctx.db.get(companyWebsiteId);
  if (!hold) throw appError("NOT_FOUND", "That website is no longer held by this company.");
  if (isTrackedHold(hold)) throw appError("INVALID_INPUT", "A competitor has no page groups: only the company's own websites are sorted.");
  return hold;
}

const startOutcome = v.union(
  v.literal("STARTED"), v.literal("GOING"), v.literal("NOTHING"), v.literal("DECISION_OFF"), v.literal("AGENT_OFF"),
);

/** The Auto Classify button on Page classification: sort what is left now. */
export const startAutoClassify = superAdminMutation({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: startOutcome,
  handler: async (ctx, args) => {
    const hold = await ownedHold(ctx, args.companyWebsiteId);
    const outcome = await beginSiteRun(ctx, hold, "BUTTON");
    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "START_AUTO_CLASSIFY",
      entityId: hold._id,
      entityType: "companyWebsites",
      companyId: hold.companyId,
      metadata: JSON.stringify({ outcome }),
      timestamp: Date.now(),
    });
    return outcome;
  },
});

/** After a website's groups change (`autoClassifyNote.ts`), or for the night's run: its pages sorted again, when Auto Classify is on. */
export const startForWebsite = internalMutation({
  args: { companyWebsiteId: v.id("companyWebsites"), night: v.optional(v.boolean()) },
  returns: v.union(startOutcome, v.literal("GONE")),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.companyWebsiteId);
    if (!hold || isTrackedHold(hold)) return "GONE";
    return await beginSiteRun(ctx, hold, args.night ? "NIGHT" : "GROUPS_CHANGED");
  },
});

const runShape = v.object({
  status: v.union(v.literal("SORTING"), v.literal("DONE"), v.literal("STOPPED")),
  total: v.number(),
  done: v.number(),
  placed: v.number(),
  startedAt: v.number(),
  lastStepAt: v.number(),
  finishedAt: v.union(v.number(), v.null()),
  stopped: v.union(v.string(), v.null()),
});

/** What the Page classification screen shows of Auto Classify: whether it can run, and its last run. */
export const autoClassifyStatus = superAdminQuery({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.object({ readiness: v.union(v.literal("ON"), v.literal("DECISION_OFF"), v.literal("AGENT_OFF")), groupsLeftOut: v.number(), run: v.union(runShape, v.null()) })),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.companyWebsiteId);
    if (!hold || isTrackedHold(hold)) return null;
    const [ready, state, groups] = await Promise.all([
      readiness(ctx, hold.companyId),
      ctx.db.query("autoClassifyRuns").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first(),
      ctx.db.query("pageClassifications").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).take(GROUPS_OFFERED + 100),
    ]);
    return {
      readiness: ready,
      groupsLeftOut: Math.max(0, groups.length - GROUPS_OFFERED),
      run: state
        ? {
          status: state.status,
          total: state.total,
          done: state.done,
          placed: state.placed,
          startedAt: state.startedAt,
          lastStepAt: state.lastStepAt,
          finishedAt: state.finishedAt ?? null,
          stopped: state.stopped ?? null,
        }
        : null,
    };
  },
});

// ── The night's run, and the watch ─────────────────────────────────────────

/** Groups read to find the websites that have any: more than every company's groups together today. */
const GROUPS_SCANNED = 5_000;

/** The company's own websites that have page groups, each once. */
export const websitesWithGroups = internalQuery({
  args: {},
  returns: v.array(v.id("companyWebsites")),
  handler: async (ctx) => {
    const groups = await ctx.db.query("pageClassifications").withIndex("by_hold").take(GROUPS_SCANNED);
    return [...new Set(groups.map((group) => group.companyWebsiteId))];
  },
});

/**
 * The run the schedule or the agent's Run button starts: each website with
 * groups gets a run of its own when it has pages to ask or a group to
 * describe; the rest are named as having nothing to do.
 */
export const runAutoClassifyNow = internalAction({
  args: { runId: v.id("agentRuns"), workflowExecutionId: v.optional(v.id("workflowExecutions")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.roleRuns.markRunStarted, { runId: args.runId });
    const finish = (status: "SUCCESS" | "FAILED", summary: string) =>
      ctx.runMutation(internal.roleRuns.finishRoleRun, { runId: args.runId, ...(args.workflowExecutionId ? { workflowExecutionId: args.workflowExecutionId } : {}), status, summary });
    try {
      const holds: Id<"companyWebsites">[] = await ctx.runQuery(internal.autoClassifyStart.websitesWithGroups, {});
      const outcomes: Record<string, number> = {};
      for (const companyWebsiteId of holds) {
        const outcome: string = await ctx.runMutation(internal.autoClassifyStart.startForWebsite, { companyWebsiteId, night: true });
        outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
      }
      const started = outcomes.STARTED ?? 0;
      await finish("SUCCESS", holds.length === 0
        ? "No website has page groups, so there was nothing to sort."
        : [
          `${count(holds.length, "website has", "websites have")} page groups.`,
          started > 0 ? `${count(started, "run", "runs")} of its own started.` : "None had pages to sort or groups to describe.",
          outcomes.GOING ? `${count(outcomes.GOING, "was", "were")} already sorting.` : "",
          outcomes.DECISION_OFF ? `${count(outcomes.DECISION_OFF, "company has", "companies have")} "Which group is this page in?" switched off.` : "",
        ].filter(Boolean).join(" "));
    } catch (error: unknown) {
      await finish("FAILED", failureSummary(error));
    }
    return null;
  },
});

/** Runs looked at in one watch. */
const STALLED_READ = 20;

/** A website's run whose last step was lost carries on from where it was, saying so on its run. */
export const carryOnStalled = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now();
    const stalled = await ctx.db
      .query("autoClassifyRuns")
      .withIndex("by_status_step", (q) => q.eq("status", "SORTING").lt("lastStepAt", now - AUTO_CLASSIFY_STALL_MS))
      .take(STALLED_READ);
    for (const state of stalled) {
      if (!state.agentRunId) continue;
      await ctx.db.patch(state._id, { lastStepAt: now });
      await writeRunLine(ctx, { runId: state.agentRunId, companyId: state.companyId, heading: "Carried on", detail: "Its last step was lost, so it carries on from where it was.", failed: false });
      await ctx.scheduler.runAfter(0, internal.autoClassifyRun.sortStep, {
        companyWebsiteId: state.companyWebsiteId,
        runId: state.agentRunId,
        ...(state.workflowExecutionId ? { workflowExecutionId: state.workflowExecutionId } : {}),
      });
    }
    return stalled.length;
  },
});

/** Every ten minutes: the agent and its schedule kept there, and any run whose step was lost carried on. */
export const watchAutoClassify = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.runMutation(internal.autoClassifyStart.ensureAutoClassifierInternal, {});
    await ctx.runMutation(internal.autoClassifyStart.carryOnStalled, {});
    return null;
  },
});
