import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { paginationOptsValidator } from "convex/server";
import { superAdminMutation, superAdminQuery } from "./tenantFunctions";
import {
  calculateNextPurgeRun,
  calculatePurgeCutoffTimestamp,
  assertMinimumPurgeRetentionDays,
  getPurgeRetentionDays,
  parsePurgePipelineConfig,
  normalizePurgePipelineConfigForUpdate,
  MIN_PURGE_RETENTION_DAYS,
  PURGE_PIPELINE_KEYS,
  type PurgePipelineKey,
} from "./purgeScheduleService";
import { AUDIT_PURGE_ACTION, isAuditPurgeRecord } from "./auditLogService";
import { appError } from "./utils/appError";

export const purgePipelineKeyValidator = v.union(
  v.literal("agentLogs"),
  v.literal("workflowLogs"),
  v.literal("userLogins"),
  v.literal("chatHistory"),
  v.literal("auditLogs"),
  v.literal("publicApiRequests"),
  v.literal("authEvents"),
  v.literal("aiActionRequests"),
  v.literal("analyticsSnapshots"),
  v.literal("webhookDeliveries"),
  v.literal("agentRunHistory"),
  v.literal("agentTransactions"),
  v.literal("phoneCalls"),
  v.literal("mailboxMessages"),
  v.literal("purgeHistory"),
);

/** A run is only ever purged after it has finished. */
const TERMINAL_RUN_STATUSES = new Set(["SUCCESS", "FAILED", "CANCELLED"]);

/** Reaper threshold: a RUNNING row with no progress for this long is dead. */
export const PURGE_STALL_MS = 30 * 60 * 1000;

/**
 * purgeHistory keeps its newest rows whatever its configured retention says
 * (the `purgeHistory` pipeline, visible on the rules screen, enforces this).
 */
const PURGE_HISTORY_PROTECTED_ROWS = 200;

/**
 * "YYYY-MM-DD" for a cutoff instant — analyticsDailySnapshots keys days as
 * ISO strings, which order lexicographically.
 */
function dateKeyForCutoff(cutoffTimestamp: number) {
  return new Date(cutoffTimestamp).toISOString().slice(0, 10);
}

async function findRunningPurge(ctx: Pick<MutationCtx, "db">, pipelineKey: PurgePipelineKey) {
  const recent = await ctx.db
    .query("purgeHistory")
    .withIndex("by_pipeline_started", (q) => q.eq("pipelineKey", pipelineKey))
    .order("desc")
    .take(5);
  return recent.find((row) => row.status === "RUNNING") ?? null;
}

export const getPipelineConfig = superAdminQuery({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", "PURGE_PIPELINES_CONFIG"))
      .first();

    return parsePurgePipelineConfig(config?.value);
  },
});

export const updatePipelineConfig = superAdminMutation({
  args: {
    configStr: v.string(), // JSON string representing the config
  },
  handler: async (ctx, args) => {
    const { userId, user } = ctx;

    const now = Date.now();
    const parsed = normalizePurgePipelineConfigForUpdate(args.configStr);
    const finalConfigStr = JSON.stringify(parsed);

    const existingConfig = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", "PURGE_PIPELINES_CONFIG"))
      .first();

    if (existingConfig) {
      await ctx.db.patch(existingConfig._id, {
        value: finalConfigStr,
        updatedAt: now,
        updatedBy: userId,
      });
    } else {
      await ctx.db.insert("systemConfig", {
        key: "PURGE_PIPELINES_CONFIG",
        value: finalConfigStr,
        updatedAt: now,
        updatedBy: userId,
      });
    }

    await ctx.db.insert("auditLogs", {
      actionType: "UPDATE_PURGE_PIPELINES",
      actorId: user._id,
      entityType: "systemConfig",
      entityId: "PURGE_PIPELINES_CONFIG",
      timestamp: now,
      metadata: finalConfigStr,
    });

    return true;
  },
});

/**
 * The history feed, server-paginated with the actor's name joined in.
 * `superAdminQuery` admits READ_ONLY as well, matching `getPipelineConfig`,
 * so an oversight role no longer sees a populated config table over a
 * history that claims to be empty.
 */
