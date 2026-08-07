import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getActiveCompanyId } from "./authz";
import { governanceQuery } from "./tenantFunctions";
import {
  DAY_MS,
  bucketRunsByDay,
  rankBusiestSystems,
  runsPerDay,
  summariseOversight,
  summariseSideEffects,
  type BusiestSystem,
  type DayBucket,
  type OversightSummary,
  type SideEffectSummary,
} from "./governanceActivityService";

/**
 * What the AI has been doing lately.
 *
 * Separate from `governanceDashboard` because the two answer different
 * questions and change at different rates: the checks are the state of the
 * estate and barely move, while this is a window the reader slides. Splitting
 * them means changing the range re-reads the activity and leaves the checks
 * alone.
 *
 * Everything is read through an index bounded by the window rather than scanned
 * and filtered, so asking for ninety days costs ninety days.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */

/** Systems, and the agents behind the counts. Matches the register's own ceiling. */
const SCAN_LIMIT = 500;

/**
 * How many rows one status may contribute.
 *
 * Reached, the screen says so rather than quietly drawing a shorter history —
 * a truncated chart on a compliance page is a claim about the estate that
 * happens to be false.
 */
const PER_STATUS_LIMIT = 2000;

const RUN_STATUSES = ["QUEUED", "RUNNING", "PENDING_APPROVAL", "SUCCESS", "FAILED", "CANCELLED"] as const;

const TOOL_CALL_STATUSES = [
  "PENDING",
  "APPROVAL_REQUIRED",
  "SUCCESS",
  "NOT_IMPLEMENTED",
  "FAILED",
  "DENIED",
  "CANCELLED",
] as const;

/** Answered, plus anything still waiting however long ago it was raised. */
const DECIDED_STATUSES = ["APPROVED", "REJECTED", "EXPIRED", "CANCELLED"] as const;

export type GovernanceActivity = {
  days: number;
  /** Runs per day, every day present, split by what became of them. */
  timeline: DayBucket[];
  runs: { total: number; perDay: number; unfinished: number };
  actions: SideEffectSummary;
  oversight: OversightSummary;
  busiest: BusiestSystem[];
  /** Set when a read hit its ceiling and the figures below are a floor, not a total. */
  truncated: boolean;
};

export const getGovernanceActivity = governanceQuery({
  args: { days: v.number() },
  handler: async (ctx, args): Promise<GovernanceActivity> => {
    // Clamped rather than trusted. The range arrives from a control offering
    // three values, and a hand-typed one should not be able to widen the scan.
    const days = Math.min(Math.max(Math.round(args.days), 1), 90);
    const now = Date.now();
    const since = now - days * DAY_MS;

    const platformWide = ctx.user.role === "SUPER_ADMIN" || ctx.user.role === "READ_ONLY";
    const scopeCompanyId = platformWide ? undefined : getActiveCompanyId(ctx.user);

    // The register's rule, kept identical on purpose: a row belonging to nobody
    // in particular is in everybody's scope, and the two screens disagreeing
    // about that is how a dashboard starts contradicting the records under it.
    const withinScope = <T extends { companyId?: Id<"companies"> }>(row: T) =>
      !scopeCompanyId || row.companyId === scopeCompanyId || row.companyId === undefined;

    let truncated = false;
    const capped = <T>(rows: T[]) => {
      if (rows.length >= PER_STATUS_LIMIT) truncated = true;
      return rows;
    };

    const [runsByStatus, callsByStatus, decidedApprovals, pendingApprovals, agents] = await Promise.all([
      Promise.all(
        RUN_STATUSES.map((status) =>
          ctx.db
            .query("agentRuns")
            .withIndex("by_status_started", (q) => q.eq("status", status).gte("startedAt", since))
            .take(PER_STATUS_LIMIT)
            .then(capped),
        ),
      ),
      Promise.all(
        TOOL_CALL_STATUSES.map((status) =>
          ctx.db
            .query("agentToolCalls")
            .withIndex("by_status_started", (q) => q.eq("status", status).gte("startedAt", since))
            .take(PER_STATUS_LIMIT)
            .then(capped),
        ),
      ),
      Promise.all(
        DECIDED_STATUSES.map((status) =>
          ctx.db
            .query("agentRunApprovals")
            .withIndex("by_status_requested", (q) => q.eq("status", status).gte("requestedAt", since))
            .take(PER_STATUS_LIMIT)
            .then(capped),
        ),
      ),
      // Not bounded by the window. An approval raised two months ago and still
      // unanswered is the single most damning thing this screen can report, and
      // a window that hid it would be flattering the platform.
      ctx.db
        .query("agentRunApprovals")
        .withIndex("by_status_requested", (q) => q.eq("status", "PENDING"))
        .take(PER_STATUS_LIMIT),
      ctx.db.query("agents").take(SCAN_LIMIT),
    ]);

    const runs = runsByStatus.flat().filter(withinScope);
    const calls = callsByStatus.flat().filter(withinScope);
    const approvals = [...decidedApprovals.flat(), ...pendingApprovals].filter(withinScope);

    /**
     * Which runs a person actually had to decide on.
     *
     * Derived from the approvals rather than from run status, because a run that
     * parked and was then let through ends its life as an ordinary success —
     * counting statuses alone would report that oversight had happened nought
     * times on a platform where it happens daily.
     */
    const neededAPerson = new Set(approvals.map((approval) => approval.runId as string));

    const timeline = bucketRunsByDay(
      runs.map((run) => ({ id: run._id as string, startedAt: run.startedAt, status: run.status })),
      neededAPerson,
      now,
      days,
    );

    const runsById = new Map<string, number>();
    for (const run of runs) {
      const key = run.agentId as string;
      runsById.set(key, (runsById.get(key) ?? 0) + 1);
    }

    const busiest = rankBusiestSystems(
      agents.filter(withinScope).map((agent) => ({
        id: agent._id as string,
        name: agent.name,
        risk: agent.riskLevel ?? "UNRATED",
      })),
      runsById,
    );

    return {
      days,
      timeline,
      runs: {
        total: runs.length,
        perDay: runsPerDay(runs.length, days),
        unfinished: runs.filter((run) => run.status === "FAILED" || run.status === "CANCELLED").length,
      },
      actions: summariseSideEffects(calls.map((call) => call.sideEffectLevel)),
      oversight: summariseOversight(approvals),
      busiest,
      truncated,
    };
  },
});
