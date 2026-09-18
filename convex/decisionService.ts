/**
 * The rules of a Decision, with no I/O.
 *
 * A Decision is a named judgment the platform makes: a yes/no, a pick-one or a
 * score, answered by TypeSafe with a probability spread, or by the simple rule
 * the platform used before TypeSafe when the provider is off or unreachable.
 * This file holds everything about a Decision that can be decided without a
 * database or a network: how a probability becomes a certainty word, how a
 * mode and a stakes level turn that word into an outcome, and the shapes the
 * rest of the platform reads.
 *
 * See docs/plans/active/decisions-typesafe-plan.md, "Design commitments".
 */

/**
 * What an admin can set a Decision to.
 *
 * - `OFF`: the simple rule runs, TypeSafe is never asked, nothing changes
 *   from how the platform behaved before Decisions existed.
 * - `ASK_A_PERSON`: TypeSafe is asked, the answer is recorded, and every
 *   answer is handed to a person; nothing acts on its own.
 * - `ACT`: acts when sure enough for its stakes, otherwise hands over.
 */
export type DecisionMode = "OFF" | "ASK_A_PERSON" | "ACT";
export const DECISION_MODES: readonly DecisionMode[] = ["OFF", "ASK_A_PERSON", "ACT"];

/**
 * How much a wrong answer costs. `LOW` acts on *fairly sure*; `HIGH` acts
 * only on *sure*. Set per Decision in the registry, never on a screen.
 */
export type DecisionStakes = "LOW" | "HIGH";

/** The three words every screen uses. Never a number. */
export type CertaintyBand = "SURE" | "FAIRLY_SURE" | "NOT_SURE";

/**
 * What happened to a run.
 *
 * - `ACTED`: the caller went ahead on the answer without a person.
 * - `HANDED_TO_PERSON`: the answer became a task or a queue item.
 * - `RECORDED`: nothing to act on — the mode was `OFF` and the rule ran, or
 *   the answer was one on which no action hangs.
 */
export type DecisionOutcome = "ACTED" | "HANDED_TO_PERSON" | "RECORDED";

/**
 * Who answered: TypeSafe, an ordinary text model asked to estimate its own
 * certainty, or the platform's own rule.
 */
export type DecisionSource = "TYPESAFE" | "TEXT_MODEL" | "RULES";

/**
 * One answer in the platform's own words, whichever kind of question it was.
 * `probabilities` is absent when the rule answered: a rule has no spread, and
 * pretending it had one would let a screen draw certainty that does not exist.
 */
export type DecisionAnswer =
  | { kind: "yes-no"; yes: boolean; probability?: number }
  | { kind: "pick-one"; choice: string; probabilities?: Record<string, number> }
  | { kind: "score"; score: number; probabilities?: Record<string, number> };

/**
 * Certainty cut-offs. Starting values from the plan, to be validated on the
 * platform's own data as TypeSafe's docs insist; changing them here changes
 * every Decision at once, which is the point of having one place.
 */
export const SURE_THRESHOLD = 0.7;
export const FAIRLY_SURE_THRESHOLD = 0.4;
/**
 * A text model's certainty is its own estimate written down, not a measured
 * probability, so its word is worth a little less: the same three bands,
 * cut higher (Anthony's ruling, 2026-09-17: any model must be able to
 * answer a Decision).
 */
export const TEXT_MODEL_SURE_THRESHOLD = 0.85;
export const TEXT_MODEL_FAIRLY_SURE_THRESHOLD = 0.6;

type ModelPath = "TYPESAFE" | "TEXT_MODEL";

/**
 * A yes/no arrives as a probability of yes. Halfway is "no idea", either end
 * is certain, so certainty is the distance from the middle, doubled to run
 * 0..1. A yes at 0.92 and a no at 0.08 are equally sure.
 */
export function certaintyFromYesNoProbability(probabilityOfYes: number, path: ModelPath = "TYPESAFE"): CertaintyBand {
  const distance = Math.min(1, Math.abs(probabilityOfYes - 0.5) * 2);
  return bandFor(distance, path);
}

/**
 * A pick-one or a score arrives with TypeSafe's own `confidence`, a 0..1
 * summary of how concentrated the spread is. Used as-is.
 */
export function certaintyFromConfidence(confidence: number, path: ModelPath = "TYPESAFE"): CertaintyBand {
  return bandFor(Math.max(0, Math.min(1, confidence)), path);
}

function bandFor(value: number, path: ModelPath): CertaintyBand {
  const sure = path === "TEXT_MODEL" ? TEXT_MODEL_SURE_THRESHOLD : SURE_THRESHOLD;
  const fairly = path === "TEXT_MODEL" ? TEXT_MODEL_FAIRLY_SURE_THRESHOLD : FAIRLY_SURE_THRESHOLD;
  if (value >= sure) return "SURE";
  if (value >= fairly) return "FAIRLY_SURE";
  return "NOT_SURE";
}

