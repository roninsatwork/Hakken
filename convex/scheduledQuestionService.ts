/**
 * Deciding whether an answer actually moved.
 *
 * A scheduled question is only useful if it stays quiet. The same question
 * asked twice never comes back byte-identical — the model rewords, reorders
 * and re-punctuates — so comparing raw strings would raise an alert every
 * single week and train everybody to ignore it.
 *
 * The comparison is therefore on the substance: lowercase, strip
 * punctuation, collapse whitespace. That still misses a genuine change
 * phrased identically in different words, and it will occasionally flag a
 * rewording that carries no new information. Both are stated here rather
 * than hidden, because the platform reports that the answer moved and lets
 * a person judge it, rather than judging it itself.
 *
 * Pure, so the rule can be tested without a model or a clock.
 */

/** Below this, two answers are treated as saying the same thing. */
export const ANSWER_CHANGE_THRESHOLD = 0.12;

export function normaliseAnswer(answer: string) {
  return answer
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * How different two answers are, from 0 (the same) to 1 (nothing in common).
 *
 * Word-set difference rather than edit distance: a model that reorders two
 * paragraphs has not changed its answer, and edit distance would say it had.
 */
export function measureAnswerChange(previous: string, next: string) {
  const before = new Set(normaliseAnswer(previous).split(" ").filter(Boolean));
  const after = new Set(normaliseAnswer(next).split(" ").filter(Boolean));

  if (before.size === 0 && after.size === 0) return 0;
  if (before.size === 0 || after.size === 0) return 1;

  let shared = 0;
  for (const word of after) {
    if (before.has(word)) shared += 1;
  }

  const union = new Set([...before, ...after]).size;
  return 1 - shared / union;
}

export function hasAnswerChanged(previous: string | undefined, next: string) {
  // Nothing to compare against on the first run: an answer arriving for the
  // first time is not a change, or every question would alert once for free.
  if (previous === undefined) return false;
  return measureAnswerChange(previous, next) >= ANSWER_CHANGE_THRESHOLD;
}

export const SCHEDULED_QUESTION_INTERVALS = ["daily", "weekly", "monthly"] as const;
export type ScheduledQuestionInterval = (typeof SCHEDULED_QUESTION_INTERVALS)[number];

export function isScheduledQuestionInterval(value: unknown): value is ScheduledQuestionInterval {
  return typeof value === "string" && (SCHEDULED_QUESTION_INTERVALS as readonly string[]).includes(value);
}
