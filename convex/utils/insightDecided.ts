import { v } from "convex/values";

/**
 * The standard every Insights judgement is kept to (insights-one-voice-plan.md
 * phase 1; Anthony, 12 October 2026: "we need to bring the insights section up
 * to this same standard"): a rule makes the first pick, the Head of Strategy
 * hands it to its agent when the rule reads it anew, and what was decided is
 * kept once — who decided it and in which week, the agent's sentence why, and
 * the rule's reading it was decided on, so an unchanged item keeps its
 * decision rather than being asked again. Keyword cannibalisation was first
 * (utils/insightCompetingAgent.ts); Page decisions, Strategy's service calls
 * and the screens' boxes follow.
 */

export const DECIDERS = ["AGENT", "RULE"] as const;
export type Decider = (typeof DECIDERS)[number];
export const deciderValidator = v.union(...DECIDERS.map((decider) => v.literal(decider)));

/** The fields a judgement is kept with — optional, so one kept before the standard reads as the rule's. */
export const decidedFields = {
  decidedBy: v.optional(deciderValidator),
  decidedWeek: v.optional(v.string()),
  /** The agent's reason, in a sentence a client reads. */
  why: v.optional(v.string()),
  /** The rule's reading the decision was made on (`readingOf`). */
  signature: v.optional(v.string()),
};
export type Decided = { decidedBy?: Decider; decidedWeek?: string; why?: string; signature?: string };

/** Words an agent's reason may run to. */
export const MOST_WHY = 300;

/** An agent's reason as kept: trimmed and cut; nothing when it gave none. */
export function whyText(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, MOST_WHY) : "";
}

/** A short, stable reading of what the rule saw: the same parts, the same reading. */
export function readingOf(parts: ReadonlyArray<string | number | boolean | null | undefined>): string {
  const text = parts.map((part) => (part === null || part === undefined ? "" : String(part))).join("|");
  let hash = 5381;
  for (let at = 0; at < text.length; at += 1) hash = ((hash * 33) ^ text.charCodeAt(at)) >>> 0;
  return `${parts.length}.${hash.toString(36)}`;
}

/** Whether last week's decision stands: its agent decided it on the reading the rule makes again now. */
export function stillDecided(now: Pick<Decided, "signature">, before: Decided | undefined | null): boolean {
  return Boolean(before && before.decidedBy === "AGENT" && now.signature && before.signature === now.signature);
}
