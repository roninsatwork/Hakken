import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { superAdminQuery } from "./tenantFunctions";
import { agentKindToApplyMode, companyCategoryToApplyMode } from "./utils/memoryApplication";

/**
 * Data migrations and backfills.
 *
 * `npx convex deploy` applies schema changes but never touches existing rows,
 * so adding a field to 77 tables' worth of live data previously had no
 * supported path. This gives one:
 *
 * - Each migration is a named function that processes a single page and
 *   returns the next cursor. Convex mutations are transactional per batch, so a
 *   crash mid-run loses at most one batch.
 * - Progress is recorded in the `migrations` table, so a run resumes from its
 *   cursor rather than starting over, and a completed migration will not re-run.
 * - Migrations must be idempotent: they should skip rows already in the target
 *   state. That makes a resumed or re-triggered run safe.
 *
 * Built on the same scheduler-driven batching the purge pipeline already uses
 * (`convex/purges.ts`) rather than adding a component dependency.
 *
 * Run one with:
 *   npx convex run migrations:run '{"name":"2026-07-25-swarm-logs-company-id"}'
 *
 * Check progress with the `migrations:getStatus` query, or:
 *   npx convex run migrations:listStatus '{}'
 */

const DEFAULT_BATCH_SIZE = 200;
/** Safety stop: a migration that never finishes should surface, not loop forever. */
const MAX_BATCHES = 10000;

type MigrationBatchResult = {
  cursor: string | null;
  isDone: boolean;
  /** Documents examined in this batch. */
  processed: number;
  /** Documents actually changed in this batch. */
  updated: number;
};

type MigrationRunner = (
  ctx: MutationCtx,
  cursor: string | null,
  batchSize: number,
) => Promise<MigrationBatchResult>;

/**
 * Registered migrations, keyed by a stable name that also records when it was
 * introduced. Never rename or reuse a key: the name is the ledger's identity.
 */
const MIGRATIONS: Record<string, MigrationRunner> = {
  /**
   * Backfills `swarmLogs.companyId`, added alongside the swarm-log access fix
   * so the rows carry tenant provenance without a join back through threads.
   * Rows written before that change have no tenant stamped.
   */
  "2026-07-25-swarm-logs-company-id": async (ctx, cursor, batchSize) => {
    const page = await ctx.db.query("swarmLogs").paginate({ cursor, numItems: batchSize });
    let updated = 0;

    for (const log of page.page) {
      // Idempotent: skip anything already stamped.
      if (log.companyId !== undefined) continue;

      const thread = await ctx.db.get(log.threadId);
      // A thread may legitimately have no company (unassigned or deleted);
      // leaving those unset is correct rather than inventing a tenant.
      if (!thread?.companyId) continue;

      await ctx.db.patch(log._id, { companyId: thread.companyId });
      updated += 1;
    }

    return {
      cursor: page.continueCursor,
      isDone: page.isDone,
      processed: page.page.length,
      updated,
    };
  },

  /**
   * Stamps `applyMode` onto every company memory.
   *
   * Company memory had eight categories and none of them changed what the model
   * saw. Two of them were really saying "this should apply to every answer" —
   * tone and boundary — and those were the ones the old keyword lookup was
   * least likely to surface. This records that distinction as the field the
   * runtime now reads.
   */
  "2026-07-26-company-memory-apply-mode": async (ctx, cursor, batchSize) => {
    const page = await ctx.db.query("companyMemories").paginate({ cursor, numItems: batchSize });
    let updated = 0;

    for (const memory of page.page) {
      if (memory.applyMode !== undefined) continue;
      await ctx.db.patch(memory._id, { applyMode: companyCategoryToApplyMode(memory.category) });
      updated += 1;
    }

    return {
      cursor: page.continueCursor,
      isDone: page.isDone,
      processed: page.page.length,
      updated,
    };
  },

  /**
   * The same for agent memory, whose four kinds carried the same unused
   * distinction: INSTRUCTION and PREFERENCE described how the agent should
   * behave throughout, FACT and SUMMARY described something to look up.
   */
  "2026-07-26-agent-memory-apply-mode": async (ctx, cursor, batchSize) => {
    const page = await ctx.db.query("agentMemories").paginate({ cursor, numItems: batchSize });
    let updated = 0;

    for (const memory of page.page) {
      if (memory.applyMode !== undefined) continue;
      await ctx.db.patch(memory._id, { applyMode: agentKindToApplyMode(memory.kind) });
      updated += 1;
    }

    return {
      cursor: page.continueCursor,
      isDone: page.isDone,
      processed: page.page.length,
      updated,
    };
  },
};

