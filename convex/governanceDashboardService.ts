/**
 * The standing view: what needs a person, right now.
 *
 * Built last on purpose. A dashboard drawn over an empty register is a
 * screenshot rather than a product, so this waited until the register filled
 * itself, ratings restrained something, and the evidence pack could leave the
 * building.
 *
 * Every figure here is a count of something a reader can go and look at. A
 * number with nothing behind it is decoration, and decoration on a compliance
 * screen is worse than a blank one — it suggests a check that nobody is doing.
 *
 * Kept free of database access so the thresholds and the wording can be tested
 * directly.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */

/**
 * Three states, and only one of them is a problem.
 *
 * `SETTLED` is not "good" — it is "nothing here needs you". The distinction
 * matters because a screen that shows everything as a status invites someone to
 * treat a settled row as an achievement rather than as silence.
 */
export type GovernanceState = "NEEDS_ATTENTION" | "SETTLED" | "NOT_SET_UP";

export type GovernanceCheck = {
  key: string;
  state: GovernanceState;
  /** The figure, when there is one. */
  count?: number;
  /** Where to go and look. Every check has one; a figure with nowhere to go is decoration. */
  href: string;
};

/** Records of this kind are expected to be kept for six months. */
export const EXPECTED_RETENTION_DAYS = 180;

/** How long an approval may sit before it stops being oversight and becomes a queue nobody reads. */
export const STALE_APPROVAL_DAYS = 7;

export function daysBetween(from: number, to: number): number {
  return Math.floor((to - from) / (24 * 60 * 60 * 1000));
}

/**
 * Retention across the pipelines, judged against what is expected.
 *
 * Purging switched off is `NOT_SET_UP` rather than a problem: keeping
 * everything forever breaks no obligation, and a platform that shouted about it
 * would be crying wolf. A pipeline switched *on* and set below six months is
 * the actual finding, because that one silently destroys records someone is
 * expected to still have.
 */
export function assessRetention(
  pipelines: Array<{ key: string; enabled: boolean; retentionDays: number }>,
): { state: GovernanceState; tooShort: string[] } {
  const enabled = pipelines.filter((pipeline) => pipeline.enabled);
  if (enabled.length === 0) return { state: "NOT_SET_UP", tooShort: [] };

  const tooShort = enabled
    .filter((pipeline) => pipeline.retentionDays < EXPECTED_RETENTION_DAYS)
    .map((pipeline) => pipeline.key);

  return { state: tooShort.length > 0 ? "NEEDS_ATTENTION" : "SETTLED", tooShort };
}

/** An approval waiting longer than a week is not oversight any more. */
export function countStaleApprovals(requestedAtTimes: number[], now: number): number {
  return requestedAtTimes.filter((at) => daysBetween(at, now) >= STALE_APPROVAL_DAYS).length;
}

/**
 * A count where zero is the good answer.
 *
 * Zero settles rather than disappearing: on a compliance screen, an absent row
 * and a row reading nought are different claims, and only one of them says a
 * check ran.
 */
export function countCheck(key: string, count: number, href: string): GovernanceCheck {
  return { key, count, state: count > 0 ? "NEEDS_ATTENTION" : "SETTLED", href };
}

/**
 * Where a reader should start.
 *
 * Ordered by what an auditor asks about first, not by size. An unrated estate
 * is the earliest question — until something is classified, nothing else on
 * this screen means very much.
 */
export function orderChecks(checks: GovernanceCheck[]): GovernanceCheck[] {
  const priority = [
    "unrated",
    "incomplete",
    "staleApprovals",
    "waitingApprovals",
    "unattendedHighRisk",
    "publicFacing",
    "retention",
  ];

  return [...checks].sort((a, b) => priority.indexOf(a.key) - priority.indexOf(b.key));
}

/** The one line at the top: is there anything to do, and how much. */
export function summariseDashboard(checks: GovernanceCheck[]): {
  attention: number;
  state: GovernanceState;
} {
  const attention = checks.filter((check) => check.state === "NEEDS_ATTENTION").length;

  return { attention, state: attention > 0 ? "NEEDS_ATTENTION" : "SETTLED" };
}
