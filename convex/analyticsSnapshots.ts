/**
 * Daily analytics snapshots: the nightly rollup (`generateDailySnapshots`),
 * its backfill/repair and validation companions, and the operator-run
 * seed/wipe migrations. Split out of the old `convex/analyticsCron.ts`
 * grab-bag on 2026-08-21 (foundation-quality plan, phase 3); the health
 * queries live in `systemHealth.ts` and alerting in `platformAlerts.ts`.
 */

import { internalMutation, internalAction, internalQuery } from "./_generated/server";
import { appError } from "./utils/appError";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { buildModelCostContext } from "./analyticsService";
import { internal } from "./_generated/api";
import { aggregateDailySnapshots } from "./analyticsSnapshotAggregation";
import type { Doc, Id } from "./_generated/dataModel";
import { MODEL_CATALOG_LIMIT } from "./aiModelService";

/**
 * The most interactions one day's snapshot will read in a single pass.
 *
 * Reading exactly this many and aggregating whatever came back is what made a
 * busy day record a permanently wrong total: the snapshot is written once,
 * nothing recomputes it, and no screen can tell a truncated total from a real
 * one. So the generator reads one past the ceiling and refuses the day rather
 * than writing a number it knows is short. A missing snapshot is visible —
 * the analytics health check counts snapshots per date and reports the gap —
 * which a wrong one never is.
 */
const SNAPSHOT_DAY_INTERACTION_LIMIT = 10000;

type SystemAgentId = "system_assistant";
type SnapshotInteraction = {
  userId?: Id<"users">;
  widgetId?: Id<"widgets">;
  companyId?: Id<"companies">;
  agentId?: Id<"agents"> | SystemAgentId;
  inputTokens: number;
  outputTokens: number;
  modelUsed: string;
};
export type MessageAnalyticsPatch = {
  companyId?: Id<"companies">;
  userId?: Id<"users">;
  agentId?: Id<"agents">;
  widgetId?: Id<"widgets">;
  analyticsDimensionsVersion?: number;
};
const SYSTEM_AGENT_ID: SystemAgentId = "system_assistant";
export function getMissingMessageAnalyticsPatch(message: Doc<"messages">, thread: Doc<"threads">): MessageAnalyticsPatch {
  const patch: MessageAnalyticsPatch = {};

  if (message.companyId === undefined && thread.companyId !== undefined) patch.companyId = thread.companyId;
  if (message.userId === undefined && thread.userId !== undefined) patch.userId = thread.userId;
  if (message.agentId === undefined && thread.agentId !== undefined) patch.agentId = thread.agentId;
  if (message.widgetId === undefined && thread.widgetId !== undefined) patch.widgetId = thread.widgetId;
  if (message.analyticsDimensionsVersion === undefined) patch.analyticsDimensionsVersion = 1;

  return patch;
}

export function hasPatchValues(patch: MessageAnalyticsPatch) {
  return Object.keys(patch).length > 0;
}

export function hasMessageAnalyticsMismatch(message: Doc<"messages">, thread: Doc<"threads">) {
  return (
    (message.companyId !== undefined && thread.companyId !== undefined && message.companyId !== thread.companyId) ||
    (message.userId !== undefined && thread.userId !== undefined && message.userId !== thread.userId) ||
    (message.agentId !== undefined && thread.agentId !== undefined && message.agentId !== thread.agentId) ||
    (message.widgetId !== undefined && thread.widgetId !== undefined && message.widgetId !== thread.widgetId)
  );
}

export const backfillMessageAnalyticsDimensions = internalMutation({
  args: {
    paginationOpts: paginationOptsValidator,
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("messages")
      .withIndex("by_createdAt")
      .order("asc")
      .paginate(args.paginationOpts);

    let patched = 0;
    let patchCandidates = 0;
    let skippedAlreadyComplete = 0;
    let skippedMissingThread = 0;
    let mismatched = 0;

    for (const message of page.page) {
      const thread = await ctx.db.get(message.threadId);
      if (!thread) {
        skippedMissingThread++;
        continue;
      }

      if (hasMessageAnalyticsMismatch(message, thread)) {
        mismatched++;
      }

      const patch = getMissingMessageAnalyticsPatch(message, thread);
      if (!hasPatchValues(patch)) {
        skippedAlreadyComplete++;
        continue;
      }

      patchCandidates++;
      if (!args.dryRun) {
        await ctx.db.patch(message._id, patch);
        patched++;
      }
    }

    return {
      scanned: page.page.length,
      patchCandidates,
      patched,
      skippedAlreadyComplete,
      skippedMissingThread,
      mismatched,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
      dryRun: args.dryRun === true,
    };
  },
});

