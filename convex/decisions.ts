import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { DECISION_MODEL_USE_CASE } from "./aiModelService";
import { resolveModelConfig } from "./aiModels";
import { getDecision, listDecisions } from "./decisionRegistry";
import { modeWords, resolveDecisionMode, type DecisionMode } from "./decisionService";
import {
  adminMutation,
  adminQuery,
  assertTenantAccess,
  superAdminMutation,
  superAdminQuery,
} from "./tenantFunctions";
import { appError } from "./utils/appError";

/**
 * What the Decisions screens read and write.
 *
 * Two heights, one shape: the platform screen (super-admin) and the company
 * screen (company admin) show the same rows, and the company one adds its own
 * column. Counts are bounded reads over the last seven days, capped and
 * reported as capped, in the `IncompleteFiguresNotice` tradition — a capped
 * figure must never read as a total.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** Rows read per Decision for the weekly counts; at the cap the count is "at least". */
const COUNT_CAP = 2001;
const RECENT_RUNS = 50;

const modeValidator = v.union(v.literal("OFF"), v.literal("ASK_A_PERSON"), v.literal("ACT"));

const decisionRowShape = v.object({
  key: v.string(),
  copyKey: v.string(),
  usedIn: v.string(),
  stakes: v.union(v.literal("LOW"), v.literal("HIGH")),
  platformMode: modeValidator,
  /** Only on the company screen: the company's own row, if it has one. */
  companyMode: v.optional(modeValidator),
  effectiveMode: modeValidator,
  ranThisWeek: v.number(),
  handedThisWeek: v.number(),
  costThisWeekGBP: v.number(),
  isCapped: v.boolean(),
});

/**
 * Whether a Decision that is switched on would reach a model at all.
 *
 * The Decisions job resolves like every other job: its own default, then
 * the platform's default model, then the compiled-in failsafe. Only the
 * failsafe means nothing is configured; the engine then runs the rule.
 */
const providerStateShape = v.object({
  usable: v.boolean(),
  reason: v.optional(v.literal("NO_MODEL")),
});

const overviewShape = v.object({
  decisions: v.array(decisionRowShape),
  provider: providerStateShape,
});

async function providerState(ctx: QueryCtx, companyId?: Id<"companies">) {
  const model = await resolveModelConfig(ctx, { useCase: DECISION_MODEL_USE_CASE, ...(companyId ? { companyId } : {}) });
  return model.source !== "failsafe"
    ? { usable: true }
    : { usable: false, reason: "NO_MODEL" as const };
}

async function weekOfRuns(ctx: QueryCtx, decisionKey: string, companyId: Id<"companies"> | undefined, since: number) {
  if (companyId) {
    return await ctx.db
      .query("decisionRuns")
      .withIndex("by_company_key_created", (q) =>
        q.eq("companyId", companyId).eq("decisionKey", decisionKey).gte("createdAt", since),
      )
      .take(COUNT_CAP);
  }
  return await ctx.db
    .query("decisionRuns")
    .withIndex("by_key_created", (q) => q.eq("decisionKey", decisionKey).gte("createdAt", since))
    .take(COUNT_CAP);
}

async function overview(ctx: QueryCtx, companyId?: Id<"companies">) {
  const since = Date.now() - WEEK_MS;
  const decisions = [];
  for (const definition of listDecisions()) {
    const globalRow = await ctx.db
      .query("decisionSettings")
      .withIndex("by_scope_key", (q) => q.eq("scope", "global").eq("decisionKey", definition.key))
      .first();
    const companyRow = companyId
      ? await ctx.db
          .query("decisionSettings")
          .withIndex("by_company_key", (q) => q.eq("companyId", companyId).eq("decisionKey", definition.key))
          .first()
      : null;
    const platformMode = globalRow?.mode ?? definition.defaultMode;
    const runs = await weekOfRuns(ctx, definition.key, companyId, since);
    const isCapped = runs.length >= COUNT_CAP;
    const counted = isCapped ? runs.slice(0, COUNT_CAP - 1) : runs;
    decisions.push({
      key: definition.key,
      copyKey: definition.copyKey,
      usedIn: definition.usedIn,
      stakes: definition.stakes,
      platformMode,
      ...(companyRow ? { companyMode: companyRow.mode } : {}),
      effectiveMode: resolveDecisionMode({
        companyMode: companyRow?.mode ?? null,
        globalMode: globalRow?.mode ?? null,
        defaultMode: definition.defaultMode,
      }),
      ranThisWeek: counted.length,
      handedThisWeek: counted.filter((run) => run.outcome === "HANDED_TO_PERSON").length,
      costThisWeekGBP: counted.reduce((sum, run) => sum + run.costGBP, 0),
      isCapped,
    });
  }
  return { decisions, provider: await providerState(ctx, companyId) };
}

