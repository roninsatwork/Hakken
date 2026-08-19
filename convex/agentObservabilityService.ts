/**
 * The numbers behind the agent observability screens.
 *
 * The agent analytics query reported lifetime totals and a mean latency. Neither
 * answers the question somebody actually opens the screen with — "is this worse
 * than last week?" — and the mean in particular hides the complaint: the run in
 * twenty that takes thirty seconds is the one people notice, and a mean over a
 * thousand fast runs buries it completely.
 *
 * Kept out of `agentRuns.ts` so the arithmetic can be tested against a
 * hand-computed sample rather than trusted because a query returned something.
 *
 * The two big read paths — the per-agent analytics and the platform run
 * observatory — live here too, as plain functions over a tenant query context.
 * Their query declarations stay in `agentRuns.ts` so the api paths the screens
 * call do not move.
 */

import type { TenantQueryCtx } from "./tenantFunctions";
import type { Doc, Id } from "./_generated/dataModel";
import { buildFailureKey } from "./agentFailureKeyService";

const DAY_MS = 24 * 60 * 60 * 1000;

const AGENT_RUN_ANALYTICS_LIMIT = 500;

/** How many rows the overview's ranked lists return. The screen shows five. */
const OVERVIEW_LIST_LIMIT = 8;
const RUN_OBSERVATORY_LIMIT = 120;
const RUN_OBSERVATORY_TOOL_LIMIT = 300;

/** The shape these functions need from a run, structurally — not the whole record. */
export type ObservabilityRun = {
  status: string;
  startedAt: number;
  completedAt?: number;
  costGBP?: number;
  error?: string;
  finalOutput?: string;
  agentVersionId?: string;
};

export type LatencySummary = {
  /** What a run usually takes. */
  medianMs: number;
  /** What the slowest one in twenty takes. */
  p95Ms: number;
  averageMs: number;
  sampleSize: number;
};

/**
 * Nearest-rank percentile. Chosen over interpolation because these are shown as
 * "1 in 20 takes over 31s" — a real observed run, not a number between two of
 * them that nobody ever waited for.
 */
export function percentile(values: ReadonlyArray<number>, p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.ceil((p / 100) * sorted.length);
  const index = Math.min(Math.max(rank - 1, 0), sorted.length - 1);
  return sorted[index];
}

export function summariseLatency(values: ReadonlyArray<number>): LatencySummary {
  if (values.length === 0) {
    return { medianMs: 0, p95Ms: 0, averageMs: 0, sampleSize: 0 };
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    medianMs: percentile(values, 50),
    p95Ms: percentile(values, 95),
    averageMs: total / values.length,
    sampleSize: values.length,
  };
}

export type DayBucket = {
  /** Midnight UTC for the day, so the screen can format it in the reader's locale. */
  dayStartMs: number;
  total: number;
  succeeded: number;
  failed: number;
  costGBP: number;
};

function startOfUtcDay(timestamp: number): number {
  return Math.floor(timestamp / DAY_MS) * DAY_MS;
}

/**
 * One bucket per day, including days where nothing ran.
 *
 * The empty days matter: a chart that silently omits them draws a quiet weekend
 * as though it were continuous weekday traffic, and the shape is the whole point
 * of the chart.
 */
export function buildDailySeries(
  runs: ReadonlyArray<ObservabilityRun>,
  options: { days: number; now: number }
): DayBucket[] {
  const todayStart = startOfUtcDay(options.now);
  const buckets = new Map<number, DayBucket>();

  for (let offset = options.days - 1; offset >= 0; offset -= 1) {
    const dayStartMs = todayStart - offset * DAY_MS;
    buckets.set(dayStartMs, { dayStartMs, total: 0, succeeded: 0, failed: 0, costGBP: 0 });
  }

  for (const run of runs) {
    const bucket = buckets.get(startOfUtcDay(run.startedAt));
    if (!bucket) continue;
    bucket.total += 1;
    bucket.costGBP += run.costGBP ?? 0;
    if (run.status === "SUCCESS") bucket.succeeded += 1;
    if (run.status === "FAILED" || run.status === "CANCELLED") bucket.failed += 1;
  }

  return [...buckets.values()].sort((left, right) => left.dayStartMs - right.dayStartMs);
}

