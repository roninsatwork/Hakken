import { v, type Infer } from "convex/values";

/**
 * Where an answer's time goes (docs/plans/active/assistant-foundation-plan.md,
 * speed S1, approved 2026-10-06): the moment an answer reaches each step,
 * written to the server log as one line when its run ends — milliseconds
 * since the question was saved. Nothing stored and nothing shown; the log is
 * read to find the slow step before anything is changed for speed.
 *
 * An answer runs in two workers, so the first one's steps ride to the second
 * as plain times. A step is kept the first time it is reached: a run that
 * calls a tool asks the model twice, and the first ask is the one a person
 * is waiting on.
 */

export const ANSWER_STEPS = [
  /** The Assistant's first worker started (`hakkenAssistant.answerInternal`). */
  "firstWorker",
  /** Its checks done — switched on, files read, a photo's model — and the question handed on. */
  "handedOn",
  /** The run's own worker started (`agentRuntime.runAgentObjective`). */
  "run",
  /** The safety check passed. */
  "safety",
  /** What the model is told, put together. */
  "instructions",
  /** The question turned into a search key. */
  "searchKey",
  /** The documents searched. */
  "documents",
  /** The wiki's pages picked and read. */
  "wiki",
  /** Helpful content searched. */
  "helpful",
  /** Everything read. */
  "reading",
  /** The model asked. */
  "modelStarted",
  /** Its first words streamed to the conversation. */
  "firstWords",
  /** The answer saved. */
  "done",
] as const;

export type AnswerStep = (typeof ANSWER_STEPS)[number];

export const carriedTimingValidator = v.object({
  receivedAt: v.number(),
  at: v.record(v.string(), v.number()),
});

export type CarriedTiming = Infer<typeof carriedTimingValidator>;

export type AnswerTiming = {
  mark: (step: AnswerStep) => void;
  /** The steps so far, for the next worker. */
  carry: () => CarriedTiming;
  /** The one log line, written when the run ends. */
  log: (threadId: string) => void;
};

export function answerTiming(
  carried: { receivedAt: number; at?: Record<string, number> },
  now: () => number = Date.now,
): AnswerTiming {
  const at: Record<string, number> = { ...carried.at };
  return {
    mark: (step) => {
      if (at[step] === undefined) at[step] = now();
    },
    carry: () => ({ receivedAt: carried.receivedAt, at: { ...at } }),
    log: (threadId) => {
      console.log(`Answer timing ${JSON.stringify(answerTimingLine(threadId, carried.receivedAt, at))}`);
    },
  };
}

/** The line's figures in step order: each step reached, in milliseconds since the question was saved. */
export function answerTimingLine(threadId: string, receivedAt: number, at: Record<string, number>) {
  const line: Record<string, string | number> = { threadId };
  for (const step of ANSWER_STEPS) {
    if (at[step] !== undefined) line[step] = at[step] - receivedAt;
  }
  return line;
}