export const listForPlatform = superAdminQuery({
  args: {},
  returns: overviewShape,
  handler: async (ctx) => await overview(ctx),
});

export const listForCompany = adminQuery({
  args: { companyId: v.id("companies") },
  returns: overviewShape,
  handler: async (ctx, args) => {
    assertTenantAccess(ctx, { companyId: args.companyId });
    return await overview(ctx, args.companyId);
  },
});

function requireDecision(decisionKey: string) {
  const definition = getDecision(decisionKey);
  if (!definition) throw appError("NOT_FOUND", `There is no Decision called '${decisionKey}'.`);
  return definition;
}

/**
 * The trail's own before-and-after shape, so the Change column reads
 * "Mode: Off → Ask a person". A bare `from`/`to` pair is the shape risk
 * changes have always used, and the trail would have called this a risk
 * rating.
 */
function modeChangeMetadata(args: {
  decisionName: string;
  scope: "platform" | "company";
  from: DecisionMode | "FOLLOW_PLATFORM";
  to: DecisionMode | "FOLLOW_PLATFORM";
}) {
  return JSON.stringify({
    decision: args.decisionName,
    scope: args.scope === "platform" ? "whole platform" : "this company",
    changes: [{ field: "mode", from: modeWords(args.from), to: modeWords(args.to) }],
  });
}

export const setPlatformMode = superAdminMutation({
  args: { decisionKey: v.string(), mode: modeValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const definition = requireDecision(args.decisionKey);
    const now = Date.now();
    const existing = await ctx.db
      .query("decisionSettings")
      .withIndex("by_scope_key", (q) => q.eq("scope", "global").eq("decisionKey", args.decisionKey))
      .first();
    const from = existing?.mode ?? definition.defaultMode;
    if (existing) {
      await ctx.db.patch(existing._id, { mode: args.mode, updatedAt: now, updatedBy: ctx.userId });
    } else {
      await ctx.db.insert("decisionSettings", {
        scope: "global",
        decisionKey: args.decisionKey,
        mode: args.mode,
        updatedAt: now,
        updatedBy: ctx.userId,
      });
    }
    if (from !== args.mode) {
      await ctx.db.insert("auditLogs", {
        actorId: ctx.userId,
        actionType: "DECISION_MODE_CHANGED",
        entityType: "decisions",
        entityId: args.decisionKey,
        timestamp: now,
        metadata: modeChangeMetadata({ decisionName: definition.name, scope: "platform", from, to: args.mode }),
      });
    }
    return null;
  },
});