/**
 * The days on which this agent started running a different configuration.
 *
 * Taken from the runs themselves rather than from when a version row was
 * written, because what the chart is being asked is "did the shape change when
 * the agent did" — and that is the day the new configuration first carried
 * traffic, which is not always the day somebody saved it.
 */
export function findVersionChangeDays(runs: ReadonlyArray<ObservabilityRun>): number[] {
  const ordered = [...runs].sort((left, right) => left.startedAt - right.startedAt);
  const days = new Set<number>();
  let previousVersion: string | undefined;
  let seenFirst = false;

  for (const run of ordered) {
    const version = run.agentVersionId ?? "unversioned";
    // The first run in the window is not a change: there is nothing before it
    // to have changed from, and marking it would put a marker on day one of
    // every chart.
    if (seenFirst && version !== previousVersion) {
      days.add(startOfUtcDay(run.startedAt));
    }
    previousVersion = version;
    seenFirst = true;
  }

  return [...days].sort((left, right) => left - right);
}

export type PeriodTotals = {
  runs: number;
  succeeded: number;
  failed: number;
  costGBP: number;
  successRate: number;
  costPerRunGBP: number;
};

export function summarisePeriod(runs: ReadonlyArray<ObservabilityRun>): PeriodTotals {
  let succeeded = 0;
  let failed = 0;
  let costGBP = 0;

  for (const run of runs) {
    if (run.status === "SUCCESS") succeeded += 1;
    if (run.status === "FAILED" || run.status === "CANCELLED") failed += 1;
    costGBP += run.costGBP ?? 0;
  }

  const settled = succeeded + failed;
  return {
    runs: runs.length,
    succeeded,
    failed,
    costGBP,
    successRate: settled > 0 ? succeeded / settled : 0,
    costPerRunGBP: runs.length > 0 ? costGBP / runs.length : 0,
  };
}

/**
 * Split a sample into the window being reported and the one before it, so every
 * headline number can carry a change rather than standing alone.
 */
export function splitByPeriod(
  runs: ReadonlyArray<ObservabilityRun>,
  options: { days: number; now: number }
): { current: ObservabilityRun[]; previous: ObservabilityRun[] } {
  const windowMs = options.days * DAY_MS;
  const currentFrom = options.now - windowMs;
  const previousFrom = currentFrom - windowMs;

  const current: ObservabilityRun[] = [];
  const previous: ObservabilityRun[] = [];

  for (const run of runs) {
    if (run.startedAt >= currentFrom) current.push(run);
    else if (run.startedAt >= previousFrom) previous.push(run);
  }

  return { current, previous };
}

export type FailureGroupInput = {
  failureKey: string;
  message: string;
  at: number;
  runId?: string;
};

export type FailureGroup = {
  failureKey: string;
  label: string;
  count: number;
  firstSeenAt: number;
  lastSeenAt: number;
  runIds: string[];
};

/** How many example runs a group carries, so one noisy failure cannot bloat the payload. */
const MAX_EXAMPLE_RUNS = 20;

/**
 * Failures grouped by cause rather than by wording, worst first.
 *
 * The label shown is the shortest message in the group: the one least likely to
 * be carrying an id or a stack fragment that applies to only one occurrence.
 */