export const validateMessageAnalyticsDimensions = internalQuery({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("messages")
      .withIndex("by_createdAt")
      .order("asc")
      .paginate(args.paginationOpts);

    let missingDimensions = 0;
    let missingThreads = 0;
    let mismatched = 0;
    const examples: string[] = [];

    for (const message of page.page) {
      const thread = await ctx.db.get(message.threadId);
      if (!thread) {
        missingThreads++;
        if (examples.length < 20) examples.push(message._id);
        continue;
      }

      const patch = getMissingMessageAnalyticsPatch(message, thread);
      const hasMissingDimensions = hasPatchValues(patch);
      const hasMismatch = hasMessageAnalyticsMismatch(message, thread);

      if (hasMissingDimensions) missingDimensions++;
      if (hasMismatch) mismatched++;
      if ((hasMissingDimensions || hasMismatch) && examples.length < 20) {
        examples.push(message._id);
      }
    }

    return {
      scanned: page.page.length,
      missingDimensions,
      missingThreads,
      mismatched,
      examples,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export const generateDailySnapshots = internalMutation({
  args: { 
    targetDateStr: v.optional(v.string()), // "YYYY-MM-DD", defaults to yesterday
  },
  handler: async (ctx, args) => {
    const now = new Date();
    
    // Determine the target bounds. Default: Yesterday 00:00:00 to 23:59:59 UTC
    let startTs: number;
    let endTs: number;
    let dateString: string;

    if (args.targetDateStr) {
      const parts = args.targetDateStr.split("-");
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(Date.UTC(year, month, day));
      startTs = d.getTime();
      endTs = startTs + (24 * 60 * 60 * 1000) - 1;
      dateString = args.targetDateStr;
    } else {
      const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
      startTs = yesterday.getTime();
      endTs = startTs + (24 * 60 * 60 * 1000) - 1;
      dateString = yesterday.toISOString().split("T")[0];
    }

    // Guard: Prevent duplicate snapshot generation for the same date
    const existing = await ctx.db.query("analyticsDailySnapshots")
        .withIndex("by_date", q => q.eq("date", dateString))
        .first();
    if (existing) {
        console.log(`[Analytics] Snapshots for ${dateString} already exist. Skipping.`);
        return;
    }

    const aiModelsFetch = await ctx.db.query("aiModels").take(MODEL_CATALOG_LIMIT);
    const { modelMap, defaultModelId } = buildModelCostContext(aiModelsFetch);

    // Fetch all interaction data for the 24h window
    const rawMessages = await ctx.db.query("messages")
      .withIndex("by_role_created", q => q.eq("role", "assistant").gte("createdAt", startTs))
      .filter(q => q.lte(q.field("createdAt"), endTs))
      .take(SNAPSHOT_DAY_INTERACTION_LIMIT + 1);

    const agentTxs = await ctx.db.query("agentTransactions")
      .withIndex("by_createdAt", q => q.gte("createdAt", startTs))
      .filter(q => q.lte(q.field("createdAt"), endTs))
      .take(SNAPSHOT_DAY_INTERACTION_LIMIT + 1);

    if (
      rawMessages.length > SNAPSHOT_DAY_INTERACTION_LIMIT ||
      agentTxs.length > SNAPSHOT_DAY_INTERACTION_LIMIT
    ) {
      throw appError(
        "INVALID_INPUT",
        `Analytics for ${dateString} were not written: the day holds more than ${SNAPSHOT_DAY_INTERACTION_LIMIT} interactions, which is more than one pass can total accurately. The day is left without a snapshot, which the analytics health check reports, rather than recorded short.`
      );
    }

    if (rawMessages.length === 0 && agentTxs.length === 0) {
       console.log(`[Analytics] No activity on ${dateString}. Creating empty global snapshot.`);
       await ctx.db.insert("analyticsDailySnapshots", {
           date: dateString,
           type: "global",
           metrics: { totalMessages: 0, totalInputTokens: 0, totalOutputTokens: 0, costGBP: 0, activeUsersCount: 0 },
           uniqueUserIds: [],
       });
       return;
    }

    const threadMap = new Map<Id<"threads">, Doc<"threads"> | null>();
    for (const threadId of new Set(rawMessages.map((message) => message.threadId))) {
      threadMap.set(threadId, await ctx.db.get(threadId));
    }

    const observedUserIds = new Set<Id<"users">>();
    const observedCompanyIds = new Set<Id<"companies">>();
    const observedAgentIds = new Set<Id<"agents">>();

    rawMessages.forEach((message) => {
      const thread = threadMap.get(message.threadId);
      const userId = message.userId ?? thread?.userId;
      const companyId = message.companyId ?? thread?.companyId;
      const agentId = message.agentId ?? thread?.agentId;

      if (userId) observedUserIds.add(userId);
      if (companyId) observedCompanyIds.add(companyId);
      if (agentId) observedAgentIds.add(agentId);
    });

    agentTxs.forEach((transaction) => {
      if (transaction.userId) observedUserIds.add(transaction.userId);
      if (transaction.companyId) observedCompanyIds.add(transaction.companyId);
      if (transaction.agentId) observedAgentIds.add(transaction.agentId);
    });

    const userMap = new Map<Id<"users">, Doc<"users">>();
    for (const userId of observedUserIds) {
      const user = await ctx.db.get(userId);
      if (user) {
        userMap.set(userId, user);
        if (user.companyId) observedCompanyIds.add(user.companyId);
      }
    }

    const companyMap = new Map<Id<"companies">, Doc<"companies">>();
    for (const companyId of observedCompanyIds) {
      const company = await ctx.db.get(companyId);
      if (company) companyMap.set(companyId, company);
    }

    const agentMap = new Map<Id<"agents">, Doc<"agents">>();
    for (const agentId of observedAgentIds) {
      const agent = await ctx.db.get(agentId);
      if (agent) agentMap.set(agentId, agent);
    }

    const unifiedInteractions: SnapshotInteraction[] = [
       ...rawMessages.map(m => {
          const thread = threadMap.get(m.threadId);
          return {
          userId: m.userId ?? thread?.userId,
          widgetId: m.widgetId ?? thread?.widgetId,
          companyId: m.companyId ?? thread?.companyId,
          agentId: m.agentId ?? thread?.agentId ?? SYSTEM_AGENT_ID,
          inputTokens: m.inputTokens || 0,
          outputTokens: m.outputTokens || 0,
          modelUsed: m.modelUsed || defaultModelId,
       };
       }),
       ...agentTxs.map(t => ({
          userId: t.userId,
          widgetId: undefined,
          companyId: t.companyId,
          agentId: t.agentId,
          inputTokens: t.inputTokens || 0,
          outputTokens: t.outputTokens || 0,
          modelUsed: t.modelUsed || defaultModelId,
       }))
    ];

    const { globalRow, companyRows, userRows } = aggregateDailySnapshots(
      unifiedInteractions,
      { userMap, companyMap, agentMap },
      modelMap,
      dateString
    );

    await ctx.db.insert("analyticsDailySnapshots", globalRow);
    for (const row of companyRows) {
      await ctx.db.insert("analyticsDailySnapshots", row);
    }
    for (const row of userRows) {
      await ctx.db.insert("analyticsDailySnapshots", row);
    }

    console.log(`[Analytics] Successfully generated snapshots for ${dateString}`);
  }
});

// Migration helper to seed past data
export const seedHistoricalSnapshots = internalAction({
    args: { daysBack: v.number() },
    handler: async (ctx, args) => {
        const now = new Date();
        for (let i = args.daysBack; i >= 1; i--) {
            const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
            const dateStr = target.toISOString().split("T")[0];
            await ctx.runMutation(internal.analyticsSnapshots.generateDailySnapshots, { targetDateStr: dateStr });
            console.log(`Dispatched snapshot job for ${dateStr}`);
        }
    }
});

const SNAPSHOT_WIPE_BATCH_SIZE = 500;

export const wipeSnapshots = internalMutation({
    args: { deletedSoFar: v.optional(v.number()) },
    handler: async (ctx, args) => {
        const snaps = await ctx.db
            .query("analyticsDailySnapshots")
            .take(SNAPSHOT_WIPE_BATCH_SIZE);
        for (const s of snaps) {
            await ctx.db.delete(s._id);
        }

        const deleted = (args.deletedSoFar ?? 0) + snaps.length;
        if (snaps.length === SNAPSHOT_WIPE_BATCH_SIZE) {
            await ctx.scheduler.runAfter(0, internal.analyticsSnapshots.wipeSnapshots, {
                deletedSoFar: deleted,
            });
        }
        return deleted;
    }
});