export const getPurgeHistoryPaginated = superAdminQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    pipelineKey: v.optional(purgePipelineKeyValidator),
    status: v.optional(v.union(
      v.literal("RUNNING"),
      v.literal("SUCCESS"),
      v.literal("FAILED"),
      v.literal("CANCELLED"),
    )),
  },
  handler: async (ctx, args) => {
    const base = args.pipelineKey
      ? ctx.db.query("purgeHistory").withIndex("by_pipeline_started", (q) => q.eq("pipelineKey", args.pipelineKey!))
      : ctx.db.query("purgeHistory").withIndex("by_started");
    const filtered = args.status
      ? base.filter((q) => q.eq(q.field("status"), args.status))
      : base;
    const page = await filtered.order("desc").paginate(args.paginationOpts);

    const enriched = await Promise.all(
      page.page.map(async (log) => {
        let actorName = "System Cron";
        if (log.actorId) {
          const actor = await ctx.db.get(log.actorId);
          actorName = actor?.name || actor?.email || "Unknown Admin";
        }
        return { ...log, actorName };
      }),
    );

    return { ...page, page: enriched };
  },
});

/**
 * How many records each pipeline would delete if it ran right now — the
 * dry-run the owner reads before switching a dial on. Counts are bounded:
 * anything at the cap reads as "at least this many".
 */
async function buildPurgePreviewCounts(ctx: { db: Pick<MutationCtx["db"], "query"> }) {
    const configDoc = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", "PURGE_PIPELINES_CONFIG"))
      .first();
    const configs = parsePurgePipelineConfig(configDoc?.value);
    const CAP = 5001;
    const now = Date.now();

    const counts = {} as Record<PurgePipelineKey, { count: number; capped: boolean }>;
    for (const key of PURGE_PIPELINE_KEYS) {
      const cutoff = calculatePurgeCutoffTimestamp(configs[key].retentionDays, now);
      let rows = 0;
      if (key === "agentLogs") {
        rows = (await ctx.db.query("agentLogs").withIndex("by_createdAt", (q) => q.lt("createdAt", cutoff)).take(CAP)).length;
      } else if (key === "workflowLogs") {
        rows = (await ctx.db.query("workflowExecutions").withIndex("by_startedAt", (q) => q.lt("startedAt", cutoff)).take(CAP)).length;
      } else if (key === "userLogins") {
        rows = (await ctx.db.query("logins").withIndex("by_timestamp", (q) => q.lt("timestamp", cutoff)).take(CAP)).length;
      } else if (key === "chatHistory") {
        rows = (await ctx.db.query("threads").withIndex("by_updatedAt", (q) => q.lt("updatedAt", cutoff)).take(CAP)).length;
      } else if (key === "auditLogs") {
        rows = (await ctx.db.query("auditLogs").withIndex("by_timestamp", (q) => q.lt("timestamp", cutoff)).take(CAP)).length;
      } else if (key === "publicApiRequests") {
        rows = (await ctx.db.query("publicApiRequests").withIndex("by_requested", (q) => q.lt("requestedAt", cutoff)).take(CAP)).length;
      } else if (key === "authEvents") {
        rows = (await ctx.db.query("authEvents").withIndex("by_timestamp", (q) => q.lt("timestamp", cutoff)).take(CAP)).length;
      } else if (key === "aiActionRequests") {
        rows = (await ctx.db.query("aiActionRequests").withIndex("by_requested", (q) => q.lt("requestedAt", cutoff)).take(CAP)).length;
      } else if (key === "analyticsSnapshots") {
        const cutoffKey = dateKeyForCutoff(cutoff);
        rows = (await ctx.db.query("analyticsDailySnapshots").withIndex("by_date", (q) => q.lt("date", cutoffKey)).take(CAP)).length;
      } else if (key === "webhookDeliveries") {
        rows = (await ctx.db.query("webhookDeliveries").withIndex("by_created", (q) => q.lt("createdAt", cutoff)).take(CAP)).length;
      } else if (key === "agentRunHistory") {
        const candidates = await ctx.db
          .query("agentRuns")
          .withIndex("by_completed", (q) => q.gt("completedAt", 0).lt("completedAt", cutoff))
          .take(CAP);
        rows = candidates.filter((run) => TERMINAL_RUN_STATUSES.has(run.status)).length;
      } else if (key === "agentTransactions") {
        rows = (await ctx.db.query("agentTransactions").withIndex("by_createdAt", (q) => q.lt("createdAt", cutoff)).take(CAP)).length;
      } else if (key === "purgeHistory") {
        const newest = await ctx.db.query("purgeHistory").withIndex("by_started").order("desc").take(PURGE_HISTORY_PROTECTED_ROWS + 1);
        if (newest.length > PURGE_HISTORY_PROTECTED_ROWS) {
          const effectiveCutoff = Math.min(newest[newest.length - 1].startedAt, cutoff);
          rows = (await ctx.db.query("purgeHistory").withIndex("by_started", (q) => q.lt("startedAt", effectiveCutoff)).take(CAP)).length;
        }
      }
      counts[key] = { count: Math.min(rows, CAP - 1), capped: rows >= CAP };
    }
    return counts;
}