/** A company's own mode, or, with `mode` left out, back to following the platform. */
export const setCompanyMode = adminMutation({
  args: { companyId: v.id("companies"), decisionKey: v.string(), mode: v.optional(modeValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertTenantAccess(ctx, { companyId: args.companyId });
    const definition = requireDecision(args.decisionKey);
    const now = Date.now();
    const existing = await ctx.db
      .query("decisionSettings")
      .withIndex("by_company_key", (q) => q.eq("companyId", args.companyId).eq("decisionKey", args.decisionKey))
      .first();
    const from = existing?.mode ?? "FOLLOW_PLATFORM";
    const to = args.mode ?? "FOLLOW_PLATFORM";

    if (args.mode) {
      if (existing) {
        await ctx.db.patch(existing._id, { mode: args.mode, updatedAt: now, updatedBy: ctx.userId });
      } else {
        await ctx.db.insert("decisionSettings", {
          scope: "company",
          companyId: args.companyId,
          decisionKey: args.decisionKey,
          mode: args.mode,
          updatedAt: now,
          updatedBy: ctx.userId,
        });
      }
    } else if (existing) {
      await ctx.db.delete(existing._id);
    }

    if (from !== to) {
      await ctx.db.insert("auditLogs", {
        actorId: ctx.userId,
        actionType: "DECISION_MODE_CHANGED",
        entityType: "decisions",
        entityId: args.decisionKey,
        companyId: args.companyId,
        timestamp: now,
        metadata: modeChangeMetadata({ decisionName: definition.name, scope: "company", from, to }),
      });
    }
    return null;
  },
});

const runRowShape = v.object({
  id: v.id("decisionRuns"),
  /** Present on the per-run listing, where several Decisions share a table. */
  decisionKey: v.optional(v.string()),
  copyKey: v.optional(v.string()),
  createdAt: v.number(),
  companyId: v.optional(v.id("companies")),
  subjectKind: v.string(),
  subjectId: v.string(),
  answer: v.string(),
  probabilities: v.optional(v.string()),
  certainty: v.optional(v.union(v.literal("SURE"), v.literal("FAIRLY_SURE"), v.literal("NOT_SURE"))),
  mode: modeValidator,
  outcome: v.union(v.literal("ACTED"), v.literal("HANDED_TO_PERSON"), v.literal("RECORDED")),
  source: v.union(v.literal("TYPESAFE"), v.literal("TEXT_MODEL"), v.literal("RULES")),
  fallbackReason: v.optional(v.union(v.literal("MODE_OFF"), v.literal("NO_MODEL"), v.literal("PROVIDER_FAILED"))),
  action: v.optional(v.string()),
  costGBP: v.number(),
});

const detailShape = v.object({
  decision: v.object({
    key: v.string(),
    copyKey: v.string(),
    usedIn: v.string(),
    stakes: v.union(v.literal("LOW"), v.literal("HIGH")),
    /** The question exactly as the model receives it, serialised for display. */
    question: v.string(),
    /** The answers it can give, in the order the registry lists them. */
    answers: v.array(v.string()),
    effectiveMode: modeValidator,
  }),
  runs: v.array(runRowShape),
  ranThisWeek: v.number(),
  handedThisWeek: v.number(),
  costThisWeekGBP: v.number(),
  isCapped: v.boolean(),
  provider: providerStateShape,
});

async function detail(ctx: QueryCtx, decisionKey: string, companyId?: Id<"companies">) {
  const definition = requireDecision(decisionKey);
  const since = Date.now() - WEEK_MS;
  const week = await weekOfRuns(ctx, decisionKey, companyId, since);
  const isCapped = week.length >= COUNT_CAP;
  const counted = isCapped ? week.slice(0, COUNT_CAP - 1) : week;

  const recent = companyId
    ? await ctx.db
        .query("decisionRuns")
        .withIndex("by_company_key_created", (q) => q.eq("companyId", companyId).eq("decisionKey", decisionKey))
        .order("desc")
        .take(RECENT_RUNS)
    : await ctx.db
        .query("decisionRuns")
        .withIndex("by_key_created", (q) => q.eq("decisionKey", decisionKey))
        .order("desc")
        .take(RECENT_RUNS);

  const globalRow = await ctx.db
    .query("decisionSettings")
    .withIndex("by_scope_key", (q) => q.eq("scope", "global").eq("decisionKey", decisionKey))
    .first();
  const companyRow = companyId
    ? await ctx.db
        .query("decisionSettings")
        .withIndex("by_company_key", (q) => q.eq("companyId", companyId).eq("decisionKey", decisionKey))
        .first()
    : null;

  const question = definition.question;
  const answers =
    question.type === "noul" ? ["yes", "no"]
    : question.type === "choice" ? Object.keys(question.criteria)
    : question.criteria.map((_level, index) => String(index));

  return {
    decision: {
      key: definition.key,
      copyKey: definition.copyKey,
      usedIn: definition.usedIn,
      stakes: definition.stakes,
      question: JSON.stringify(question, null, 2),
      answers,
      effectiveMode: resolveDecisionMode({
        companyMode: companyRow?.mode ?? null,
        globalMode: globalRow?.mode ?? null,
        defaultMode: definition.defaultMode,
      }),
    },
    runs: recent.map((run) => ({
      id: run._id,
      createdAt: run.createdAt,
      ...(run.companyId ? { companyId: run.companyId } : {}),
      subjectKind: run.subjectKind,
      subjectId: run.subjectId,
      answer: run.answer,
      ...(run.probabilities ? { probabilities: run.probabilities } : {}),
      ...(run.certainty ? { certainty: run.certainty } : {}),
      mode: run.mode,
      outcome: run.outcome,
      source: run.source,
      ...(run.fallbackReason ? { fallbackReason: run.fallbackReason } : {}),
      ...(run.action ? { action: run.action } : {}),
      costGBP: run.costGBP,
    })),
    ranThisWeek: counted.length,
    handedThisWeek: counted.filter((run) => run.outcome === "HANDED_TO_PERSON").length,
    costThisWeekGBP: counted.reduce((sum, run) => sum + run.costGBP, 0),
    isCapped,
    provider: await providerState(ctx, companyId),
  };
}

export const detailForPlatform = superAdminQuery({
  args: { decisionKey: v.string() },
  returns: detailShape,
  handler: async (ctx, args) => await detail(ctx, args.decisionKey),
});

export const detailForCompany = adminQuery({
  args: { companyId: v.id("companies"), decisionKey: v.string() },
  returns: detailShape,
  handler: async (ctx, args) => {
    assertTenantAccess(ctx, { companyId: args.companyId });
    return await detail(ctx, args.decisionKey, args.companyId);
  },
});

/**
 * The Decision runs filed under one agent run, for the run's page
 * (decisions-typesafe-plan.md, Phase E). A platform run is a super-admin's
 * to read; a company's run is its admins'.
 */
export const listForRun = adminQuery({
  args: { runId: v.id("agentRuns") },
  returns: v.array(runRowShape),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    assertTenantAccess(ctx, run ? { companyId: run.companyId } : null);
    const rows = await ctx.db
      .query("decisionRuns")
      .withIndex("by_agent_run", (q) => q.eq("agentRunId", args.runId))
      .take(RECENT_RUNS);
    return rows.map((run) => ({
      id: run._id,
      createdAt: run.createdAt,
      ...(run.companyId ? { companyId: run.companyId } : {}),
      subjectKind: run.subjectKind,
      subjectId: run.subjectId,
      answer: run.answer,
      ...(run.probabilities ? { probabilities: run.probabilities } : {}),
      ...(run.certainty ? { certainty: run.certainty } : {}),
      mode: run.mode,
      outcome: run.outcome,
      source: run.source,
      ...(run.fallbackReason ? { fallbackReason: run.fallbackReason } : {}),
      ...(run.action ? { action: run.action } : {}),
      costGBP: run.costGBP,
      decisionKey: run.decisionKey,
      copyKey: getDecision(run.decisionKey)?.copyKey ?? run.decisionKey,
    }));
  },
});

