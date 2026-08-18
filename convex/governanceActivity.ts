import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getActiveCompanyId } from "./authz";
import { governanceQuery } from "./tenantFunctions";
import {
  DAY_MS,
  runsPerDay,
  summariseOversight,
  type BusiestSystem,
  type DayBucket,
  type OversightSummary,
  type SideEffectSummary,
} from "./governanceActivityService";
import { mergeBucketsForWindow, scopeKeysFor } from "./governanceRollupService";
import { readBucketsForWindow } from "./governanceRollups";

/**
 * What the AI has been doing lately.
 *
 * Separate from `governanceDashboard` because the two answer different
 * questions and change at different rates: the checks are the state of the
 * estate and barely move, while this is a window the reader slides. Splitting
 * them means changing the range re-reads the activity and leaves the checks
 * alone.
 *
 * The figures come from the day buckets the cron keeps (`governanceRollups`),
 * so asking for ninety days reads ninety days of small rows — see
 * docs/plans/active/governance-screens-read-a-summary-plan.md for why this
 * stopped being a live count.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */

/**
 * Ceiling on the approval reads, the one live fan-out this screen keeps.
 * Approvals are few — a human answers each one — so this is a runaway
 * backstop rather than a working limit.
 */
const PER_STATUS_LIMIT = 2000;

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

    /**
     * The window's figures come from the day buckets the cron keeps, not from
     * the raw tables. This used to be eighteen parallel reads of up to 2,000
     * rows each, re-run reactively whenever any agent did anything, and the
     * caps meant the figures were already a floor rather than a total. The
     * buckets are exact, and reading them is a handful of rows.
     *
     * Approvals stay live, as the plan decided: they are few, they are
     * indexed, and the median wait cannot be summed across buckets without
     * storing every wait time.
     */
    const buckets = await readBucketsForWindow(
      ctx,
      now,
      days,
      scopeKeysFor(scopeCompanyId as string | undefined),
    );
    const merged = mergeBucketsForWindow(buckets, now, days);

    const withinScope = <T extends { companyId?: Id<"companies"> }>(row: T) =>
      !scopeCompanyId || row.companyId === scopeCompanyId || row.companyId === undefined;

    const [decidedApprovals, pendingApprovals] = await Promise.all([
      Promise.all(
        DECIDED_STATUSES.map((status) =>
          ctx.db
            .query("agentRunApprovals")
            .withIndex("by_status_requested", (q) => q.eq("status", status).gte("requestedAt", since))
            .take(PER_STATUS_LIMIT),
        ),
      ),
      // Not bounded by the window. An approval raised two months ago and still
      // unanswered is the single most damning thing this screen can report, and
      // a window that hid it would be flattering the platform.
      ctx.db
        .query("agentRunApprovals")
        .withIndex("by_status_requested", (q) => q.eq("status", "PENDING"))
        .take(PER_STATUS_LIMIT),
    ]);
    const approvals = [...decidedApprovals.flat(), ...pendingApprovals].filter(withinScope);

    return {
      days,
      timeline: merged.timeline,
      runs: {
        total: merged.runsTotal,
        perDay: runsPerDay(merged.runsTotal, days),
        unfinished: merged.unfinished,
      },
      actions: merged.actions,
      oversight: summariseOversight(approvals),
      busiest: merged.busiest,
      truncated: merged.truncated,
    };
  },
});