/** The RUNNING rows only — the rules screen shows a Stop button on them. */
export const getRunningPurges = superAdminQuery({
  args: {},
  handler: async (ctx) => {
    const recent = await ctx.db
      .query("purgeHistory")
      .withIndex("by_started")
      .order("desc")
      .take(50);
    return recent.filter((row) => row.status === "RUNNING");
  },
});

export const getPurgePreviewCounts = superAdminQuery({
  args: {},
  handler: async (ctx) => buildPurgePreviewCounts(ctx),
});

/**
 * CLI-only variants for the staged live proof in the retention plan
 * (Phase 3): `npx convex run` can invoke internal functions on a dev
 * deployment, and the proof must not require signing into the app. Both are
 * unreachable from clients. The proof mutation mirrors `runManualPurge`
 * exactly, including the concurrency guard and the audit entry — the only
 * difference is the missing session, recorded honestly in the metadata.
 */
export const getPurgePreviewCountsInternal = internalQuery({
  args: {},
  handler: async (ctx) => buildPurgePreviewCounts(ctx),
});

export const runPurgeProofInternal = internalMutation({
  args: {
    pipelineKey: purgePipelineKeyValidator,
  },
  handler: async (ctx, args) => {
    const alreadyRunning = await findRunningPurge(ctx, args.pipelineKey);
    if (alreadyRunning) {
      throw appError("CONFLICT", `A purge for '${args.pipelineKey}' is already running.`);
    }

    const configDoc = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", "PURGE_PIPELINES_CONFIG"))
      .first();
    const retentionDays = getPurgeRetentionDays({
      configStr: configDoc?.value,
      pipelineKey: args.pipelineKey,
    });
    assertMinimumPurgeRetentionDays(retentionDays, "CLI proof purge");
    const cutoffTimestamp = calculatePurgeCutoffTimestamp(retentionDays);

    const historyId = await ctx.db.insert("purgeHistory", {
      pipelineKey: args.pipelineKey,
      triggerType: "MANUAL",
      status: "RUNNING",
      recordsPurged: 0,
      startedAt: Date.now(),
      lastProgressAt: Date.now(),
    });
    await ctx.db.insert("auditLogs", {
      actionType: "MANUAL_PURGE_TRIGGER",
      entityType: "purgeHistory",
      entityId: historyId,
      timestamp: Date.now(),
      metadata: JSON.stringify({
        pipelineKey: args.pipelineKey,
        retentionDays,
        cutoffTimestamp,
        startedBy: "operator CLI (retention plan live proof)",
      }),
    });
    await ctx.scheduler.runAfter(0, internal.purges.executePurgeRecursive, {
      pipelineKey: args.pipelineKey,
      cutoffTimestamp,
      historyId,
      deletedCount: 0,
    });
    return historyId;
  },
});

export const runManualPurge = superAdminMutation({
  args: {
    pipelineKey: purgePipelineKeyValidator,
  },
  handler: async (ctx, args) => {
    const { userId, user } = ctx;

    // Two concurrent chains over the same rows double-delete and
    // double-count; the client hiding the button is not a guard.
    const alreadyRunning = await findRunningPurge(ctx, args.pipelineKey);
    if (alreadyRunning) {
      throw appError("CONFLICT", `A purge for '${args.pipelineKey}' is already running.`);
    }

    const configDoc = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", "PURGE_PIPELINES_CONFIG"))
      .first();

    const retentionDays = getPurgeRetentionDays({
      configStr: configDoc?.value,
      pipelineKey: args.pipelineKey,
    });
    assertMinimumPurgeRetentionDays(retentionDays, "manual purge");

    const cutoffTimestamp = calculatePurgeCutoffTimestamp(retentionDays);

    // Create history record
    const historyId = await ctx.db.insert("purgeHistory", {
      pipelineKey: args.pipelineKey,
      triggerType: "MANUAL",
      status: "RUNNING",
      recordsPurged: 0,
      startedAt: Date.now(),
      lastProgressAt: Date.now(),
      actorId: userId,
    });

    // Audit log
    await ctx.db.insert("auditLogs", {
      actionType: "MANUAL_PURGE_TRIGGER",
      actorId: user._id,
      entityType: "purgeHistory",
      entityId: historyId,
      timestamp: Date.now(),
      metadata: JSON.stringify({
        pipelineKey: args.pipelineKey,
        retentionDays,
        cutoffTimestamp,
      }),
    });

    // Schedule background recursive deletion immediately (0ms delay)
    await ctx.scheduler.runAfter(0, internal.purges.executePurgeRecursive, {
      pipelineKey: args.pipelineKey,
      cutoffTimestamp,
      historyId,
      deletedCount: 0,
    });

    return historyId;
  },
});

