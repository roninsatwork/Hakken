import { v, type Infer } from "convex/values";

/**
 * What a press is doing right now, saved as it happens and read by the eye's panel (Anthony, 2026-11-04: "this text is
 * static and most ai engines say things like researching, writing response, calculating. Can we get it to show what the
 * AI is doing"). Each stage is one real thing the run does (`seesAskActions.writeBubble`), named when it starts, never a
 * timer guessing at it: a stage a press doesn't go through is never shown. The words are the panel's, in the reader's
 * language (`ui.hakkenSees.working` and `worked`).
 *
 * - `reading`: the page's own figures; `count` says how many.
 * - `finding`: code looks through them for what stands out; `count` says how many things it found.
 * - `weighing`: the checker (Jev) puts them in order, leaving out the obvious. Only where it is switched on.
 * - `screens`: the writer reads the website's other screens; `count` says how many so far.
 * - `writing`: the writer writes.
 * - `checking`: the Editor's code checks every figure and word.
 * - `guessing`: the checker reads the words for a guess stated as fact. Only where it is switched on.
 * - `rewriting`: the words failed a check, so the writer writes them again.
 */
export const seesStageValidator = v.union(
  v.literal("reading"),
  v.literal("finding"),
  v.literal("weighing"),
  v.literal("screens"),
  v.literal("writing"),
  v.literal("checking"),
  v.literal("guessing"),
  v.literal("rewriting"),
);

export const seesStageRowValidator = v.object({ stage: seesStageValidator, count: v.optional(v.number()) });

export type SeesStage = Infer<typeof seesStageValidator>;
export type SeesStageRow = Infer<typeof seesStageRowValidator>;
/** Says a press has moved on. It never fails the press: a stage that can't be saved only goes unseen. */
export type SeesStageNote = (stage: SeesStage, count?: number) => Promise<void>;

/**
 * The list with a new stage on it: the last line's count brought up to date when the stage is still the same, a new line
 * when it has moved on, so a stage the run comes back to (checking, after a rewrite) is shown each time it happens.
 */
export function withStage(stages: readonly SeesStageRow[], stage: SeesStage, count?: number): SeesStageRow[] {
  const row: SeesStageRow = { stage, ...(count !== undefined ? { count } : {}) };
  return stages[stages.length - 1]?.stage === stage ? [...stages.slice(0, -1), row] : [...stages, row];
}
