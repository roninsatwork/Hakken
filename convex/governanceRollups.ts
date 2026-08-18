import { internalMutation, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { DAY_MS, dayKey } from "./governanceActivityService";
import {
  dayKeysBack,
  foldEstateRows,
  foldWindowIntoBuckets,
  type DayBucketRow,
} from "./governanceRollupService";
import type { SideEffectLevel } from "./conformanceService";
import {
  toAssistantEntry,
  toWidgetEntry,
  toWorkflowEntry,
} from "./governanceRegisterService";

/**
 * The rebuild behind the governance screens.
 *
 * Recomputes the last two days of day buckets and the estate snapshot, on the
 * cron beside the skills rollup. Two days rather than one because a run that
 * starts before midnight settles after it, and the stall recovery job can take
 * a few minutes to resolve a dead run; everything older is frozen, so the work
 * per tick is bounded and constant no matter how much history exists.
 *
 * Rebuild-and-set rather than increment-at-write, deliberately: runs are
 * inserted in at least six places and their status patched in a dozen more,
 * and a tally incremented at each of those sites is wrong the first time
 * somebody adds another and forgets. A job that reads the tables cannot miss
 * a write site. A number that is quietly wrong is worse than a number that is
 * slow, and wrong-but-fast is the one failure this design must not have.
 */

/** Days recomputed each tick. */
const RECENT_DAYS = 2;

/**
 * Ceiling on one window read. Two days of normal traffic is a few hundred
 * rows; this is a runaway backstop, and hitting it marks the buckets truncated
 * rather than silently under-counting.
 */
const WINDOW_ROW_LIMIT = 8000;

/** The estate reads keep the old query's cap, and the same honesty flag the skills rollup uses. */
const ESTATE_LIMIT = 500;

/** How many days of buckets feed conformance — what each assistant did "recently". */
const OBSERVED_DAYS = 7;

const APPROVAL_STATUSES = ["PENDING", "APPROVED", "REJECTED", "EXPIRED", "CANCELLED"] as const;

export const rebuildGovernanceRollups = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const windowStart = Date.parse(`${dayKey(now - (RECENT_DAYS - 1) * DAY_MS)}T00:00:00.000Z`);

    const [runs, calls, approvalsByStatus, agents, widgets, workflows] = await Promise.all([
      ctx.db
        .query("agentRuns")
        .withIndex("by_started", (q) => q.gte("startedAt", windowStart))
        .take(WINDOW_ROW_LIMIT),
      ctx.db
        .query("agentToolCalls")
        .withIndex("by_started", (q) => q.gte("startedAt", windowStart))
        .take(WINDOW_ROW_LIMIT),
      Promise.all(
        APPROVAL_STATUSES.map((status) =>
          ctx.db
            .query("agentRunApprovals")
            .withIndex("by_status_requested", (q) => q.eq("status", status).gte("requestedAt", windowStart))
            .take(WINDOW_ROW_LIMIT),
        ),
      ),
      ctx.db.query("agents").take(ESTATE_LIMIT),
      ctx.db.query("widgets").take(ESTATE_LIMIT),
      ctx.db.query("workflows").take(ESTATE_LIMIT),
    ]);

    const truncated = runs.length >= WINDOW_ROW_LIMIT || calls.length >= WINDOW_ROW_LIMIT;
    const neededAPerson = new Set(
      approvalsByStatus.flat().map((approval) => approval.runId as string),
    );
    const agentsById = new Map(
      agents.map((agent) => [
        agent._id as string,
        { id: agent._id as string, name: agent.name, risk: agent.riskLevel ?? "UNRATED" },
      ]),
    );

    const buckets = foldWindowIntoBuckets({
      runs: runs.map((run) => ({
        id: run._id as string,
        companyId: run.companyId as string | undefined,
        agentId: run.agentId as string,
        startedAt: run.startedAt,
        status: run.status,
      })),
      calls: calls.map((call) => ({
        companyId: call.companyId as string | undefined,
        agentId: call.agentId as string,
        startedAt: call.startedAt,
        sideEffectLevel: call.sideEffectLevel,
      })),
      neededAPerson,
      agentsById,
      truncated,
    });

    // Every recomputed day is written whole, including scopes that went quiet:
    // a bucket left over from a day this window no longer contains anything
    // for must be zeroed, or a deleted run would live on in the counts.
    const recentDates = dayKeysBack(now, RECENT_DAYS);
    for (const date of recentDates) {
      const existing = await ctx.db
        .query("governanceDayRollups")
        .withIndex("by_date", (q) => q.eq("date", date))
        .collect();
      const computed = new Map(
        buckets.filter((bucket) => bucket.date === date).map((bucket) => [bucket.companyKey, bucket]),
      );

      for (const row of existing) {
        const bucket = computed.get(row.companyKey);
        if (bucket) {
          await ctx.db.patch(row._id, { ...bucket, computedAt: now });
          computed.delete(row.companyKey);
        } else {
          await ctx.db.delete(row._id);
        }
      }
      for (const bucket of computed.values()) {
        await ctx.db.insert("governanceDayRollups", { ...bucket, computedAt: now });
      }
    }

    // Conformance reads what each assistant did over the last week — from the
    // buckets, so it survives the purge of the raw calls.
    const observedSince = dayKey(now - (OBSERVED_DAYS - 1) * DAY_MS);
    const observedBuckets = await ctx.db
      .query("governanceDayRollups")
      .withIndex("by_date", (q) => q.gte("date", observedSince))
      .collect();
    const observedByAgent = new Map<string, SideEffectLevel[]>();
    for (const bucket of observedBuckets) {
      for (const entry of bucket.perAgent) {
        const seen = observedByAgent.get(entry.agentId) ?? [];
        for (const level of entry.observed) {
          if (!seen.includes(level as SideEffectLevel)) seen.push(level as SideEffectLevel);
        }
        observedByAgent.set(entry.agentId, seen);
      }
    }

    const isPartial =
      agents.length >= ESTATE_LIMIT || widgets.length >= ESTATE_LIMIT || workflows.length >= ESTATE_LIMIT;

    const agentById = new Map(agents.map((agent) => [agent._id as string, agent]));
    const entries = [
      ...agents.map((agent) => ({
        ...toAssistantEntry(agent, agent.ownerId ? "recorded" : "", agent.updatedAt),
        companyId: agent.companyId as string | undefined,
      })),
      ...widgets.map((widget) => ({
        ...toWidgetEntry(
          widget,
          widget.createdBy ? "recorded" : "",
          widget.agentId ? (agentById.get(widget.agentId as string) ?? null) : null,
        ),
        companyId: widget.companyId as string | undefined,
      })),
      ...workflows.map((workflow) => ({
        ...toWorkflowEntry(workflow, workflow.createdBy ? "recorded" : ""),
        companyId: workflow.companyId as string | undefined,
      })),
    ];

    const estateRows = foldEstateRows({
      entries,
      agents: agents.map((agent) => ({
        id: agent._id as string,
        companyId: agent.companyId as string | undefined,
        name: agent.name,
        riskLevel: agent.riskLevel,
      })),
      observedByAgent,
      isPartial,
    });

    const existingEstate = await ctx.db.query("governanceEstateRollups").collect();
    const computedByKey = new Map(estateRows.map((row) => [row.companyKey, row]));
    for (const row of existingEstate) {
      const computed = computedByKey.get(row.companyKey);
      if (computed) {
        await ctx.db.patch(row._id, { ...computed, computedAt: now });
        computedByKey.delete(row.companyKey);
      } else {
        await ctx.db.delete(row._id);
      }
    }
    for (const row of computedByKey.values()) {
      await ctx.db.insert("governanceEstateRollups", { ...row, computedAt: now });
    }

    return {
      buckets: buckets.length,
      estateRows: estateRows.length,
      truncated,
      isPartial,
    };
  },
});

/** The read the screens share: a window of buckets, scoped. */
export async function readBucketsForWindow(
  ctx: Pick<QueryCtx, "db">,
  now: number,
  days: number,
  scopeKeys: string[] | undefined,
): Promise<Array<Doc<"governanceDayRollups">>> {
  const since = dayKey(now - (days - 1) * DAY_MS);
  const rows = await ctx.db
    .query("governanceDayRollups")
    .withIndex("by_date", (q) => q.gte("date", since))
    .collect();

  return scopeKeys ? rows.filter((row) => scopeKeys.includes(row.companyKey)) : rows;
}
