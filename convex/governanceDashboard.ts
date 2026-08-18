import type { Id } from "./_generated/dataModel";
import { getActiveCompanyId } from "./authz";
import { governanceQuery } from "./tenantFunctions";
import { parsePurgePipelineConfig } from "./purgeScheduleService";
import {
  assessRetention,
  countCheck,
  countStaleApprovals,
  orderChecks,
  summariseDashboard,
  type GovernanceCheck,
} from "./governanceDashboardService";
import type { ConformanceFinding } from "./conformanceService";
import type { RiskMix } from "./governanceActivityService";
import { mergeEstateRows, scopeKeysFor } from "./governanceRollupService";

/**
 * What needs a person, right now.
 *
 * Reads the register rather than counting anything of its own, so the dashboard
 * and the register cannot disagree about the state of the estate — which is the
 * usual way a compliance screen starts lying.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */

/** Pending approvals are answered by people, so this is a backstop, not a working limit. */
const APPROVALS_LIMIT = 2000;

export type GovernanceDashboard = {
  /** Assistants doing more than their rating claims. */
  conformance: ConformanceFinding[];
  scope: "PLATFORM" | "WORKSPACE";
  attention: number;
  state: "NEEDS_ATTENTION" | "SETTLED" | "NOT_SET_UP";
  systems: number;
  /**
   * The estate by rating.
   *
   * The unrated count was already a check, but only as a figure in a box. Drawn
   * as a bar it is one solid block of grey, which says the thing the number
   * could not: nothing here has been classified at all.
   */
  riskMix: RiskMix;
  checks: GovernanceCheck[];
  /** Named pipelines set below the six months such records are expected to be kept. */
  retentionTooShort: string[];
};

export const getGovernanceDashboard = governanceQuery({
  args: {},
  handler: async (ctx): Promise<GovernanceDashboard> => {
    const platformWide = ctx.user.role === "SUPER_ADMIN" || ctx.user.role === "READ_ONLY";
    const scopeCompanyId = platformWide ? undefined : getActiveCompanyId(ctx.user);
    const keys = scopeKeysFor(scopeCompanyId as string | undefined);

    /**
     * The estate comes from the snapshot the cron keeps. This used to read
     * every agent, widget and workflow and walk the tool-call table backwards
     * with no index, on every visit and again on every change to any of them.
     * Approvals and the retention config stay live: the one is the "right
     * now" this screen exists for and both are small indexed reads.
     */
    const [estateRows, pendingApprovals, purgeConfig] = await Promise.all([
      ctx.db.query("governanceEstateRollups").collect(),
      ctx.db
        .query("agentRunApprovals")
        .withIndex("by_status_requested", (q) => q.eq("status", "PENDING"))
        .take(APPROVALS_LIMIT),
      ctx.db
        .query("systemConfig")
        .withIndex("by_key", (q) => q.eq("key", "PURGE_PIPELINES_CONFIG"))
        .first(),
    ]);

    const estate = mergeEstateRows(
      (keys ? estateRows.filter((row) => keys.includes(row.companyKey)) : estateRows).map((row) => ({
        companyKey: row.companyKey,
        systems: row.systems,
        riskMix: row.riskMix,
        unrated: row.unrated,
        incomplete: row.incomplete,
        publicFacing: row.publicFacing,
        unattendedHighRisk: row.unattendedHighRisk,
        conformance: row.conformance as ConformanceFinding[],
        isPartial: row.isPartial,
      })),
    );

    const withinScope = <T extends { companyId?: Id<"companies"> }>(row: T) =>
      !scopeCompanyId || row.companyId === scopeCompanyId || row.companyId === undefined;
    const scopedApprovals = pendingApprovals.filter(withinScope);
    const stale = countStaleApprovals(
      scopedApprovals.map((approval) => approval.requestedAt),
      Date.now(),
    );

    const pipelines = Object.entries(parsePurgePipelineConfig(purgeConfig?.value)).map(
      ([key, pipeline]) => ({ key, enabled: pipeline.enabled, retentionDays: pipeline.retentionDays }),
    );
    const retention = assessRetention(pipelines);

    const base = platformWide ? "/admin/governance" : "/app/governance";

    const checks: GovernanceCheck[] = orderChecks([
      countCheck("unrated", estate.unrated, `${base}/register`),
      countCheck("incomplete", estate.incomplete, `${base}/register`),
      countCheck("staleApprovals", stale, `${base}/approvals`),
      countCheck("waitingApprovals", scopedApprovals.length, `${base}/approvals`),
      // A high-risk system running unattended should be impossible now, so a
      // count above nought means something predates the rule rather than that
      // somebody switched it off.
      countCheck("unattendedHighRisk", estate.unattendedHighRisk, `${base}/register`),
      countCheck("conformance", estate.conformance.length, `${base}/register`),
      countCheck("publicFacing", estate.publicFacing, `${base}/register`),
      { key: "retention", state: retention.state, href: "/admin/settings?tab=purges" },
    ]);

    return {
      scope: platformWide ? "PLATFORM" : "WORKSPACE",
      ...summariseDashboard(checks),
      systems: estate.systems,
      riskMix: estate.riskMix,
      checks,
      conformance: estate.conformance,
      retentionTooShort: retention.tooShort,
    };
  },
});
