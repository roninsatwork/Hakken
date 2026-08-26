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
import schema from "./schema";
import { aggregateDailySnapshots } from "./analyticsSnapshotAggregation";
import type { Doc, Id } from "./_generated/dataModel";
import { MODEL_CATALOG_LIMIT } from "./aiModelService";

type SystemAgentId = "system_assistant";
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

/**
 * How many of the day's interactions one page carries.
 *
 * Small enough that a page is a cheap query, large enough that an ordinary day
 * is a handful of round trips rather than hundreds.
 */
const SNAPSHOT_DAY_PAGE_SIZE = 500;

/**
 * The point at which the generator gives up rather than exhaust the action.
 *
 * Paging removed the old 10,000 ceiling that silently recorded a busy day short.
 * This one is different in kind: it is far above any plausible day, and reaching
 * it refuses the day loudly rather than writing a number known to be incomplete.
 * A missing snapshot is reported by the analytics health check; a wrong one is
 * invisible for ever.
 */
const SNAPSHOT_DAY_HARD_CEILING = 250000;

function resolveSnapshotWindow(targetDateStr: string | undefined) {
  if (targetDateStr) {
    const parts = targetDateStr.split("-");
    const d = new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
    const startTs = d.getTime();
    return { startTs, endTs: startTs + 24 * 60 * 60 * 1000 - 1, dateString: targetDateStr };
  }
  const now = new Date();
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const startTs = yesterday.getTime();
  return {
    startTs,
    endTs: startTs + 24 * 60 * 60 * 1000 - 1,
    dateString: yesterday.toISOString().split("T")[0],
  };
}

export const snapshotDateAlreadyGenerated = internalQuery({
  args: { dateString: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("analyticsDailySnapshots")
      .withIndex("by_date", (q) => q.eq("date", args.dateString))
      .first();
    return existing !== null;
  },
});

export const readSnapshotModelCatalogue = internalQuery({
  args: {},
  handler: async (ctx) => {
    // One row past the cap, so a full read is distinguishable from a truncated
    // one. Everything below prices a day from this catalogue and writes the
    // cost into a snapshot that is never recomputed — so a model missing from
    // a short read is not a gap, it is a wrong number stored for ever, priced
    // at the default rate. `aiModels.ts` already marks its own rollup partial
    // for the same reason; the write path did not.
    const models = await ctx.db.query("aiModels").take(MODEL_CATALOG_LIMIT + 1);

    return {
      models: models.slice(0, MODEL_CATALOG_LIMIT),
      isPartial: models.length > MODEL_CATALOG_LIMIT,
    };
  },
});