/**
 * Delete one agent run and every child that ages out with it.
 *
 * Deliberately kept (decision record in
 * docs/plans/active/retention-and-purge-plan.md Phase 2.3):
 * - `agentRunApprovals` — GDPR RETAIN, oversight evidence. Their runId will
 *   dangle; readers are defensive.
 * - `agentTransactions` — finance history, its own longer pipeline.
 * - Learning tables (memories, candidates, fixtures, suggestions) — their
 *   optional source references dangle; deleting them would corrupt what the
 *   AI has learned.
 *
 * `agentMemoryUsage` rows DO go: they are the audit trail behind the memory
 * outcome counters, and once deleted the cached counters become the only
 * record (the outcome backfill migration must not be re-run after this
 * pipeline has fired — noted in convex/dataMigrations.ts).
 *
 * Returns the number of rows removed (run + children).
 */
async function deleteAgentRunCascade(ctx: Pick<MutationCtx, "db">, run: Doc<"agentRuns">) {
  // Bounded per child table: a pathological run must exhaust the batch, not
  // the transaction. When any table hits its bound the run row is kept, so
  // the next batch resumes the same run until its children are gone.
  const CHILD_BOUND = 200;
  let removed = 0;
  let complete = true;

  const wipe = async (rows: { _id: Parameters<MutationCtx["db"]["delete"]>[0] }[]) => {
    for (const row of rows) {
      await ctx.db.delete(row._id);
      removed++;
    }
    if (rows.length === CHILD_BOUND) complete = false;
  };

  await wipe(await ctx.db.query("agentRunSteps")
    .withIndex("by_run_step", (q) => q.eq("runId", run._id)).take(CHILD_BOUND));
  await wipe(await ctx.db.query("agentToolCalls")
    .withIndex("by_run_started", (q) => q.eq("runId", run._id)).take(CHILD_BOUND));
  await wipe(await ctx.db.query("agentRunReflections")
    .withIndex("by_run_created", (q) => q.eq("runId", run._id)).take(CHILD_BOUND));
  await wipe(await ctx.db.query("agentMemoryUsage")
    .withIndex("by_run", (q) => q.eq("runId", run._id)).take(CHILD_BOUND));
  await wipe(await ctx.db.query("agentRunFeedback")
    .withIndex("by_run_created", (q) => q.eq("runId", run._id)).take(CHILD_BOUND));
  await wipe(await ctx.db.query("agentRunCheckpoints")
    .withIndex("by_run", (q) => q.eq("runId", run._id)).take(CHILD_BOUND));
  await wipe(await ctx.db.query("agentLogs")
    .withIndex("by_run", (q) => q.eq("runId", run._id)).take(CHILD_BOUND));

  if (complete) {
    await ctx.db.delete(run._id);
    removed++;
  }
  return { removed, complete };
}