export function getRegisteredMigrationNames() {
  return Object.keys(MIGRATIONS).sort();
}

export const run = internalMutation({
  args: {
    name: v.string(),
    batchSize: v.optional(v.number()),
    /** Re-run a migration that already completed. Use deliberately. */
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (!MIGRATIONS[args.name]) {
      throw new Error(
        `Unknown migration "${args.name}". Registered: ${getRegisteredMigrationNames().join(", ") || "(none)"}`,
      );
    }

    const existing = await ctx.db
      .query("dataMigrations")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();

    if (existing && !args.force) {
      if (existing.status === "COMPLETED") {
        return { migrationId: existing._id, status: "COMPLETED" as const, alreadyComplete: true };
      }
      if (existing.status === "RUNNING") {
        return { migrationId: existing._id, status: "RUNNING" as const, alreadyComplete: false };
      }
    }

    const now = Date.now();
    // A forced or retried run restarts from the beginning; migrations are
    // idempotent, so re-examining already-migrated rows is safe.
    const migrationId = existing
      ? existing._id
      : await ctx.db.insert("dataMigrations", {
          name: args.name,
          status: "RUNNING",
          processed: 0,
          updated: 0,
          batches: 0,
          startedAt: now,
          updatedAt: now,
        });

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "RUNNING",
        cursor: undefined,
        processed: 0,
        updated: 0,
        batches: 0,
        startedAt: now,
        updatedAt: now,
        completedAt: undefined,
        error: undefined,
      });
    }

    await ctx.scheduler.runAfter(0, internal.dataMigrations.processBatch, {
      migrationId,
      batchSize: args.batchSize ?? DEFAULT_BATCH_SIZE,
    });

    return { migrationId, status: "RUNNING" as const, alreadyComplete: false };
  },
});

export const processBatch = internalMutation({
  args: {
    migrationId: v.id("dataMigrations"),
    batchSize: v.number(),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.migrationId);
    if (!record) return;
    // Someone may have marked it failed or complete between batches.
    if (record.status !== "RUNNING") return;

    const runner = MIGRATIONS[record.name];
    if (!runner) {
      await ctx.db.patch(record._id, {
        status: "FAILED",
        error: `Migration "${record.name}" is no longer registered.`,
        updatedAt: Date.now(),
      });
      return;
    }

    if (record.batches >= MAX_BATCHES) {
      await ctx.db.patch(record._id, {
        status: "FAILED",
        error: `Exceeded ${MAX_BATCHES} batches without completing.`,
        updatedAt: Date.now(),
      });
      return;
    }

    let result: MigrationBatchResult;
    try {
      result = await runner(ctx, record.cursor ?? null, args.batchSize);
    } catch (error) {
      // The thrown batch is rolled back by Convex; the cursor still points at
      // the start of it, so a retry resumes from the same place.
      await ctx.db.patch(record._id, {
        status: "FAILED",
        error: error instanceof Error ? error.message : "Unknown migration error",
        updatedAt: Date.now(),
      });
      return;
    }

    const now = Date.now();
    const processed = record.processed + result.processed;
    const updated = record.updated + result.updated;
    const batches = record.batches + 1;

    if (result.isDone) {
      await ctx.db.patch(record._id, {
        status: "COMPLETED",
        cursor: undefined,
        processed,
        updated,
        batches,
        updatedAt: now,
        completedAt: now,
      });
      return;
    }

    await ctx.db.patch(record._id, {
      cursor: result.cursor ?? undefined,
      processed,
      updated,
      batches,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.dataMigrations.processBatch, {
      migrationId: record._id,
      batchSize: args.batchSize,
    });
  },
});

// Declared with `superAdminQuery` rather than `query` + a guard call, so the
// role check cannot be omitted and authzEnforcement.test.ts can verify it
// structurally. See convex/tenantFunctions.ts.
export const getStatus = superAdminQuery({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("dataMigrations")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();
  },
});

export const listStatus = superAdminQuery({
  args: {},
  handler: async (ctx) => {
    const applied = await ctx.db.query("dataMigrations").take(1000);
    const appliedByName = new Map(applied.map((record) => [record.name, record]));

    // Registered-but-never-run migrations are the interesting ones during a
    // release, so report them rather than only what has already executed.
    return getRegisteredMigrationNames().map((name) => ({
      name,
      status: appliedByName.get(name)?.status ?? "NOT_RUN",
      processed: appliedByName.get(name)?.processed ?? 0,
      updated: appliedByName.get(name)?.updated ?? 0,
      completedAt: appliedByName.get(name)?.completedAt,
      error: appliedByName.get(name)?.error,
    }));
  },
});