export function groupFailures(entries: ReadonlyArray<FailureGroupInput>): FailureGroup[] {
  const groups = new Map<string, FailureGroup & { messages: string[] }>();

  for (const entry of entries) {
    const existing = groups.get(entry.failureKey);
    if (!existing) {
      groups.set(entry.failureKey, {
        failureKey: entry.failureKey,
        label: entry.message,
        count: 1,
        firstSeenAt: entry.at,
        lastSeenAt: entry.at,
        runIds: entry.runId ? [entry.runId] : [],
        messages: [entry.message],
      });
      continue;
    }

    existing.count += 1;
    existing.firstSeenAt = Math.min(existing.firstSeenAt, entry.at);
    existing.lastSeenAt = Math.max(existing.lastSeenAt, entry.at);
    existing.messages.push(entry.message);
    if (entry.runId && existing.runIds.length < MAX_EXAMPLE_RUNS) {
      existing.runIds.push(entry.runId);
    }
  }

  return [...groups.values()]
    .map(({ messages, ...group }) => ({
      ...group,
      label: pickShortest(messages) ?? group.label,
    }))
    .sort((left, right) => right.count - left.count || right.lastSeenAt - left.lastSeenAt);
}

function pickShortest(messages: ReadonlyArray<string>): string | undefined {
  let shortest: string | undefined;
  for (const message of messages) {
    const trimmed = message.trim();
    if (!trimmed) continue;
    if (shortest === undefined || trimmed.length < shortest.length) shortest = trimmed;
  }
  return shortest;
}

export function getRunLatencyMs(run: { startedAt: number; completedAt?: number }) {
  return run.completedAt !== undefined ? Math.max(0, run.completedAt - run.startedAt) : undefined;
}

function incrementCount(target: Record<string, number>, key: string, increment = 1) {
  target[key] = (target[key] ?? 0) + increment;
}

function buildEmptyRunObservatoryStatusCounts() {
  return {
    QUEUED: 0,
    RUNNING: 0,
    PENDING_APPROVAL: 0,
    SUCCESS: 0,
    FAILED: 0,
    CANCELLED: 0,
  };
}

function getRunObservabilityAction(run: Doc<"agentRuns">) {
  if (run.status === "FAILED" || run.status === "CANCELLED") {
    return "Open the run timeline, inspect failed steps, and convert the failure into an eval fixture if it should never repeat.";
  }
  if (run.status === "PENDING_APPROVAL") {
    return "Review the pending approval before the agent continues.";
  }
  if (run.status === "RUNNING" || run.status === "QUEUED") {
    return "Check whether the run is still progressing or should be cancelled.";
  }
  return "Monitor for drift and compare with future replays if behavior changes.";
}