/** The words the audit trail and the pill print. */
export function certaintyWords(band: CertaintyBand) {
  switch (band) {
    case "SURE":
      return "sure";
    case "FAIRLY_SURE":
      return "fairly sure";
    case "NOT_SURE":
      return "not sure";
  }
}

/**
 * Whether the caller may act on its own.
 *
 * Every cell of mode × certainty × stakes, in one place:
 *
 * | mode          | certainty     | LOW stakes | HIGH stakes |
 * | ------------- | ------------- | ---------- | ----------- |
 * | OFF           | (rule ran)    | rule       | rule        |
 * | ASK_A_PERSON  | any           | person     | person      |
 * | ACT           | SURE          | act        | act         |
 * | ACT           | FAIRLY_SURE   | act        | person      |
 * | ACT           | NOT_SURE      | person     | person      |
 *
 * `RULES` means the caller applies the rule's answer exactly as it always
 * did; the engine has no opinion on it. A rule's answer is never handed to a
 * person by this table, because the rule pre-dates the queue: the mailbox's
 * own `needsHuman` rule still files its task, but by its own logic.
 */
export type DecisionVerdict = "ACT" | "ASK_A_PERSON" | "RULES";

export function verdictFor(args: {
  mode: DecisionMode;
  certainty: CertaintyBand | null;
  stakes: DecisionStakes;
  source: DecisionSource;
}): DecisionVerdict {
  if (args.source === "RULES" || args.mode === "OFF" || args.certainty === null) return "RULES";
  if (args.mode === "ASK_A_PERSON") return "ASK_A_PERSON";
  if (args.certainty === "SURE") return "ACT";
  if (args.certainty === "FAIRLY_SURE" && args.stakes === "LOW") return "ACT";
  return "ASK_A_PERSON";
}

/**
 * The run row's outcome, from the verdict and whether the answer carries an
 * action at all. A verdict of ACT on an answer that changes nothing (a
 * customer email judged to be a customer email) is `RECORDED`, not `ACTED`:
 * the audit trail lists what changed, and nothing did.
 */
export function outcomeFor(args: { verdict: DecisionVerdict; actionable: boolean }): DecisionOutcome {
  // "This is a customer email" is not something to hand to a person either:
  // a queue of answers on which nothing hangs is noise, whatever the mode.
  if (!args.actionable) return "RECORDED";
  if (args.verdict === "ASK_A_PERSON") return "HANDED_TO_PERSON";
  if (args.verdict === "ACT") return "ACTED";
  return "RECORDED";
}

/** The certainty of an answer, or null when a rule gave it. */
export function certaintyOf(answer: DecisionAnswer, path: ModelPath = "TYPESAFE"): CertaintyBand | null {
  if (answer.kind === "yes-no") {
    return typeof answer.probability === "number"
      ? certaintyFromYesNoProbability(answer.probability, path)
      : null;
  }
  if (!answer.probabilities) return null;
  return certaintyFromConfidence(confidenceFromProbabilities(answer.probabilities), path);
}

/**
 * TypeSafe returns `confidence` alongside a spread; the rule path and the
 * tests build spreads by hand. When only the spread is to hand, the same
 * idea is used: the gap between the top probability and the runner-up. A
 * lone option at 1.0 is fully sure; two options at 0.5 are not sure at all.
 */
export function confidenceFromProbabilities(probabilities: Record<string, number>) {
  const sorted = Object.values(probabilities).sort((a, b) => b - a);
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return 1;
  return Math.max(0, Math.min(1, sorted[0] - sorted[1]));
}

/** A short, stable text of the answer for the run row and the audit line. */
export function answerText(answer: DecisionAnswer) {
  if (answer.kind === "yes-no") return answer.yes ? "yes" : "no";
  if (answer.kind === "pick-one") return answer.choice;
  return answer.score.toFixed(2);
}

/** The mode in words, for the audit trail; screens use the catalogue. */
export function modeWords(mode: DecisionMode | "FOLLOW_PLATFORM") {
  switch (mode) {
    case "OFF":
      return "Off";
    case "ASK_A_PERSON":
      return "Ask a person";
    case "ACT":
      return "Acts on its own";
    case "FOLLOW_PLATFORM":
      return "Follows the platform";
  }
}

/** Resolution order for a Decision's mode: company row → global row → default. */
export function resolveDecisionMode(args: {
  companyMode?: DecisionMode | null;
  globalMode?: DecisionMode | null;
  defaultMode: DecisionMode;
}): DecisionMode {
  return args.companyMode ?? args.globalMode ?? args.defaultMode;
}
