/**
 * How a smoke eval is graded, and by whom.
 *
 * Two things were wrong with the previous arrangement, and the second is the
 * one that matters.
 *
 * The grader was the same model that produced the answer — a model marking its
 * own homework. Models are measurably poor at this: they favour their own
 * output, and a model that has just confidently asserted something wrong is the
 * least likely thing to notice. An eval graded that way tells you the model is
 * self-consistent, which is not what anybody wanted to know.
 *
 * The rest of this module keeps the grading contract in one testable place, so
 * a grade that cannot be read is a failure rather than an accidental pass.
 */

export type GraderSelection = {
  /** The model that will grade. */
  modelId: string;
  /**
   * Whether the grader is a different model from the one under test.
   *
   * Recorded rather than assumed. A deployment with one enabled model cannot
   * have an independent grader, and the honest response is to say the grade is
   * weaker — not to refuse to run, and certainly not to pretend.
   */
  independent: boolean;
};

/**
 * Choose who grades.
 *
 * Prefers an explicitly configured grading model, then any other enabled model,
 * and only falls back to the model under test when the deployment has nothing
 * else to offer.
 */
export function selectGraderModel(args: {
  targetModelId: string;
  enabledModelIds: string[];
  preferredGraderModelId?: string;
}): GraderSelection {
  const preferred = args.preferredGraderModelId;
  if (preferred && preferred !== args.targetModelId && args.enabledModelIds.includes(preferred)) {
    return { modelId: preferred, independent: true };
  }

  const alternative = args.enabledModelIds.find((modelId) => modelId !== args.targetModelId);
  if (alternative) return { modelId: alternative, independent: true };

  return { modelId: args.targetModelId, independent: false };
}

export type GradeVerdict = {
  pass: boolean;
  reason: string;
  confidence?: number;
};

export function buildGradingPrompt(args: {
  objective: string;
  expectedFinalOutputRubric: string;
  modelOutput: string;
}) {
  return [
    "You are grading another AI agent's answer against a rubric.",
    "You did not write the answer. Judge it strictly on whether it satisfies the rubric.",
    "Return strict JSON only with this shape:",
    "{\"pass\": boolean, \"reason\": string, \"confidence\": number}",
    "",
    `Objective: ${args.objective}`,
    `Rubric: ${args.expectedFinalOutputRubric}`,
    `Agent output: ${args.modelOutput}`,
  ].join("\n");
}

/**
 * Read the grader's verdict.
 *
 * Anything unreadable is a failure, never a pass. A grade nobody can interpret
 * is not evidence that an agent works, and this result gates activation — so
 * the safe direction is unambiguous.
 */
export function parseGradeVerdict(output: string): GradeVerdict {
  const jsonMatch = output.trim().match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { pass: false, reason: "Grading response was not valid JSON." };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { pass: false, reason: "Grading response JSON was not an object." };
    }

    const result = parsed as { pass?: unknown; reason?: unknown; confidence?: unknown };
    return {
      // Strict equality: a grader replying "true", 1, or "yes" has not answered
      // the contract, and guessing its intent is how a wrong agent ships.
      pass: result.pass === true,
      reason: typeof result.reason === "string" && result.reason.trim().length > 0
        ? result.reason.trim()
        : "No grading reason provided.",
      confidence: typeof result.confidence === "number" && Number.isFinite(result.confidence)
        ? result.confidence
        : undefined,
    };
  } catch {
    return { pass: false, reason: "Grading response could not be parsed." };
  }
}

/**
 * Combine repeated samples of the same fixture into one verdict.
 *
 * A single sample of a non-deterministic system is weak evidence. Requiring
 * every sample to pass is deliberately strict: this gates whether an agent goes
 * live, and an agent that passes two times in three is an agent that fails one
 * conversation in three.
 */
export function combineGradeSamples(samples: GradeVerdict[]): GradeVerdict {
  if (samples.length === 0) {
    return { pass: false, reason: "No grading samples were produced." };
  }

  const failures = samples.filter((sample) => !sample.pass);
  if (failures.length === 0) {
    return {
      pass: true,
      reason: samples.length === 1
        ? samples[0].reason
        : `All ${samples.length} samples passed. ${samples[0].reason}`,
    };
  }

  return {
    pass: false,
    reason: `${failures.length} of ${samples.length} samples failed. ${failures[0].reason}`,
  };
}