/** The handler behind `api.agentRuns.getAnalyticsForAgent`, unchanged in shape. */
export async function readAgentAnalytics(
  ctx: TenantQueryCtx,
  args: {
    agentId: Id<"agents">;
    /** The window the headline numbers report on, compared against the one before it. */
    lookbackDays?: number;
  },
) {
  const { user } = ctx;
  if (user.role === "ADMIN" && !user.companyId) {
    throw new Error("Unauthorized");
  }
  const visibleCompanyId = user.role === "ADMIN" ? user.companyId : undefined;
  const lookbackDays = Math.min(Math.max(args.lookbackDays ?? 7, 1), 90);

  // Two windows are read, not one: the period being reported and the period
  // before it, because every headline number is shown against its own past.
  const windowStart = Date.now() - 2 * lookbackDays * DAY_MS;

  const runs = user.role === "SUPER_ADMIN"
    ? await ctx.db
        .query("agentRuns")
        // Ranged on the index rather than filtered after the fact, so a busy
        // agent's whole history is not read to report on one week of it.
        .withIndex("by_agent_started", (q) =>
          q.eq("agentId", args.agentId).gte("startedAt", windowStart)
        )
        .order("desc")
        .take(AGENT_RUN_ANALYTICS_LIMIT)
    : await ctx.db
        .query("agentRuns")
        .withIndex("by_company_started", (q) =>
          q.eq("companyId", visibleCompanyId).gte("startedAt", windowStart)
        )
        .filter((q) => q.eq(q.field("agentId"), args.agentId))
        .order("desc")
        .take(AGENT_RUN_ANALYTICS_LIMIT);

  const toolCalls = user.role === "SUPER_ADMIN"
    ? await ctx.db
        .query("agentToolCalls")
        .withIndex("by_agent_started", (q) =>
          q.eq("agentId", args.agentId).gte("startedAt", windowStart)
        )
        .order("desc")
        .take(AGENT_RUN_ANALYTICS_LIMIT)
    : await ctx.db
        .query("agentToolCalls")
        .withIndex("by_company_started", (q) =>
          q.eq("companyId", visibleCompanyId).gte("startedAt", windowStart)
        )
        .filter((q) => q.eq(q.field("agentId"), args.agentId))
        .order("desc")
        .take(AGENT_RUN_ANALYTICS_LIMIT);

  const approvals = user.role === "SUPER_ADMIN"
    ? await ctx.db
        .query("agentRunApprovals")
        .withIndex("by_agent_requested", (q) => q.eq("agentId", args.agentId))
        .order("desc")
        .take(AGENT_RUN_ANALYTICS_LIMIT)
    : (
        await Promise.all(
          (["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const).map((status) =>
            ctx.db
              .query("agentRunApprovals")
              .withIndex("by_company_status_requested", (q) => q.eq("companyId", visibleCompanyId).eq("status", status))
              .filter((q) => q.eq(q.field("agentId"), args.agentId))
              .order("desc")
              .take(AGENT_RUN_ANALYTICS_LIMIT)
          )
        )
      ).flat().sort((a, b) => b.requestedAt - a.requestedAt).slice(0, AGENT_RUN_ANALYTICS_LIMIT);
  const feedback = user.role === "SUPER_ADMIN"
    ? await ctx.db
        .query("agentRunFeedback")
        .withIndex("by_agent_created", (q) => q.eq("agentId", args.agentId))
        .order("desc")
        .take(AGENT_RUN_ANALYTICS_LIMIT)
    : await ctx.db
        .query("agentRunFeedback")
        .withIndex("by_company_created", (q) => q.eq("companyId", visibleCompanyId))
        .filter((q) => q.eq(q.field("agentId"), args.agentId))
        .order("desc")
        .take(AGENT_RUN_ANALYTICS_LIMIT);

  const statusCounts: Record<string, number> = {
    QUEUED: 0,
    RUNNING: 0,
    PENDING_APPROVAL: 0,
    SUCCESS: 0,
    FAILED: 0,
    CANCELLED: 0,
  };
  const triggerCounts: Record<string, number> = {};
  const failureReasons: Record<string, number> = {};
  const modelStats: Record<string, {
    modelId: string;
    providerKey?: string;
    providerModelId?: string;
    runs: number;
    failures: number;
    costGBP: number;
  }> = {};
  const versionStats: Record<string, {
    agentVersionId: Id<"agentVersions"> | "unversioned";
    runs: number;
    successes: number;
    failures: number;
    costGBP: number;
  }> = {};
  let totalCostGBP = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let completedLatencyTotalMs = 0;
  let completedLatencyCount = 0;
  const latencies: number[] = [];
  const failureEntries: FailureGroupInput[] = [];

  for (const run of runs) {
    incrementCount(statusCounts, run.status);
    incrementCount(triggerCounts, run.triggerType);
    totalCostGBP += run.costGBP ?? 0;
    totalInputTokens += run.inputTokens ?? 0;
    totalOutputTokens += run.outputTokens ?? 0;

    const latencyMs = getRunLatencyMs(run);
    if (latencyMs !== undefined) {
      completedLatencyTotalMs += latencyMs;
      completedLatencyCount += 1;
      latencies.push(latencyMs);
    }

    if (run.status === "FAILED" || run.status === "CANCELLED") {
      const message = run.error || run.finalOutput || run.status;
      incrementCount(failureReasons, message);
      // Grouped on the normalised key rather than the message, so the same
      // fault does not split across rows because one occurrence happened to
      // carry a duration or a run id.
      failureEntries.push({
        failureKey: buildFailureKey(message) ?? run.status,
        message,
        at: run.startedAt,
        runId: run._id,
      });
    }

    const modelKey = run.modelId || run.providerModelId || "unresolved";
    if (!modelStats[modelKey]) {
      modelStats[modelKey] = {
        modelId: run.modelId || "unresolved",
        providerKey: run.providerKey,
        providerModelId: run.providerModelId,
        runs: 0,
        failures: 0,
        costGBP: 0,
      };
    }
    modelStats[modelKey].runs += 1;
    modelStats[modelKey].costGBP += run.costGBP ?? 0;
    if (run.status === "FAILED" || run.status === "CANCELLED") {
      modelStats[modelKey].failures += 1;
    }

    const versionKey = run.agentVersionId || "unversioned";
    if (!versionStats[versionKey]) {
      versionStats[versionKey] = {
        agentVersionId: versionKey,
        runs: 0,
        successes: 0,
        failures: 0,
        costGBP: 0,
      };
    }
    versionStats[versionKey].runs += 1;
    versionStats[versionKey].costGBP += run.costGBP ?? 0;
    if (run.status === "SUCCESS") versionStats[versionKey].successes += 1;
    if (run.status === "FAILED" || run.status === "CANCELLED") versionStats[versionKey].failures += 1;
  }

  const toolStats: Record<string, {
    handlerMapping: string;
    calls: number;
    successes: number;
    failures: number;
    approvalsRequired: number;
    denied: number;
    cancelled: number;
    notImplemented: number;
    /** How long this tool usually takes — the column that shows which one is slow. */
    typicalMs: number;
    durations: number[];
  }> = {};
  for (const toolCall of toolCalls) {
    const key = toolCall.handlerMapping;
    if (!toolStats[key]) {
      toolStats[key] = {
        handlerMapping: key,
        calls: 0,
        successes: 0,
        failures: 0,
        approvalsRequired: 0,
        denied: 0,
        cancelled: 0,
        notImplemented: 0,
        typicalMs: 0,
        durations: [],
      };
    }
    if (toolCall.completedAt !== undefined) {
      toolStats[key].durations.push(toolCall.completedAt - toolCall.startedAt);
    }
    toolStats[key].calls += 1;
    if (toolCall.status === "SUCCESS") toolStats[key].successes += 1;
    if (toolCall.status === "FAILED") toolStats[key].failures += 1;
    // Counted on its own line. Folding it into failures would say the
    // connector is broken; folding it into successes is what the runtime used
    // to do. It is neither — the capability does not exist.
    if (toolCall.status === "NOT_IMPLEMENTED") toolStats[key].notImplemented += 1;
    if (toolCall.status === "APPROVAL_REQUIRED") toolStats[key].approvalsRequired += 1;
    if (toolCall.status === "DENIED") toolStats[key].denied += 1;
    if (toolCall.status === "CANCELLED") toolStats[key].cancelled += 1;
  }

  const approvalCounts: Record<string, number> = {
    PENDING: 0,
    APPROVED: 0,
    REJECTED: 0,
    CANCELLED: 0,
  };
  for (const approval of approvals) {
    incrementCount(approvalCounts, approval.status);
  }

  const feedbackCounts: Record<string, number> = {
    POSITIVE: 0,
    NEGATIVE: 0,
    NEUTRAL: 0,
  };
  const feedbackLabelCounts: Record<string, number> = {};
  for (const entry of feedback) {
    incrementCount(feedbackCounts, entry.rating);
    for (const label of entry.labels) {
      incrementCount(feedbackLabelCounts, label);
    }
  }

  const successfulRuns = statusCounts.SUCCESS ?? 0;
  const failedRuns = (statusCounts.FAILED ?? 0) + (statusCounts.CANCELLED ?? 0);
  const completedRuns = successfulRuns + failedRuns;
  const feedbackTotal = feedback.length;
  const positiveFeedback = feedbackCounts.POSITIVE ?? 0;

  const now = Date.now();
  const periods = splitByPeriod(runs, { days: lookbackDays, now });
  const latency = summariseLatency(latencies);
  const failureGroups = groupFailures(failureEntries);

  return {
    sampledRuns: runs.length,
    sampledToolCalls: toolCalls.length,
    sampledApprovals: approvals.length,
    sampledFeedback: feedback.length,
    totals: {
      runs: runs.length,
      successfulRuns,
      failedRuns,
      activeRuns: (statusCounts.QUEUED ?? 0) + (statusCounts.RUNNING ?? 0) + (statusCounts.PENDING_APPROVAL ?? 0),
      toolCalls: toolCalls.length,
      approvals: approvals.length,
      feedback: feedback.length,
      costGBP: totalCostGBP,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      successRate: completedRuns > 0 ? successfulRuns / completedRuns : 0,
      positiveFeedbackRate: feedbackTotal > 0 ? positiveFeedback / feedbackTotal : 0,
      averageLatencyMs: completedLatencyCount > 0 ? completedLatencyTotalMs / completedLatencyCount : 0,
    },
    lookbackDays,
    // What a run usually takes, and what the slow tail looks like. The mean is
    // kept alongside because the existing screens read it, but nothing new
    // should: it is the figure that hid the slow tail in the first place.
    latency,
    dailySeries: buildDailySeries(runs, { days: lookbackDays, now }),
    versionChangeDays: findVersionChangeDays(runs),
    // Each headline number against the same span immediately before it, which
    // is what turns a total into "better or worse than last week".
    comparison: {
      current: summarisePeriod(periods.current),
      previous: summarisePeriod(periods.previous),
    },
    // The sample is capped, so a very busy agent's window can be cut short.
    // Said plainly rather than left for the reader to infer from a number that
    // stops moving.
    sampleTruncated: runs.length >= AGENT_RUN_ANALYTICS_LIMIT,
    failureGroups: failureGroups.slice(0, OVERVIEW_LIST_LIMIT),
    failureGroupsOmitted: Math.max(0, failureGroups.length - OVERVIEW_LIST_LIMIT),
    statusCounts,
    triggerCounts,
    approvalCounts,
    feedbackCounts,
    feedbackLabelCounts: Object.entries(feedbackLabelCounts)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
    modelStats: Object.values(modelStats).sort((a, b) => b.runs - a.runs),
    versionStats: Object.values(versionStats).sort((a, b) => b.runs - a.runs),
    // The middle call rather than the mean: one tool call that hung for a
    // minute would otherwise make an ordinarily fast tool look slow.
    toolStats: Object.values(toolStats)
      .map(({ durations, ...tool }) => ({ ...tool, typicalMs: percentile(durations, 50) }))
      .sort((a, b) => b.calls - a.calls)
      .slice(0, OVERVIEW_LIST_LIMIT),
    // Same shape as before so the existing screen keeps working, but derived
    // from the grouped failures: two wordings of one fault are now one row.
    failureReasons: failureGroups
      .slice(0, 5)
      .map((group) => ({ reason: group.label, count: group.count })),
    recentFailures: runs
      .filter((run) => run.status === "FAILED" || run.status === "CANCELLED")
      .slice(0, 5)
      .map((run) => ({
        runId: run._id,
        status: run.status,
        objective: run.objective,
        error: run.error || run.finalOutput,
        startedAt: run.startedAt,
      })),
  };
}

/** The handler behind `api.agentRuns.getRunObservatory`, unchanged in shape. */
export async function readRunObservatory(
  ctx: TenantQueryCtx,
  args: {
    lookbackDays?: number;
    limit?: number;
  },
) {
  const { user } = ctx;
  if (user.role === "ADMIN" && !user.companyId) {
    throw new Error("Unauthorized");
  }

  const limit = Math.min(Math.max(args.limit ?? RUN_OBSERVATORY_LIMIT, 1), RUN_OBSERVATORY_LIMIT);
  const lookbackDays = Math.min(Math.max(args.lookbackDays ?? 7, 1), 90);
  const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;

  const recentRuns = user.role === "SUPER_ADMIN"
    ? (await Promise.all(
        (["QUEUED", "RUNNING", "PENDING_APPROVAL", "SUCCESS", "FAILED", "CANCELLED"] as const).map((status) =>
          ctx.db
            .query("agentRuns")
            .withIndex("by_status_started", (q) => q.eq("status", status))
            .order("desc")
            .take(limit)
        )
      ))
        .flat()
        .filter((run) => run.startedAt >= cutoff)
        .toSorted((left, right) => right.startedAt - left.startedAt)
        .slice(0, limit)
    : await ctx.db
        .query("agentRuns")
        .withIndex("by_company_started", (q) => q.eq("companyId", user.companyId))
        .order("desc")
        .filter((q) => q.gte(q.field("startedAt"), cutoff))
        .take(limit);

  const statusCounts = buildEmptyRunObservatoryStatusCounts();
  const triggerCounts: Record<string, number> = {};
  const modelCounts: Record<string, { modelId: string; providerKey?: string; runs: number; failures: number; costGBP: number }> = {};
  const agentCounts: Record<string, { agentId: Id<"agents">; agentName: string; runs: number; failures: number; costGBP: number; lastRunAt: number }> = {};
  const failureReasons: Record<string, number> = {};
  let totalCostGBP = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let completedLatencyTotalMs = 0;
  let completedLatencyCount = 0;

  const agentIds = Array.from(new Set(recentRuns.map((run) => run.agentId)));
  const agents = await Promise.all(agentIds.map(async (agentId) => await ctx.db.get(agentId)));
  const agentNameById = new Map(agentIds.map((agentId, index) => [
    agentId,
    agents[index]?.name ?? "Unknown agent",
  ]));

  for (const run of recentRuns) {
    statusCounts[run.status] += 1;
    incrementCount(triggerCounts, run.triggerType);
    totalCostGBP += run.costGBP ?? 0;
    totalInputTokens += run.inputTokens ?? 0;
    totalOutputTokens += run.outputTokens ?? 0;

    const latencyMs = getRunLatencyMs(run);
    if (latencyMs !== undefined) {
      completedLatencyTotalMs += latencyMs;
      completedLatencyCount += 1;
    }

    if (run.status === "FAILED" || run.status === "CANCELLED") {
      incrementCount(failureReasons, run.error || run.finalOutput || run.status);
    }

    const modelKey = run.modelId || run.providerModelId || "unresolved";
    if (!modelCounts[modelKey]) {
      modelCounts[modelKey] = {
        modelId: modelKey,
        providerKey: run.providerKey,
        runs: 0,
        failures: 0,
        costGBP: 0,
      };
    }
    modelCounts[modelKey].runs += 1;
    modelCounts[modelKey].costGBP += run.costGBP ?? 0;
    if (run.status === "FAILED" || run.status === "CANCELLED") modelCounts[modelKey].failures += 1;

    const agentKey = run.agentId;
    if (!agentCounts[agentKey]) {
      agentCounts[agentKey] = {
        agentId: run.agentId,
        agentName: agentNameById.get(run.agentId) ?? "Unknown agent",
        runs: 0,
        failures: 0,
        costGBP: 0,
        lastRunAt: run.startedAt,
      };
    }
    agentCounts[agentKey].runs += 1;
    agentCounts[agentKey].costGBP += run.costGBP ?? 0;
    agentCounts[agentKey].lastRunAt = Math.max(agentCounts[agentKey].lastRunAt, run.startedAt);
    if (run.status === "FAILED" || run.status === "CANCELLED") agentCounts[agentKey].failures += 1;
  }

  const sampledToolCalls = (await Promise.all(recentRuns.slice(0, 60).map(async (run) =>
    await ctx.db
      .query("agentToolCalls")
      .withIndex("by_run_started", (q) => q.eq("runId", run._id))
      .order("desc")
      .take(20)
  ))).flat().slice(0, RUN_OBSERVATORY_TOOL_LIMIT);
  const toolStats: Record<string, {
    handlerMapping: string;
    calls: number;
    failures: number;
    approvalsRequired: number;
    denied: number;
    notImplemented: number;
    writeOrExternal: number;
  }> = {};
  for (const toolCall of sampledToolCalls) {
    if (user.role === "ADMIN" && toolCall.companyId !== user.companyId) continue;
    const key = toolCall.handlerMapping;
    if (!toolStats[key]) {
      toolStats[key] = {
        handlerMapping: key,
        calls: 0,
        failures: 0,
        approvalsRequired: 0,
        denied: 0,
        notImplemented: 0,
        writeOrExternal: 0,
      };
    }
    toolStats[key].calls += 1;
    if (toolCall.status === "FAILED" || toolCall.status === "CANCELLED") toolStats[key].failures += 1;
    if (toolCall.status === "NOT_IMPLEMENTED") toolStats[key].notImplemented += 1;
    if (toolCall.status === "APPROVAL_REQUIRED") toolStats[key].approvalsRequired += 1;
    if (toolCall.status === "DENIED") toolStats[key].denied += 1;
    if (toolCall.sideEffectLevel === "WRITE" || toolCall.sideEffectLevel === "DESTRUCTIVE" || toolCall.sideEffectLevel === "EXTERNAL") {
      toolStats[key].writeOrExternal += 1;
    }
  }

  const successfulRuns = statusCounts.SUCCESS;
  const failedRuns = statusCounts.FAILED + statusCounts.CANCELLED;
  const activeRuns = statusCounts.QUEUED + statusCounts.RUNNING + statusCounts.PENDING_APPROVAL;
  const completedRuns = successfulRuns + failedRuns;

  return {
    scope: user.role === "SUPER_ADMIN" ? "platform" : "company",
    lookbackDays,
    sampledRuns: recentRuns.length,
    sampledToolCalls: sampledToolCalls.length,
    totals: {
      runs: recentRuns.length,
      successfulRuns,
      failedRuns,
      activeRuns,
      costGBP: totalCostGBP,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      successRate: completedRuns > 0 ? successfulRuns / completedRuns : 0,
      averageLatencyMs: completedLatencyCount > 0 ? completedLatencyTotalMs / completedLatencyCount : 0,
    },
    statusCounts,
    triggerCounts,
    modelStats: Object.values(modelCounts).sort((a, b) => b.runs - a.runs).slice(0, 8),
    agentStats: Object.values(agentCounts).sort((a, b) => b.failures - a.failures || b.runs - a.runs).slice(0, 8),
    toolStats: Object.values(toolStats).sort((a, b) => b.failures - a.failures || b.calls - a.calls).slice(0, 8),
    failureReasons: Object.entries(failureReasons)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    recentRuns: recentRuns.slice(0, 12).map((run) => ({
      runId: run._id,
      agentId: run.agentId,
      agentName: agentNameById.get(run.agentId) ?? "Unknown agent",
      status: run.status,
      triggerType: run.triggerType,
      objective: run.objective,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      latencyMs: getRunLatencyMs(run),
      costGBP: run.costGBP,
      modelId: run.modelId || run.providerModelId,
      error: run.error || (run.status === "FAILED" || run.status === "CANCELLED" ? run.finalOutput : undefined),
      nextAction: getRunObservabilityAction(run),
    })),
  };
}