export const executePurgeRecursive = internalMutation({
  args: {
    pipelineKey: purgePipelineKeyValidator,
    cutoffTimestamp: v.number(),
    historyId: v.id("purgeHistory"),
    deletedCount: v.number(),
    // Used by the audit trail pipeline alone, which pages by cursor because
    // some of its rows are never deletable.
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { pipelineKey, cutoffTimestamp, historyId, deletedCount } = args;

    // Check if the history record exists and is still in RUNNING state
    const history = await ctx.db.get(historyId);
    if (!history || history.status !== "RUNNING") {
      console.log(
        `Purge run ${historyId} is not in RUNNING state (status: ${history?.status}). Aborting recursion.`
      );
      return;
    }

    try {
      let currentDeleted = 0;
      let hasMore = false;
      let nextCursor: string | undefined;
      const leakedStorageIds: string[] = [];

      if (pipelineKey === "agentLogs") {
        const batch = await ctx.db
          .query("agentLogs")
          .withIndex("by_createdAt", (q) => q.lt("createdAt", cutoffTimestamp))
          .take(500);

        for (const record of batch) {
          await ctx.db.delete(record._id);
        }
        currentDeleted = batch.length;
        hasMore = batch.length === 500;
      } else if (pipelineKey === "userLogins") {
        const batch = await ctx.db
          .query("logins")
          .withIndex("by_timestamp", (q) => q.lt("timestamp", cutoffTimestamp))
          .take(500);

        for (const record of batch) {
          await ctx.db.delete(record._id);
        }
        currentDeleted = batch.length;
        hasMore = batch.length === 500;
      } else if (pipelineKey === "publicApiRequests") {
        const batch = await ctx.db
          .query("publicApiRequests")
          .withIndex("by_requested", (q) => q.lt("requestedAt", cutoffTimestamp))
          .take(500);
        for (const record of batch) {
          await ctx.db.delete(record._id);
        }
        currentDeleted = batch.length;
        hasMore = batch.length === 500;
      } else if (pipelineKey === "authEvents") {
        const batch = await ctx.db
          .query("authEvents")
          .withIndex("by_timestamp", (q) => q.lt("timestamp", cutoffTimestamp))
          .take(500);
        for (const record of batch) {
          await ctx.db.delete(record._id);
        }
        currentDeleted = batch.length;
        hasMore = batch.length === 500;
      } else if (pipelineKey === "aiActionRequests") {
        const batch = await ctx.db
          .query("aiActionRequests")
          .withIndex("by_requested", (q) => q.lt("requestedAt", cutoffTimestamp))
          .take(500);
        for (const record of batch) {
          await ctx.db.delete(record._id);
        }
        currentDeleted = batch.length;
        hasMore = batch.length === 500;
      } else if (pipelineKey === "analyticsSnapshots") {
        const cutoffKey = dateKeyForCutoff(cutoffTimestamp);
        const batch = await ctx.db
          .query("analyticsDailySnapshots")
          .withIndex("by_date", (q) => q.lt("date", cutoffKey))
          .take(500);
        for (const record of batch) {
          await ctx.db.delete(record._id);
        }
        currentDeleted = batch.length;
        hasMore = batch.length === 500;
      } else if (pipelineKey === "phoneCalls") {
        // A call that never received its completed webhook still ages out on
        // when it started, so a stuck IN_PROGRESS row cannot outlive the
        // retention window holding a caller's number.
        const batch = await ctx.db
          .query("phoneCalls")
          .withIndex("by_started", (q) => q.lt("startedAt", cutoffTimestamp))
          .take(500);
        for (const record of batch) {
          await ctx.db.delete(record._id);
        }
        currentDeleted = batch.length;
        hasMore = batch.length === 500;
      } else if (pipelineKey === "mailboxMessages") {
        // The watcher's ledger ages out whole: a row old enough to purge is
        // long past every rail window that reads it.
        const batch = await ctx.db
          .query("mailboxMessages")
          .withIndex("by_created", (q) => q.lt("createdAt", cutoffTimestamp))
          .take(500);
        for (const record of batch) {
          await ctx.db.delete(record._id);
        }
        currentDeleted = batch.length;
        hasMore = batch.length === 500;
      } else if (pipelineKey === "webhookDeliveries") {
        const batch = await ctx.db
          .query("webhookDeliveries")
          .withIndex("by_created", (q) => q.lt("createdAt", cutoffTimestamp))
          .take(500);
        for (const record of batch) {
          await ctx.db.delete(record._id);
        }
        currentDeleted = batch.length;
        hasMore = batch.length === 500;
      } else if (pipelineKey === "agentTransactions") {
        const batch = await ctx.db
          .query("agentTransactions")
          .withIndex("by_createdAt", (q) => q.lt("createdAt", cutoffTimestamp))
          .take(500);
        for (const record of batch) {
          await ctx.db.delete(record._id);
        }
        currentDeleted = batch.length;
        hasMore = batch.length === 500;
      } else if (pipelineKey === "agentRunHistory") {
        // Runs are wide (steps and tool calls carry full payloads), so the
        // batch is small and bounded by child rows, not just run count.
        const candidates = await ctx.db
          .query("agentRuns")
          .withIndex("by_completed", (q) => q.gt("completedAt", 0).lt("completedAt", cutoffTimestamp))
          .take(25);

        let rowBudget = 400;
        let runsDeleted = 0;
        for (const run of candidates) {
          // Never touch a run that is not finished. `completedAt` on a
          // non-terminal run would be a bug elsewhere; refuse regardless.
          if (!TERMINAL_RUN_STATUSES.has(run.status)) continue;
          if (rowBudget <= 0) {
            hasMore = true;
            break;
          }
          const outcome = await deleteAgentRunCascade(ctx, run);
          rowBudget -= outcome.removed;
          if (outcome.complete) {
            runsDeleted++;
          } else {
            // A pathological run with more children than one batch holds:
            // its row survives, so the next batch resumes it.
            hasMore = true;
          }
        }
        currentDeleted = runsDeleted;
        hasMore = hasMore || candidates.length === 25;
      } else if (pipelineKey === "purgeHistory") {
        // The purge system's own log. Never deletes RUNNING rows, never
        // deletes this run's own row, and always keeps the newest
        // PURGE_HISTORY_PROTECTED_ROWS entries whatever the retention says.
        const newest = await ctx.db
          .query("purgeHistory")
          .withIndex("by_started")
          .order("desc")
          .take(PURGE_HISTORY_PROTECTED_ROWS + 1);
        if (newest.length > PURGE_HISTORY_PROTECTED_ROWS) {
          const protectedCutoff = newest[newest.length - 1].startedAt;
          const effectiveCutoff = Math.min(protectedCutoff, cutoffTimestamp);
          const batch = await ctx.db
            .query("purgeHistory")
            .withIndex("by_started", (q) => q.lt("startedAt", effectiveCutoff))
            .take(200);
          for (const record of batch) {
            if (record._id === historyId || record.status === "RUNNING") continue;
            await ctx.db.delete(record._id);
            currentDeleted++;
          }
          hasMore = batch.length === 200;
        }
      } else if (pipelineKey === "auditLogs") {
        /*
         * Paged by cursor, unlike its neighbours, because this is the one
         * pipeline whose rows are not all deletable. Repeatedly taking the
         * oldest rows works only while everything found can go; the moment some
         * are exempt, the same exempt rows come back every batch and the run
         * never ends.
         */
        const batch = await ctx.db
          .query("auditLogs")
          .withIndex("by_timestamp", (q) => q.lt("timestamp", cutoffTimestamp))
          .paginate({ numItems: 500, cursor: args.cursor ?? null });

        for (const record of batch.page) {
          // The records of previous clear-outs outlive every clear-out. A
          // summary a later run could remove would leave the same hole one run
          // further on, which is the hole this record exists to close.
          if (isAuditPurgeRecord(record.actionType)) continue;
          await ctx.db.delete(record._id);
          currentDeleted++;
        }

        nextCursor = batch.continueCursor;
        hasMore = !batch.isDone;
      } else if (pipelineKey === "workflowLogs") {
        // Deleting executions and cascaded steps, cap at 200 executions.
        // Linked agent runs are NOT deleted here — they age out through the
        // agentRunHistory pipeline on their own completedAt clock.
        const batch = await ctx.db
          .query("workflowExecutions")
          .withIndex("by_startedAt", (q) => q.lt("startedAt", cutoffTimestamp))
          .take(200);

        for (const execution of batch) {
          const steps = await ctx.db
            .query("workflowExecutionSteps")
            .withIndex("by_execution", (q) =>
              q.eq("executionId", execution._id)
            )
            .collect();

          for (const step of steps) {
            await ctx.db.delete(step._id);
          }
          await ctx.db.delete(execution._id);
        }
        currentDeleted = batch.length;
        hasMore = batch.length === 200;
      } else if (pipelineKey === "chatHistory") {
        /*
         * Threads cascade: feedback rows and memory-usage rows go with their
         * messages — feedback carries user-authored comment text that must
         * not outlive the conversation it rated — and the whole batch is
         * budgeted by MESSAGES, not threads, because a hundred long
         * conversations in one transaction is how a purge dies at commit
         * time and sticks RUNNING forever.
         */
        const batch = await ctx.db
          .query("threads")
          .withIndex("by_updatedAt", (q) => q.lt("updatedAt", cutoffTimestamp))
          .take(25);

        let messageBudget = 500;
        let filesDeletedCount = 0;
        let threadsFullyDeleted = 0;

        for (const thread of batch) {
          if (messageBudget <= 0 || filesDeletedCount >= 200) {
            hasMore = true;
            break;
          }

          // 1. Messages, their feedback, and their attachments
          const messages = await ctx.db
            .query("messages")
            .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
            .take(messageBudget + 1);
          const partialThread = messages.length > messageBudget;
          const deletable = partialThread ? messages.slice(0, messageBudget) : messages;

          for (const message of deletable) {
            // Bounded: one rating per user per message, so 50 covers any
            // realistic message many times over.
            const feedbackRows = await ctx.db
              .query("messageFeedback")
              .withIndex("by_message_user", (q) => q.eq("messageId", message._id))
              .take(50);
            for (const feedbackRow of feedbackRows) {
              await ctx.db.delete(feedbackRow._id);
            }

            if (message.attachments) {
              for (const storageId of message.attachments) {
                try {
                  await ctx.storage.delete(storageId);
                  filesDeletedCount++;
                } catch (err) {
                  // The message row is about to go, so this id is the only
                  // remaining record of the blob. Never lose it silently.
                  console.error(`Failed to delete storage file ${storageId} in chat purge:`, err);
                  leakedStorageIds.push(storageId);
                }
              }
            }
            await ctx.db.delete(message._id);
            messageBudget--;
          }

          if (partialThread || filesDeletedCount >= 200) {
            // More messages remain on this thread; the next batch resumes it.
            hasMore = true;
            continue;
          }

          // 2. Memory-usage rows for the thread (counters are cached on the
          // memories themselves, so the rows are safe to drop with the chat)
          const usageRows = await ctx.db
            .query("companyMemoryUsage")
            .withIndex("by_thread_used", (q) => q.eq("threadId", thread._id))
            .take(500);
          // At the bound, leave the thread for the next batch to finish.
          if (usageRows.length === 500) {
            hasMore = true;
            for (const usage of usageRows) {
              await ctx.db.delete(usage._id);
            }
            continue;
          }
          for (const usage of usageRows) {
            await ctx.db.delete(usage._id);
          }

          // 3. Swarm logs
          const swarms = await ctx.db
            .query("swarmLogs")
            .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
            .collect();

          for (const swarm of swarms) {
            await ctx.db.delete(swarm._id);
          }

          // 4. The thread itself
          await ctx.db.delete(thread._id);
          threadsFullyDeleted++;
        }
        currentDeleted = threadsFullyDeleted;
        hasMore = hasMore || batch.length === 25;
      }

      const newTotal = deletedCount + currentDeleted;
      const leakPatch = leakedStorageIds.length > 0
        ? { leakedStorageIds: [...(history.leakedStorageIds ?? []), ...leakedStorageIds] }
        : {};

      if (hasMore) {
        // Heartbeat: progress is what the stall reaper reads to tell a slow
        // run from a dead one.
        await ctx.db.patch(historyId, {
          recordsPurged: newTotal,
          lastProgressAt: Date.now(),
          ...leakPatch,
        });

        await ctx.scheduler.runAfter(1000, internal.purges.executePurgeRecursive, {
          pipelineKey,
          cutoffTimestamp,
          historyId,
          deletedCount: newTotal,
          ...(nextCursor !== undefined ? { cursor: nextCursor } : {}),
        });
      } else {
        // Complete the run successfully
        await ctx.db.patch(historyId, {
          status: "SUCCESS",
          recordsPurged: newTotal,
          completedAt: Date.now(),
          lastProgressAt: Date.now(),
          ...leakPatch,
        });

        /*
         * The clear-out lands on the trail as well as in its own history.
         *
         * `purgeHistory` records that a pipeline ran; it is a separate screen
         * with its own retention, and somebody reading the audit trail to find
         * out why a month of records is missing would never reach it. That is
         * particularly true of this pipeline, which deletes the trail itself.
         */
        const allLeaked = [...(history.leakedStorageIds ?? []), ...leakedStorageIds];
        if (newTotal > 0 || allLeaked.length > 0) {
          await ctx.db.insert("auditLogs", {
            ...(history.actorId ? { actorId: history.actorId } : {}),
            actionType: pipelineKey === "auditLogs" ? AUDIT_PURGE_ACTION : "RECORDS_PURGED",
            entityType: "purgeHistory",
            entityId: historyId,
            timestamp: Date.now(),
            metadata: JSON.stringify({
              pipelineKey,
              recordsRemoved: newTotal,
              startedBy: history.triggerType === "MANUAL" ? "a person" : "the schedule",
              removedBeforeAt: cutoffTimestamp,
              ...(allLeaked.length > 0 ? { leakedStorageIds: allLeaked } : {}),
            }),
          });
        }
      }
    } catch (err) {
      // Catches in-handler errors only. A transaction that aborts at commit
      // time (size limits, OCC) rolls this patch back with it — that is what
      // the stall reaper exists for.
      console.error(`Error in executePurgeRecursive for ${pipelineKey}:`, err);
      await ctx.db.patch(historyId, {
        status: "FAILED",
        error: err instanceof Error ? err.message : String(err),
        completedAt: Date.now(),
      });
    }
  },
});

