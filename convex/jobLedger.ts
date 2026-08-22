import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { adminQuery } from "./tenantFunctions";
import { getErrorMessage } from "./utils/lang";
import { appError } from "./utils/appError";


/**
 * The scheduled work, on the record (seven-gaps plan, phase 2).
 *
 * Twenty-three jobs keep this platform alive — the mailbox watcher, the
 * wiki sweeps, the purges, the billing reset — and until now not one of
 * them left a mark anybody could read. A job that started throwing on
 * every run looked exactly like a job that was working.
 *
 * Every cron now enters through `runJob`, which runs the real function and
 * writes the outcome to one row per job. The map below is the single list
 * of what is scheduled; TypeScript checks each entry against the real
 * function's kind, so a mutation cannot be run as an action by mistake.
 */

/** Every job the crons dispatch, and how to run it. */
const JOBS: Record<string, (ctx: ActionCtx) => Promise<unknown>> = {
  "workflow-schedule-dispatcher": (ctx) =>
    ctx.runMutation(internal.workflowEngine.scheduleDispatcher, {}),
  "gmail-mailbox-watcher": (ctx) => ctx.runAction(internal.gmailWatcher.pollMailboxes, {}),
  "connector-oauth-token-refresh": (ctx) =>
    ctx.runAction(internal.connectorOAuth.refreshExpiringTokens, {}),
  "connection-probes": (ctx) => ctx.runAction(internal.connectionProbes.probeConnections, {}),
  "agent-run-stall-recovery": (ctx) =>
    ctx.runMutation(internal.agentRunCheckpoints.recoverStalledRuns, {}),
  "agent-approval-expiry": (ctx) =>
    ctx.runMutation(internal.agentRunApprovals.expireStalePendingApprovals, {}),
  "workflow-approval-expiry": (ctx) =>
    ctx.runMutation(internal.workflowEngine.expireStaleWorkflowApprovals, {}),
  "agent-skill-rollup-rebuild": (ctx) =>
    ctx.runMutation(internal.agentSkills.rebuildSkillCatalogRollupInternal, {}),
  "governance-rollup-rebuild": (ctx) =>
    ctx.runMutation(internal.governanceRollups.rebuildGovernanceRollups, {}),
  "company-memory-suggestion-sweep": (ctx) =>
    ctx.runAction(internal.companyMemorySuggestionActions.sweepDispatcher, {}),
  "user-memory-suggestion-sweep": (ctx) =>
    ctx.runAction(internal.userMemorySuggestionActions.sweepDispatcher, {}),
  "wiki-tending-sweep": (ctx) => ctx.runAction(internal.wikiTendingActions.tendDispatcher, {}),
  "wiki-distill-sweep": (ctx) => ctx.runAction(internal.wikiDistillActions.distilSweep, {}),
  "wiki-contradiction-sweep": (ctx) =>
    ctx.runAction(internal.wikiContradictionActions.contradictionSweep, {}),
  "wiki-freshness-sweep": (ctx) => ctx.runAction(internal.wikiFreshnessActions.freshnessSweep, {}),
  "knowledge-evidence-sweep": (ctx) =>
    ctx.runMutation(internal.knowledgeEvidence.sweepEvidenceInternal, {}),
  "unified-data-purge-dispatcher": (ctx) => ctx.runMutation(internal.purges.dispatcher, {}),
  "purge-stall-reaper": (ctx) => ctx.runMutation(internal.purges.reapStalePurges, {}),
  "tool-idempotency-purge": (ctx) =>
    ctx.runMutation(internal.aiToolWriteTools.purgeExpiredToolIdempotency, {}),
  "vector-garbage-collection": (ctx) =>
    ctx.runMutation(internal.knowledge.garbageCollectThreadVectors, {}),
  "reset-billing-cycles": (ctx) => ctx.runMutation(internal.plans.resetBillingCycle, {}),
  "generate-daily-analytics-snapshots": (ctx) =>
    ctx.runMutation(internal.analyticsSnapshots.generateDailySnapshots, {}),
  "user-login-count-rollup": (ctx) => ctx.runMutation(internal.users.recomputeLoginCounts, {}),
  // The one job that carries an argument: its seven-day window is the
  // schedule's, not the function's default, so it travels with the entry.
  "dispatch-platform-alerts": (ctx) =>
    ctx.runAction(internal.platformAlerts.dispatchPlatformAlerts, { daysBack: 7 }),
  "wiki-weekly-report": (ctx) => ctx.runAction(internal.wikiReport.sendWeeklyReports, {}),
  "wiki-exam-growth": (ctx) => ctx.runAction(internal.wikiExamGrowthActions.examGrowthSweep, {}),
};

/** How often each job is meant to run, in minutes — the screen uses this to
 * say "overdue" without the reader having to know the schedule. */
