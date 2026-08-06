/**
 * What a risk rating actually does.
 *
 * The point of Phase 2 is that a rating restrains the platform rather than
 * describing it. A high-risk assistant requires a person in the loop because it
 * is high risk, not because someone remembered to leave the approval switch
 * alone — and switching that off is refused rather than silently honoured.
 *
 * Skills already carry `LOW`/`MEDIUM`/`HIGH`, so this copies a pattern the
 * platform already reads rather than inventing a second vocabulary.
 *
 * Kept free of database access so the rules are testable on their own.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */

export type AgentRiskLevel = "LOW" | "MEDIUM" | "HIGH";

/** Every rating, weakest first. The order the screens offer them in. */
export const AGENT_RISK_LEVELS: readonly AgentRiskLevel[] = ["LOW", "MEDIUM", "HIGH"];

/**
 * Ratings that force a person into the loop.
 *
 * A list rather than a comparison, so adding a rating later fails safe: a level
 * nobody has classified does not silently become permissive.
 */
const RATINGS_REQUIRING_APPROVAL: readonly AgentRiskLevel[] = ["HIGH"];

export function requiresHumanApproval(risk: AgentRiskLevel | undefined): boolean {
  return risk !== undefined && RATINGS_REQUIRING_APPROVAL.includes(risk);
}

/**
 * Whether this assistant may run without a person, given how it is rated.
 *
 * `undefined` risk is deliberately permitted to run unattended. Everything that
 * predates the register is unrated, and refusing to run it would have switched
 * off working assistants across the platform the moment this shipped — a
 * classification scheme should not break what it has not yet classified.
 */
export function refusalForAutonomy(args: {
  risk: AgentRiskLevel | undefined;
  autonomous: boolean | undefined;
}): string | null {
  if (args.autonomous !== true) return null;
  if (!requiresHumanApproval(args.risk)) return null;

  return "This assistant is rated high risk, so a person has to approve what it does. Lower its risk rating first, or leave human approval switched on.";
}

/**
 * The rating an assistant ends up with after a change, given what was sent.
 *
 * A field that was not sent leaves the existing rating alone; the screens send
 * only what they show.
 */
export function resolveRisk(
  sent: AgentRiskLevel | undefined,
  existing: AgentRiskLevel | undefined,
): AgentRiskLevel | undefined {
  return sent ?? existing;
}

/**
 * Whether the autonomy setting has to be forced back on the way in.
 *
 * Raising an assistant to high risk while it is running unattended is not an
 * error — it is the most useful thing a compliance officer can do — so the
 * rating wins and the gate closes, rather than the change being refused.
 */
export function autonomyAfterRiskChange(args: {
  risk: AgentRiskLevel | undefined;
  autonomous: boolean | undefined;
}): boolean | undefined {
  if (requiresHumanApproval(args.risk) && args.autonomous === true) return false;
  return args.autonomous;
}

/** What an audit record needs to say about a rating change. */
export function describeRiskChange(args: {
  from: AgentRiskLevel | undefined;
  to: AgentRiskLevel | undefined;
  gateClosed: boolean;
}): string {
  const from = args.from ?? "unrated";
  const to = args.to ?? "unrated";
  const change = `Risk rating changed from ${from.toLowerCase()} to ${to.toLowerCase()}.`;

  return args.gateClosed
    ? `${change} Human approval was switched back on, because a high-risk assistant cannot run unattended.`
    : change;
}