/**
 * Mark dead purge runs FAILED so they stop blocking the screen.
 *
 * `executePurgeRecursive` is one transaction per batch; when a batch aborts
 * at commit time its own FAILED patch rolls back with it, leaving the
 * history row RUNNING forever — which permanently swaps Run Now for Cancel
 * in the UI. Same failure mode agent runs already have a sweeper for.
 */
export const reapStalePurges = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const recent = await ctx.db
      .query("purgeHistory")
      .withIndex("by_started")
      .order("desc")
      .take(100);

    for (const row of recent) {
      if (row.status !== "RUNNING") continue;
      const lastSeen = row.lastProgressAt ?? row.startedAt;
      if (now - lastSeen < PURGE_STALL_MS) continue;

      await ctx.db.patch(row._id, {
        status: "FAILED",
        error: `No progress for ${Math.round((now - lastSeen) / 60000)} minutes; marked failed by the stall reaper. Records already purged stay purged; re-run to continue.`,
        completedAt: now,
      });
      await ctx.db.insert("auditLogs", {
        actionType: "RECORDS_PURGED",
        entityType: "purgeHistory",
        entityId: row._id,
        timestamp: now,
        metadata: JSON.stringify({
          pipelineKey: row.pipelineKey,
          recordsRemoved: row.recordsPurged,
          startedBy: "the stall reaper",
          note: "run died mid-batch and was marked failed automatically",
        }),
      });
    }
  },
});

