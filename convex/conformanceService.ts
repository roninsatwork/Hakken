/**
 * Whether an assistant is still doing what it was approved to do.
 *
 * The plan called this one out as needing design before it could be estimated,
 * so this is deliberately narrow rather than an attempt at everything. It
 * answers one question well: **does the behaviour match the classification?**
 *
 * A rating is a claim about what an assistant can do. An assistant rated low
 * risk that turns out to be sending email, spending money or writing outside
 * the platform is not misbehaving — it is misclassified, and the register is
 * saying something untrue about it. That is the drift worth catching, because
 * everything else on the governance screens is derived from the rating.
 *
 * What it deliberately does not attempt: judging whether an assistant's output
 * was good, whether it stayed on topic, or whether it followed its instructions.
 * Those need a model to decide and a model's opinion is not evidence. A
 * conformance check that produced arguable findings would train people to
 * ignore it.
 *
 * Kept free of database access so the thresholds are testable directly.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */

import type { AgentRiskLevel } from "./agentRiskService";

export type SideEffectLevel = "READ" | "WRITE" | "DESTRUCTIVE" | "EXTERNAL";

/**
 * The strongest thing each rating claims an assistant does.
 *
 * `LOW` reads and answers. `MEDIUM` changes things inside the platform.
 * `HIGH` reaches outside it or destroys things. The words match what the rating
 * picker offers, so the claim being checked is the one somebody actually made.
 */
const ALLOWED_BY_RATING: Record<AgentRiskLevel, SideEffectLevel[]> = {
  LOW: ["READ"],
  MEDIUM: ["READ", "WRITE"],
  HIGH: ["READ", "WRITE", "DESTRUCTIVE", "EXTERNAL"],
};

export type ConformanceFinding = {
  agentId: string;
  agentName: string;
  rating: AgentRiskLevel;
  /** What it actually did that its rating does not cover. */
  observed: SideEffectLevel[];
  /** The rating that would cover the behaviour. */
  suggested: AgentRiskLevel;
};

/** The weakest rating that covers everything observed. */
export function ratingFor(observed: SideEffectLevel[]): AgentRiskLevel {
  if (observed.some((level) => level === "DESTRUCTIVE" || level === "EXTERNAL")) return "HIGH";
  if (observed.some((level) => level === "WRITE")) return "MEDIUM";
  return "LOW";
}

/** What an assistant did that its rating does not account for. */
export function beyondRating(
  rating: AgentRiskLevel,
  observed: SideEffectLevel[],
): SideEffectLevel[] {
  const allowed = ALLOWED_BY_RATING[rating];
  return [...new Set(observed.filter((level) => !allowed.includes(level)))];
}

/**
 * Whether this assistant's rating still fits what it does.
 *
 * An unrated assistant produces no finding. Nobody has made a claim about it
 * yet, so there is nothing for the behaviour to contradict — the register
 * already reports it as unrated, and saying it twice would be noise.
 */
export function checkConformance(args: {
  agentId: string;
  agentName: string;
  rating: AgentRiskLevel | undefined;
  observed: SideEffectLevel[];
}): ConformanceFinding | null {
  if (!args.rating) return null;

  const beyond = beyondRating(args.rating, args.observed);
  if (beyond.length === 0) return null;

  return {
    agentId: args.agentId,
    agentName: args.agentName,
    rating: args.rating,
    observed: beyond,
    suggested: ratingFor(args.observed),
  };
}

/** Said the way a compliance officer would say it, not as a list of levels. */
export function describeFinding(finding: ConformanceFinding): string {
  const what = finding.observed
    .map((level) => {
      switch (level) {
        case "WRITE":
          return "changed things inside the platform";
        case "DESTRUCTIVE":
          return "deleted things";
        case "EXTERNAL":
          return "reached outside the platform";
        case "READ":
          return "read things";
      }
    })
    .join(", and ");

  return `${finding.agentName} is rated ${finding.rating.toLowerCase()} risk, but it ${what}. That is ${finding.suggested.toLowerCase()}-risk behaviour.`;
}