const EXPECTED_EVERY_MINUTES: Record<string, number> = {
  "workflow-schedule-dispatcher": 1,
  "gmail-mailbox-watcher": 1,
  "agent-run-stall-recovery": 2,
  "agent-skill-rollup-rebuild": 10,
  "governance-rollup-rebuild": 10,
  "purge-stall-reaper": 10,
  "agent-approval-expiry": 15,
  "workflow-approval-expiry": 15,
  "wiki-distill-sweep": 15,
  "connector-oauth-token-refresh": 60,
  "connection-probes": 60,
  "knowledge-evidence-sweep": 60,
  "unified-data-purge-dispatcher": 60,
  "vector-garbage-collection": 60,
  "tool-idempotency-purge": 60,
  "company-memory-suggestion-sweep": 360,
  "user-memory-suggestion-sweep": 360,
  "generate-daily-analytics-snapshots": 1440,
  "user-login-count-rollup": 1440,
  "dispatch-platform-alerts": 1440,
  "wiki-tending-sweep": 1440,
  "wiki-contradiction-sweep": 1440,
  "wiki-freshness-sweep": 1440,
  "wiki-weekly-report": 10080,
  "reset-billing-cycles": 44640,
  "wiki-exam-growth": 44640,
};

export const recordJobOutcomeInternal = internalMutation({
  args: {
    job: v.string(),
    ok: v.boolean(),
    durationMs: v.number(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("jobRuns")
      .withIndex("by_job", (q) => q.eq("job", args.job))
      .unique();
    const base = {
      job: args.job,
      lastRanAt: now,
      lastOk: args.ok,
      lastDurationMs: args.durationMs,
      // A cleared error matters as much as a set one: the row must never
      // keep yesterday's failure text beside today's success.
      lastError: args.ok ? undefined : args.error?.slice(0, 500),
      lastSucceededAt: args.ok ? now : existing?.lastSucceededAt,
      consecutiveFailures: args.ok ? 0 : (existing?.consecutiveFailures ?? 0) + 1,
    };
    if (existing) await ctx.db.patch(existing._id, base);
    else await ctx.db.insert("jobRuns", base);
  },
});

/**
 * The door every cron enters through. The job's own failure is recorded and
 * swallowed — a scheduled sweep that throws should leave evidence, not an
 * unhandled rejection in a log nobody reads.
 */
export const runJob = internalAction({
  args: { job: v.string() },
  handler: async (ctx, args) => {
    const run = JOBS[args.job];
    if (!run) {
      await ctx.runMutation(internal.jobLedger.recordJobOutcomeInternal, {
        job: args.job,
        ok: false,
        durationMs: 0,
        error: `Unknown job '${args.job}'.`,
      });
      return;
    }
    const startedAt = Date.now();
    try {
      await run(ctx);
      await ctx.runMutation(internal.jobLedger.recordJobOutcomeInternal, {
        job: args.job,
        ok: true,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      await ctx.runMutation(internal.jobLedger.recordJobOutcomeInternal, {
        job: args.job,
        ok: false,
        durationMs: Date.now() - startedAt,
        error: getErrorMessage(error),
      });
    }
  },
});

export type JobRow = {
  job: string;
  lastRanAt: number | null;
  lastOk: boolean | null;
  lastSucceededAt: number | null;
  lastError: string | null;
  consecutiveFailures: number;
  expectedEveryMinutes: number | null;
  /** Late by more than three of its own intervals — the plain-words flag. */
  isOverdue: boolean;
};

/**
 * Every job the platform schedules, whether or not it has ever run. A job
 * missing from the table is the most important row on the screen, so the
 * list is built from the schedule and joined to the ledger, never the
 * other way round.
 */
export const listJobRuns = adminQuery({
  args: {},
  handler: async (ctx): Promise<JobRow[]> => {
    if (ctx.user.role !== "SUPER_ADMIN" && ctx.user.role !== "READ_ONLY") {
      throw appError("UNAUTHORIZED", "Unauthorized access to platform maintenance");
    }
    // One row per job, so this ceiling is comfortably above the whole table.
    const rows = await ctx.db.query("jobRuns").take(200);
    const byJob = new Map(rows.map((row) => [row.job, row]));
    const now = Date.now();
    return Object.keys(JOBS)
      .map((job) => {
        const row = byJob.get(job);
        const expected = EXPECTED_EVERY_MINUTES[job] ?? null;
        const overdueAfter = expected ? expected * 3 * 60_000 : null;
        return {
          job,
          lastRanAt: row?.lastRanAt ?? null,
          lastOk: row?.lastOk ?? null,
          lastSucceededAt: row?.lastSucceededAt ?? null,
          lastError: row?.lastError ?? null,
          consecutiveFailures: row?.consecutiveFailures ?? 0,
          expectedEveryMinutes: expected,
          isOverdue: Boolean(
            overdueAfter && row?.lastRanAt && now - row.lastRanAt > overdueAfter
          ),
        };
      })
      .sort((a, b) => {
        const rank = (row: JobRow) =>
          row.lastRanAt === null ? 0 : row.isOverdue || row.lastOk === false ? 1 : 2;
        return rank(a) - rank(b) || a.job.localeCompare(b.job);
      });
  },
});