export const dispatcher = internalMutation({
  args: {},
  handler: async (ctx) => {
    const configDoc = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", "PURGE_PIPELINES_CONFIG"))
      .first();

    if (!configDoc || !configDoc.value) {
      // No config saved yet: the defaults still apply, and purgeHistory
      // ships enabled — seed the config row so the schedule can advance.
      if (!configDoc) {
        await ctx.db.insert("systemConfig", {
          key: "PURGE_PIPELINES_CONFIG",
          value: JSON.stringify(parsePurgePipelineConfig(undefined)),
          updatedAt: Date.now(),
        });
      }
      return;
    }

    const configs = parsePurgePipelineConfig(configDoc.value);

    const now = Date.now();
    let configChanged = false;

    for (const pipelineKey of PURGE_PIPELINE_KEYS) {
      const config = configs[pipelineKey];

      if (!config.enabled) {
        continue;
      }

      // If nextRunTimestamp is not set, initialize it
      if (!config.nextRunTimestamp || config.nextRunTimestamp === 0) {
        config.nextRunTimestamp = calculateNextPurgeRun(
          config.interval,
          config.hourUtc,
          config.dayOfWeek,
          config.dayOfMonth
        );
        configChanged = true;
      }

      if (now >= config.nextRunTimestamp) {
        // The scheduled path enforces the same floor manual runs do; a
        // sub-minimum value written outside the modal must not be honoured.
        const retentionDays = Math.max(config.retentionDays, MIN_PURGE_RETENTION_DAYS);

        // Never start a second chain over rows the first is still deleting.
        const alreadyRunning = await findRunningPurge(ctx, pipelineKey);
        if (alreadyRunning) {
          console.log(`Scheduler: skipping ${pipelineKey}, a purge is already running.`);
          continue;
        }

        console.log(
          `Scheduler: triggering scheduled purge for pipeline: ${pipelineKey}`
        );

        const cutoffTimestamp = calculatePurgeCutoffTimestamp(retentionDays, now);

        // Insert history record
        const historyId = await ctx.db.insert("purgeHistory", {
          pipelineKey,
          triggerType: "SCHEDULED",
          status: "RUNNING",
          recordsPurged: 0,
          startedAt: now,
          lastProgressAt: now,
        });

        // Trigger execution asynchronously
        await ctx.scheduler.runAfter(0, internal.purges.executePurgeRecursive, {
          pipelineKey,
          cutoffTimestamp,
          historyId,
          deletedCount: 0,
        });

        // Calculate next execution run
        config.nextRunTimestamp = calculateNextPurgeRun(
          config.interval,
          config.hourUtc,
          config.dayOfWeek,
          config.dayOfMonth
        );
        configChanged = true;
      }
    }

    if (configChanged) {
      await ctx.db.patch(configDoc._id, {
        value: JSON.stringify(configs),
        updatedAt: now,
      });
    }
  },
});

export const cancelPurge = superAdminMutation({
  args: {
    historyId: v.id("purgeHistory"),
  },
  handler: async (ctx, args) => {
    const { user } = ctx;

    const history = await ctx.db.get(args.historyId);
    if (!history) {
      throw appError("NOT_FOUND", "Purge execution history record not found.");
    }

    if (history.status !== "RUNNING") {
      throw appError("CONFLICT", `Purge run ${args.historyId} is not actively running (status: ${history.status}).`);
    }

    const now = Date.now();
    await ctx.db.patch(args.historyId, {
      status: "CANCELLED",
      completedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorId: user._id,
      actionType: "MANUAL_PURGE_CANCEL",
      entityType: "purgeHistory",
      entityId: args.historyId,
      timestamp: now,
      metadata: JSON.stringify({
        pipelineKey: history.pipelineKey,
        recordsPurgedSoFar: history.recordsPurged,
      }),
    });

    return true;
  },
});