/** Runs read per agent for the overview block; at the cap the figures are "at least". */
const AGENT_RUNS_FOR_SUMMARY = 50;

/**
 * How an agent's Decisions went over the window, for its Overview block:
 * the runs filed under its recent agent runs, counted by outcome.
 */
export const summaryForAgent = adminQuery({
  args: { agentId: v.id("agents"), lookbackDays: v.number() },
  returns: v.object({
    ran: v.number(),
    acted: v.number(),
    handed: v.number(),
    onRules: v.number(),
    costGBP: v.number(),
    isPartial: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const since = Date.now() - Math.max(1, args.lookbackDays) * 24 * 60 * 60 * 1000;
    // Agents are shared across companies; their runs are not. A company
    // admin counts only the runs filed under their own company; the
    // platform-wide role counts them all (review, 2026-09-18).
    const isPlatformWide = ctx.user.role === "SUPER_ADMIN";
    const ownCompanyId = ctx.companyId;
    const agentRuns = (await ctx.db
      .query("agentRuns")
      .withIndex("by_agent_started", (q) => q.eq("agentId", args.agentId).gte("startedAt", since))
      .order("desc")
      .take(AGENT_RUNS_FOR_SUMMARY))
      .filter((run) => isPlatformWide || (ownCompanyId !== undefined && run.companyId === ownCompanyId));
    let ran = 0;
    let acted = 0;
    let handed = 0;
    let onRules = 0;
    let costGBP = 0;
    for (const run of agentRuns) {
      const rows = await ctx.db
        .query("decisionRuns")
        .withIndex("by_agent_run", (q) => q.eq("agentRunId", run._id))
        .take(RECENT_RUNS);
      for (const row of rows) {
        ran += 1;
        if (row.outcome === "ACTED") acted += 1;
        if (row.outcome === "HANDED_TO_PERSON") handed += 1;
        if (row.source === "RULES") onRules += 1;
        costGBP += row.costGBP;
      }
    }
    return { ran, acted, handed, onRules, costGBP, isPartial: agentRuns.length >= AGENT_RUNS_FOR_SUMMARY };
  },
});