export const readDayInteractionsPage = internalQuery({
  args: {
    startTs: v.number(),
    endTs: v.number(),
    source: v.union(v.literal("messages"), v.literal("transactions")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    if (args.source === "messages") {
      const page = await ctx.db
        .query("messages")
        .withIndex("by_role_created", (q) => q.eq("role", "assistant").gte("createdAt", args.startTs))
        .filter((q) => q.lte(q.field("createdAt"), args.endTs))
        .paginate(args.paginationOpts);

      const interactions = await Promise.all(
        page.page.map(async (m) => {
          const thread = await ctx.db.get(m.threadId);
          return {
            userId: m.userId ?? thread?.userId,
            widgetId: m.widgetId ?? thread?.widgetId,
            companyId: m.companyId ?? thread?.companyId,
            agentId: m.agentId ?? thread?.agentId ?? SYSTEM_AGENT_ID,
            inputTokens: m.inputTokens || 0,
            outputTokens: m.outputTokens || 0,
            modelUsed: m.modelUsed,
          };
        })
      );
      return { interactions, isDone: page.isDone, continueCursor: page.continueCursor };
    }

    const page = await ctx.db
      .query("agentTransactions")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", args.startTs))
      .filter((q) => q.lte(q.field("createdAt"), args.endTs))
      .paginate(args.paginationOpts);

    const interactions = page.page.map((t) => ({
      userId: t.userId,
      widgetId: undefined,
      companyId: t.companyId,
      agentId: t.agentId,
      inputTokens: t.inputTokens || 0,
      outputTokens: t.outputTokens || 0,
      modelUsed: t.modelUsed,
    }));
    return { interactions, isDone: page.isDone, continueCursor: page.continueCursor };
  },
});

export const readSnapshotJoins = internalQuery({
  args: {
    userIds: v.array(v.id("users")),
    companyIds: v.array(v.id("companies")),
    agentIds: v.array(v.id("agents")),
  },
  handler: async (ctx, args) => {
    const users = (await Promise.all(args.userIds.map((id) => ctx.db.get(id)))).filter(
      (user): user is Doc<"users"> => user !== null
    );

    const companyIds = new Set<Id<"companies">>(args.companyIds);
    for (const user of users) {
      if (user.companyId) companyIds.add(user.companyId);
    }

    const companies = (await Promise.all([...companyIds].map((id) => ctx.db.get(id)))).filter(
      (company): company is Doc<"companies"> => company !== null
    );
    const agents = (await Promise.all(args.agentIds.map((id) => ctx.db.get(id)))).filter(
      (agent): agent is Doc<"agents"> => agent !== null
    );

    return { users, companies, agents };
  },
});

export const writeDailySnapshots = internalMutation({
  args: { rows: v.array(schema.tables.analyticsDailySnapshots.validator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      await ctx.db.insert("analyticsDailySnapshots", row);
    }
    return null;
  },
});

export const generateDailySnapshots = internalAction({
  args: {
    targetDateStr: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { startTs, endTs, dateString } = resolveSnapshotWindow(args.targetDateStr);

    const alreadyGenerated = await ctx.runQuery(
      internal.analyticsSnapshots.snapshotDateAlreadyGenerated,
      { dateString }
    );
    if (alreadyGenerated) {
      console.log(`[Analytics] Snapshots for ${dateString} already exist. Skipping.`);
      return;
    }

    const catalogue = await ctx.runQuery(internal.analyticsSnapshots.readSnapshotModelCatalogue, {});

    // Refused for the same reason the day ceiling refuses: a snapshot is
    // written once and read for ever. Priced from a short catalogue, every
    // model past the cap silently falls back to the default rate, and the
    // wrong cost is indistinguishable from a right one the moment it lands.
    // A missing day is reported by the analytics health check; a mispriced one
    // is not reported by anything.
    if (catalogue.isPartial) {
      throw appError(
        "INVALID_INPUT",
        `Analytics for ${dateString} were not written: the model catalogue is larger than ${MODEL_CATALOG_LIMIT} rows, so any cost this run recorded would price the models it could not read at the default rate.`
      );
    }

    const { modelMap, defaultModelId } = buildModelCostContext(catalogue.models);

    const rawInteractions: Array<{
      userId?: Id<"users">;
      widgetId?: Id<"widgets">;
      companyId?: Id<"companies">;
      agentId?: Id<"agents"> | SystemAgentId;
      inputTokens: number;
      outputTokens: number;
      modelUsed?: string;
    }> = [];

    for (const source of ["messages", "transactions"] as const) {
      let cursor: string | null = null;
      for (;;) {
        const page: {
          interactions: typeof rawInteractions;
          isDone: boolean;
          continueCursor: string;
        } = await ctx.runQuery(internal.analyticsSnapshots.readDayInteractionsPage, {
          startTs,
          endTs,
          source,
          paginationOpts: { numItems: SNAPSHOT_DAY_PAGE_SIZE, cursor },
        });
        rawInteractions.push(...page.interactions);

        if (rawInteractions.length > SNAPSHOT_DAY_HARD_CEILING) {
          throw appError(
            "INVALID_INPUT",
            `Analytics for ${dateString} were not written: the day holds more than ${SNAPSHOT_DAY_HARD_CEILING} interactions, which is more than one run can total. The day is left without a snapshot, which the analytics health check reports, rather than recorded short.`
          );
        }

        if (page.isDone) break;
        cursor = page.continueCursor;
      }
    }

    if (rawInteractions.length === 0) {
      console.log(`[Analytics] No activity on ${dateString}. Creating empty global snapshot.`);
      await ctx.runMutation(internal.analyticsSnapshots.writeDailySnapshots, {
        rows: [
          {
            date: dateString,
            type: "global" as const,
            metrics: { totalMessages: 0, totalInputTokens: 0, totalOutputTokens: 0, costGBP: 0, activeUsersCount: 0 },
            uniqueUserIds: [],
          },
        ],
      });
      return;
    }

    const userIds = new Set<Id<"users">>();
    const companyIds = new Set<Id<"companies">>();
    const agentIds = new Set<Id<"agents">>();
    for (const interaction of rawInteractions) {
      if (interaction.userId) userIds.add(interaction.userId);
      if (interaction.companyId) companyIds.add(interaction.companyId);
      if (interaction.agentId && interaction.agentId !== SYSTEM_AGENT_ID) {
        agentIds.add(interaction.agentId as Id<"agents">);
      }
    }

    const joins = await ctx.runQuery(internal.analyticsSnapshots.readSnapshotJoins, {
      userIds: [...userIds],
      companyIds: [...companyIds],
      agentIds: [...agentIds],
    });

    const unifiedInteractions = rawInteractions.map((interaction) => ({
      ...interaction,
      modelUsed: interaction.modelUsed || defaultModelId,
    }));

    const { globalRow, companyRows, userRows } = aggregateDailySnapshots(
      unifiedInteractions,
      {
        userMap: new Map(joins.users.map((user) => [user._id, user])),
        companyMap: new Map(joins.companies.map((company) => [company._id, company])),
        agentMap: new Map(joins.agents.map((agent) => [agent._id, agent])),
      },
      modelMap,
      dateString
    );

    await ctx.runMutation(internal.analyticsSnapshots.writeDailySnapshots, {
      rows: [globalRow, ...companyRows, ...userRows],
    });

    console.log(`[Analytics] Successfully generated snapshots for ${dateString}`);
  },
});

// Migration helper to seed past data
export const seedHistoricalSnapshots = internalAction({
    args: { daysBack: v.number() },
    handler: async (ctx, args) => {
        const now = new Date();
        for (let i = args.daysBack; i >= 1; i--) {
            const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
            const dateStr = target.toISOString().split("T")[0];
            await ctx.runAction(internal.analyticsSnapshots.generateDailySnapshots, { targetDateStr: dateStr });
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
